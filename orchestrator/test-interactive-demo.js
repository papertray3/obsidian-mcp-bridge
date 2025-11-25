#!/usr/bin/env node

/**
 * Interactive Agent Demo
 * Demonstrates bidirectional communication with a spawned agent
 */

const PathTranslator = require('./src/path-translator');
const ConfigLoader = require('./src/config-loader');
const ToolRegistry = require('./src/tool-registry');
const AgentManager = require('./src/agent-manager');

const vaultPath = process.argv[2] || process.env.MYCELIUM_VAULT;
if (!vaultPath) {
  console.error('Error: No vault path specified');
  console.error('Usage: node test-interactive-demo.js <vault-path>');
  process.exit(1);
}

console.log('=== Interactive Agent Demo ===');
console.log(`Vault: ${vaultPath}\n`);

// Helper to wait
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main async function
async function main() {
  // Load configuration
  const configLoader = new ConfigLoader(vaultPath);
  const config = await configLoader.loadAll();
  const registry = new ToolRegistry(config);
  const agentManager = new AgentManager(vaultPath, registry);

  console.log('Spawning interactive agent...\n');

  // Spawn interactive agent
  const jobConfig = {
    job_id: `demo-${Date.now()}`,
    role: 'interactive-assistant',  // Uses custom interactive test agent
    prompt: null,
    interactive: true
  };

  const agent = await agentManager.spawnAgent(jobConfig);
  console.log(`Agent spawned! Job ID: ${agent.job_id}\n`);
  console.log('=== Beginning Communication Test ===\n');

  // Test messages to send
  const messages = [
    'Write a very short noir description of a digital garden (2 sentences max)',
    'Now write one sentence about the moon',
    'What is your purpose?'
  ];

  // Track output position
  let lastOutputLength = 0;

  // Send each message and wait for response
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    console.log(`\n[Round ${i + 1}]`);
    console.log(`You: ${message}`);
    console.log('Sending to agent...');

    // Send message to agent
    agentManager.sendToAgent(jobConfig.job_id, message);

    // Wait for response (poll for output)
    let responseReceived = false;
    let attempts = 0;
    const maxAttempts = 40;  // 20 seconds max

    while (!responseReceived && attempts < maxAttempts) {
      await wait(500);
      attempts++;

      const output = agentManager.getAgentOutput(jobConfig.job_id);
      const fullOutput = output.output + output.errors;

      if (fullOutput.length > lastOutputLength) {
        const newOutput = fullOutput.substring(lastOutputLength).trim();
        lastOutputLength = fullOutput.length;

        if (newOutput) {
          console.log(`\nAgent: ${newOutput}`);
          responseReceived = true;
        }
      }
    }

    if (!responseReceived) {
      console.log('(No response received within timeout)');
    }

    // Wait a bit between messages
    await wait(1000);
  }

  console.log('\n\n=== Communication Test Complete ===');

  // Get final stats before killing agent
  const finalOutput = agentManager.getAgentOutput(jobConfig.job_id);
  console.log('\n=== Final Stats ===');
  console.log(`Total output: ${finalOutput.output.length} chars`);
  console.log(`Total errors: ${finalOutput.errors.length} chars`);

  console.log('\nTerminating agent...');
  agentManager.killAgent(jobConfig.job_id);

  await wait(1000);
  console.log('\nDemo complete!');

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
