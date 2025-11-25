/**
 * Create Note from FileClass
 *
 * Creates a new note with proper frontmatter based on Metadata Menu fileClass definitions.
 * Resolves inheritance chains and initializes all fields with appropriate defaults.
 */

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content) {
	const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
	const match = content.match(frontmatterRegex);

	if (!match) {
		return null;
	}

	const yamlContent = match[1];

	// Simple YAML parser (handles the fileClass schema structure)
	const lines = yamlContent.split('\n');
	const result = {};
	let currentKey = null;
	let currentArray = null;
	let currentObject = null;
	let indent = 0;

	for (const line of lines) {
		if (!line.trim()) continue;

		const lineIndent = line.search(/\S/);

		// Array item
		if (line.trim().startsWith('- ')) {
			const content = line.trim().substring(2);

			// Check if it's a key-value pair
			if (content.includes(':')) {
				const [key, value] = content.split(':').map(s => s.trim());

				if (!currentArray) {
					currentArray = [];
					result[currentKey] = currentArray;
				}

				if (!currentObject || lineIndent <= indent) {
					currentObject = {};
					currentArray.push(currentObject);
					indent = lineIndent;
				}

				currentObject[key] = parseValue(value);
			} else {
				// Simple array item
				if (!currentArray) {
					currentArray = [];
					result[currentKey] = currentArray;
				}
				currentArray.push(parseValue(content));
			}
		}
		// Key-value pair
		else if (line.includes(':')) {
			const [key, ...valueParts] = line.split(':');
			const trimmedKey = key.trim();
			const value = valueParts.join(':').trim();

			if (lineIndent === 0) {
				// Top-level key
				currentKey = trimmedKey;
				currentArray = null;
				currentObject = null;

				if (value) {
					result[trimmedKey] = parseValue(value);
				}
			} else if (currentObject && lineIndent > indent) {
				// Nested property in array object
				currentObject[trimmedKey] = parseValue(value);
			} else if (currentKey) {
				// Nested property in top-level object
				if (!result[currentKey] || typeof result[currentKey] !== 'object' || Array.isArray(result[currentKey])) {
					result[currentKey] = {};
				}
				result[currentKey][trimmedKey] = parseValue(value);
			}
		}
	}

	return result;
}

/**
 * Parse a YAML value to appropriate JavaScript type
 */
function parseValue(value) {
	if (!value || value === '""' || value === "''") return '';
	if (value === 'true') return true;
	if (value === 'false') return false;
	if (value === 'null') return null;
	if (/^\d+$/.test(value)) return parseInt(value);
	if (/^\d+\.\d+$/.test(value)) return parseFloat(value);

	// Remove quotes
	if ((value.startsWith('"') && value.endsWith('"')) ||
	    (value.startsWith("'") && value.endsWith("'"))) {
		return value.slice(1, -1);
	}

	return value;
}

/**
 * Load and parse a fileClass definition
 */
async function loadFileClassSchema(app, fileClass) {
	const classPath = `_Admin/Classes/${fileClass}.md`;
	const file = app.vault.getAbstractFileByPath(classPath);

	if (!file) {
		throw new Error(`FileClass "${fileClass}" not found at ${classPath}`);
	}

	const content = await app.vault.read(file);
	const schema = parseFrontmatter(content);

	if (!schema) {
		throw new Error(`Failed to parse frontmatter from ${classPath}`);
	}

	return schema;
}

/**
 * Resolve the complete field list including inherited fields
 */
async function resolveInheritance(app, fileClass, visited = new Set()) {
	// Prevent circular inheritance
	if (visited.has(fileClass)) {
		throw new Error(`Circular inheritance detected: ${fileClass}`);
	}
	visited.add(fileClass);

	const schema = await loadFileClassSchema(app, fileClass);
	let allFields = schema.fields || [];

	// Recursively load parent class fields
	if (schema.extends) {
		const parentFields = await resolveInheritance(app, schema.extends, visited);

		// Parent fields come first, child fields override
		const fieldMap = new Map();

		// Add parent fields
		for (const field of parentFields) {
			fieldMap.set(field.name, field);
		}

		// Add/override with child fields
		for (const field of allFields) {
			fieldMap.set(field.name, field);
		}

		allFields = Array.from(fieldMap.values());
	}

	return allFields;
}

/**
 * Get default value for a field based on its type
 */
function getDefaultValue(field) {
	const type = field.type;

	switch (type) {
		case 'Input':
		case 'Select':
			return '';

		case 'Number':
			return 0;

		case 'Boolean':
			return false;

		case 'Date':
		case 'DateTime':
			// Return empty string - user can set to current date if needed
			return '';

		case 'Multi':
		case 'MultiFile':
			return [];

		case 'File':
			return '';

		case 'Formula':
			// Don't set formulas - they're calculated
			return null;

		case 'Object':
			// Create nested object structure
			const obj = {};
			if (field.options && field.options.fields) {
				for (const subField of field.options.fields) {
					const defaultVal = getDefaultValue(subField);
					if (defaultVal !== null) {
						obj[subField.name] = defaultVal;
					}
				}
			}
			return obj;

		default:
			return '';
	}
}

/**
 * Generate frontmatter object from fields
 */
function generateFrontmatter(fields, fileClass, initialValues = {}) {
	const frontmatter = {
		fileClass: fileClass
	};

	for (const field of fields) {
		const fieldName = field.name;

		// Skip if path indicates nested field (will be handled by parent Object field)
		if (field.path && field.path !== '') {
			continue;
		}

		// Check if user provided an initial value
		if (initialValues.hasOwnProperty(fieldName)) {
			frontmatter[fieldName] = initialValues[fieldName];
		} else {
			const defaultValue = getDefaultValue(field);
			if (defaultValue !== null) {
				frontmatter[fieldName] = defaultValue;
			}
		}
	}

	// Add any extra initial values not in schema
	for (const [key, value] of Object.entries(initialValues)) {
		if (!frontmatter.hasOwnProperty(key)) {
			frontmatter[key] = value;
		}
	}

	return frontmatter;
}

/**
 * Determine the appropriate file path for the new note
 */
function determinePath(app, fileClass, title, userPath) {
	if (userPath) {
		// User specified a path
		if (!userPath.endsWith('.md')) {
			userPath += '.md';
		}
		return userPath;
	}

	// Sanitize title for use in filename
	const sanitizedTitle = title.replace(/[<>:"/\\|?*]/g, '');

	// Default: create in sowing (seed) stage
	// User can move with Auto Note Mover by adding appropriate tags
	const defaultPath = `Notes/00_Sowing/${sanitizedTitle}.md`;

	return defaultPath;
}

/**
 * Convert frontmatter object to YAML string
 */
function frontmatterToYAML(frontmatter, indent = 0) {
	const lines = [];
	const spaces = ' '.repeat(indent);

	for (const [key, value] of Object.entries(frontmatter)) {
		if (value === null || value === undefined) {
			continue;
		}

		if (Array.isArray(value)) {
			if (value.length === 0) {
				lines.push(`${spaces}${key}: []`);
			} else {
				lines.push(`${spaces}${key}:`);
				for (const item of value) {
					if (typeof item === 'object' && !Array.isArray(item)) {
						lines.push(`${spaces}  -`);
						const subLines = frontmatterToYAML(item, indent + 4);
						lines.push(subLines);
					} else {
						lines.push(`${spaces}  - ${formatValue(item)}`);
					}
				}
			}
		} else if (typeof value === 'object') {
			lines.push(`${spaces}${key}:`);
			const subLines = frontmatterToYAML(value, indent + 2);
			lines.push(subLines);
		} else {
			lines.push(`${spaces}${key}: ${formatValue(value)}`);
		}
	}

	return lines.join('\n');
}

/**
 * Format a value for YAML output
 */
function formatValue(value) {
	if (typeof value === 'string') {
		// Quote strings that contain special characters or are empty
		if (value === '' || /[:#\[\]{}|>]/.test(value) || value.includes('\n')) {
			return `"${value.replace(/"/g, '\\"')}"`;
		}
		return value;
	}

	if (typeof value === 'boolean') {
		return value ? 'true' : 'false';
	}

	if (typeof value === 'number') {
		return value.toString();
	}

	return value;
}

/**
 * Load template content if available
 */
async function loadTemplate(app, fileClass) {
	const templatePath = `_Admin/Templates/${fileClass}.md`;
	const file = app.vault.getAbstractFileByPath(templatePath);

	if (!file) {
		return null;
	}

	const content = await app.vault.read(file);

	// Extract body content (after frontmatter)
	const frontmatterRegex = /^---\n[\s\S]*?\n---\n/;
	const body = content.replace(frontmatterRegex, '').trim();

	return body;
}

/**
 * Main execution function
 */
module.exports = {
	async execute(params, context) {
		const { app } = context;
		const { fileClass, title, path: userPath, initialValues = {} } = params;

		try {
			// Step 1: Resolve inheritance and load complete field list
			const fields = await resolveInheritance(app, fileClass);

			// Step 2: Generate frontmatter
			const frontmatter = generateFrontmatter(fields, fileClass, initialValues);

			// Step 3: Determine file path
			const filePath = determinePath(app, fileClass, title, userPath);

			// Step 4: Check if file already exists
			const existingFile = app.vault.getAbstractFileByPath(filePath);
			if (existingFile) {
				throw new Error(`File already exists: ${filePath}`);
			}

			// Step 5: Load template if available
			const templateBody = await loadTemplate(app, fileClass);

			// Step 6: Build file content
			const yamlContent = frontmatterToYAML(frontmatter);
			let fileContent = `---\n${yamlContent}\n---\n\n`;

			if (templateBody) {
				fileContent += templateBody + '\n';
			} else {
				// Add a basic heading
				fileContent += `# ${title}\n\n`;
			}

			// Step 7: Create the file
			await app.vault.create(filePath, fileContent);

			return {
				success: true,
				filePath: filePath,
				frontmatter: frontmatter
			};

		} catch (error) {
			return {
				success: false,
				error: error.message,
				filePath: null,
				frontmatter: null
			};
		}
	}
};
