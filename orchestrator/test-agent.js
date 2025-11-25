#!/usr/bin/env node

/**
 * Simple test agent for validating orchestrator
 * Echoes back the arguments it receives
 */

console.log('Test Agent Started');
console.log('Arguments received:', process.argv.slice(2).join(' '));
console.log('');

// Extract vault and prompt from args
const vaultIndex = process.argv.indexOf('--vault');
const modelIndex = process.argv.indexOf('--model');
const tempIndex = process.argv.indexOf('--temperature');

if (vaultIndex !== -1) {
  console.log(`Vault: ${process.argv[vaultIndex + 1]}`);
}

if (modelIndex !== -1) {
  console.log(`Model: ${process.argv[modelIndex + 1]}`);
}

if (tempIndex !== -1) {
  console.log(`Temperature: ${process.argv[tempIndex + 1]}`);
}

console.log('');
console.log('Generating output...');

// Simulate some work
setTimeout(() => {
  console.log('');
  console.log('=== OUTPUT ===');
  console.log('Digital notes bloom');
  console.log('Knowledge interconnects—');
  console.log('A garden of thought');
  console.log('=== END ===');

  process.exit(0);
}, 2000);
