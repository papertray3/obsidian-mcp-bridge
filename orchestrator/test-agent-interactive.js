#!/usr/bin/env node

/**
 * Interactive Test Agent
 * Reads from stdin, processes messages, writes to stdout
 * Demonstrates bidirectional communication capability
 */

const readline = require('readline');

console.log('[INTERACTIVE AGENT] Starting...');
console.log('[INTERACTIVE AGENT] Ready for messages. Send "exit" to quit.\n');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false  // Don't treat as TTY
});

let messageCount = 0;

// Process each line from stdin
rl.on('line', (line) => {
  messageCount++;
  const message = line.trim();

  console.log(`\n[AGENT] Received message #${messageCount}: "${message}"`);

  // Check for exit signal
  if (message.toLowerCase() === 'exit' || message.toLowerCase() === 'quit') {
    console.log('[AGENT] Exit signal received. Shutting down...');
    process.exit(0);
  }

  // Generate response based on message
  let response;
  if (message.toLowerCase().includes('hello') || message.toLowerCase().includes('hi')) {
    response = `Hello! I'm an interactive agent. This is response #${messageCount}.`;
  } else if (message.toLowerCase().includes('garden')) {
    response = `Digital gardens are fascinating spaces for growing knowledge. (Response #${messageCount})`;
  } else if (message.toLowerCase().includes('moon')) {
    response = `The moon silently watches over all our digital gardens. (Response #${messageCount})`;
  } else if (message.toLowerCase().includes('purpose')) {
    response = `My purpose is to demonstrate bidirectional agent communication. (Response #${messageCount})`;
  } else {
    response = `I received your message: "${message}". This is response #${messageCount}.`;
  }

  // Send response
  console.log(`[AGENT] Sending response: ${response}\n`);
});

// Handle stdin close
rl.on('close', () => {
  console.log('\n[AGENT] Stdin closed. Exiting...');
  process.exit(0);
});

// Keep process alive
process.stdin.resume();
