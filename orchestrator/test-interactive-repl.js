#!/usr/bin/env node

/**
 * Interactive Agent REPL
 * Provides a terminal interface to communicate with a spawned agent
 */

const readline = require('readline');
const PathTranslator = require('./src/path-translator');
const ConfigLoader = require('./src/config-loader');
const ToolRegistry = require('./src/tool-registry');
const AgentManager = require('./src/agent-manager');

const vaultPath = process.argv[2] || process.env.MYCELIUM_VAULT;
if (!vaultPath) {
  console.error('Error: No vault path specified');
  console.error('Usage: node test-interactive-repl.js <vault-path>');
  process.exit(1);
}

console.log('=== Interactive Agent REPL ===');
console.log(`Vault: ${vaultPath}\n`);

// Main async function
async function main() {
  // Load configuration
  const configLoader = new ConfigLoader(vaultPath);
  const config = await configLoader.loadAll();
  const registry = new ToolRegistry(config);
  const agentManager = new AgentManager(vaultPath, registry);

  console.log('Available roles:', Object.keys(config.roles.roles).join(', '));
  console.log('\nSpawning interactive agent...\n');

  // Spawn interactive agent
  const jobConfig = {
    job_id: `interactive-repl-${Date.now()}`,
    role: 'noir-writer',  // Using codex agent for interactive mode
    prompt: null,
    interactive: true
  };

  const agent = await agentManager.spawnAgent(jobConfig);
  console.log(`\nAgent spawned! Job ID: ${agent.job_id}`);
  console.log('\n=== Interactive Session Started ===');
  console.log('Type your messages and press Enter to send to the agent.');
  console.log('Type "exit" to quit.\n');

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'You> '
  });

  // Buffer for agent output
  let lastOutputLength = 0;

  // Poll agent output periodically
  const outputPoller = setInterval(() => {
    const output = agentManager.getAgentOutput(jobConfig.job_id);
    const fullOutput = output.output + output.errors;

    // Only display new output
    if (fullOutput.length > lastOutputLength) {
      const newOutput = fullOutput.substring(lastOutputLength);
      lastOutputLength = fullOutput.length;

      // Clear current line and display agent output
      process.stdout.write('\r\x1b[K');  // Clear line
      console.log('\nAgent>', newOutput);
      rl.prompt();
    }
  }, 500);  // Check every 500ms

  // Handle user input
  rl.on('line', (line) => {
    const message = line.trim();

    if (message.toLowerCase() === 'exit') {
      console.log('\nTerminating agent...');
      agentManager.killAgent(jobConfig.job_id);
      clearInterval(outputPoller);
      rl.close();

      // Give a moment for cleanup
      setTimeout(() => {
        console.log('Session ended.');
        process.exit(0);
      }, 1000);
      return;
    }

    if (message) {
      // Send message to agent
      try {
        agentManager.sendToAgent(jobConfig.job_id, message);
        console.log(`[Sent to agent: "${message}"]`);
      } catch (error) {
        console.error('Error sending message:', error.message);
      }
    }

    rl.prompt();
  });

  rl.on('close', () => {
    clearInterval(outputPoller);
    console.log('\nREPL closed.');
    process.exit(0);
  });

  // Start the prompt
  rl.prompt();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
