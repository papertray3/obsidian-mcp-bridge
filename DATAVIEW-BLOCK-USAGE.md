# Using run_dataview_block

## Overview
The `run_dataview_block` and `extract_dataview_blocks` tools let you execute individual Dataview queries without rendering entire dashboards.

## Why Use This?

**Problems it solves:**
- 📉 Avoid pulling 50KB+ dashboards when you only need one table
- ⚡ Faster execution (run specific queries, not whole notes)
- 🎯 Extract structured data directly
- 🔍 Test queries before adding to notes

## Basic Usage

### Execute a Dataview Query (DQL)

```
Use run_dataview_block with:
- flavor: "dataview"
- source: "TABLE file.ctime, file.mtime FROM #project"
```

**Response:**
```json
{
  "success": true,
  "renderedMarkdown": "| File | Created | Modified |\n|------|---------|----------|\n...",
  "elapsedMs": 42
}
```

### Execute a DataviewJS Script

```
Use run_dataview_block with:
- flavor: "dataviewjs"
- source: "dv.list(dv.pages('#project').map(p => p.file.name))"
```

**Response:**
```json
{
  "success": true,
  "renderedMarkdown": "- Project A\n- Project B\n- Project C\n",
  "renderedHtml": "<ul><li>Project A</li><li>Project B</li><li>Project C</li></ul>",
  "elapsedMs": 56
}
```

### With Execution Context

Provide `filepath` to set the context for `this.file` and `dv.current()`:

```
Use run_dataview_block with:
- filepath: "Notes/Projects/MyProject.md"
- flavor: "dataviewjs"
- source: "dv.paragraph(dv.current().project)"
```

The query will execute as if it's inside that file.

### With Input Data (DataviewJS)

Pass data to DataviewJS scripts:

```
Use run_dataview_block with:
- flavor: "dataviewjs"
- source: "dv.list(input.items)"
- input: {"items": ["Apple", "Banana", "Orange"]}
```

The `input` variable will be available in the script.

## Finding Queries in Notes

### Extract All Dataview Blocks

```
Use extract_dataview_blocks with filepath: "Notes/Dashboards/🔎Garden Dashboard.md"
```

**Response:**
```json
{
  "success": true,
  "blocks": [
    {
      "flavor": "dataview",
      "source": "TABLE file.ctime, file.mtime FROM #project",
      "lineStart": 10,
      "lineEnd": 10
    },
    {
      "flavor": "dataviewjs",
      "source": "dv.list(dv.pages('#project').map(p => p.file.name))",
      "lineStart": 25,
      "lineEnd": 25
    }
  ]
}
```

### Workflow: Extract → Execute

```
1. Extract blocks from a dashboard
2. Pick the block you want
3. Execute it with run_dataview_block using the source
```

## Error Handling

### Dataview Not Available
```json
{
  "success": false,
  "elapsedMs": 0,
  "errors": ["Dataview plugin is not available or not enabled"]
}
```

**Solution:** Install and enable Dataview plugin

### Invalid Query
```json
{
  "success": false,
  "elapsedMs": 12,
  "errors": ["Query execution failed: Unexpected token 'FROOM'"]
}
```

**Solution:** Fix the query syntax

### Context File Not Found
```json
{
  "success": false,
  "elapsedMs": 1,
  "errors": ["Context file not found: Invalid/Path.md"]
}
```

**Solution:** Verify filepath is correct

## Use Cases

### 1. Extract Project List
```
Extract blocks from "Notes/Dashboards/🔎Garden Dashboard.md",
find the project list query, then execute it
```

### 2. Test Query Before Adding
```
Test this query: "TABLE file.name, file.size FROM #tech WHERE file.size > 1000"
using run_dataview_block before adding to a note
```

### 3. Get Structured Data
```
Run this DataviewJS:
"dv.pages('#project').map(p => ({ name: p.file.name, status: p.status }))"
and return as JSON for processing
```

### 4. Dynamic Query Generation
```
Build a query based on user input, then execute it with run_dataview_block
```

## Comparison Table

| Feature | run_dataview_block | render_note_dg_compiled | dataview_query (existing) |
|---------|-------------------|-------------------------|---------------------------|
| Execute single query | ✅ Yes | ❌ No (full note) | ✅ Yes |
| Return structured data | ✅ Yes | ❌ No (full HTML) | ✅ Yes |
| Supports DataviewJS | ✅ Yes | ✅ Yes | ❌ No |
| Requires context file | ⚠️ Optional | ✅ Yes | ⚠️ Optional |
| Cache support | ❌ No | ✅ Yes | ❌ No |
| Speed | ⚡ Fast (50-100ms) | 🐢 Slower (2-3s first) | ⚡ Fast (50-100ms) |

## Advanced Usage

### Chaining Queries
```
1. Run first query to get file list
2. Use results to generate second query
3. Execute second query with run_dataview_block
```

### Custom Context
```
Create a temporary context by specifying any file as the execution context,
even if the query isn't actually in that file
```

### Input Processing
```
Pass complex objects to DataviewJS:
{
  "filters": {"status": "active", "priority": "high"},
  "groupBy": "category"
}
```

## Performance Tips

1. **Extract once, execute many** - Use extract_dataview_blocks to get all queries, then cache the list
2. **Minimize context** - Only provide filepath when needed for `this.file` references
3. **Simple queries** - DQL queries are faster than DataviewJS
4. **Batch operations** - Run multiple queries in parallel if they're independent

## Troubleshooting

### Query works in Obsidian but fails via MCP
- Check if query uses `app` or other Obsidian-specific APIs not available in execution context
- Verify Dataview plugin version matches expectations
- Try adding explicit context filepath

### Results differ from in-note rendering
- Ensure you're providing the correct filepath for context
- Check if query depends on note-specific metadata
- Verify Dataview plugin settings match your vault

### DataviewJS returns HTML but no Markdown
- This is expected - HTML conversion is basic
- Use `renderedHtml` for full output
- Consider writing DQL queries instead for better markdown output

## Related Tools

- `render_note_dg_compiled` - Full note rendering with caching
- `dataview_query` - Execute DQL queries (legacy, simpler)
- `get_note_raw` - Extract query source from notes
- `extract_dataview_blocks` - Find all queries in a note

## Examples

### Example 1: Extract Table from Dashboard
```
1. extract_dataview_blocks from "Notes/Dashboards/🔎Garden Dashboard.md"
2. Find the "project status" table block
3. run_dataview_block with that source
4. Parse the markdown table for processing
```

### Example 2: Test New Query
```
run_dataview_block with:
- flavor: "dataview"
- source: "LIST FROM #new-tag WHERE file.ctime > date(today) - dur(7 days)"
```

### Example 3: Dynamic Report
```
run_dataview_block with:
- flavor: "dataviewjs"
- source: "dv.table(['Name', 'Status'], dv.pages(input.filter).map(p => [p.file.name, p.status]))"
- input: {"filter": "#project AND !#archived"}
```

## Next Steps

After implementation testing, these tools will be available in your AI workflows for efficient data extraction from your vault.
