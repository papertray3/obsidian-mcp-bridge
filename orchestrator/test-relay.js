#!/usr/bin/env node

/**
 * Message Relay to Interactive Agent
 * Spawns agent, sends message, gets response
 */

const ConfigLoader = require('./src/config-loader');
const ToolRegistry = require('./src/tool-registry');
const AgentManager = require('./src/agent-manager');

const vaultPath = process.argv[2];
const message = process.argv[3];

if (!vaultPath || !message) {
  console.error('Usage: node test-relay.js <vault-path> <message>');
  process.exit(1);
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('📡 Spawning interactive agent...\n');

  // Load configuration
  const configLoader = new ConfigLoader(vaultPath);
  const config = await configLoader.loadAll();
  const registry = new ToolRegistry(config);
  const agentManager = new AgentManager(vaultPath, registry);

  // Spawn agent
  const jobConfig = {
    job_id: `relay-${Date.now()}`,
    role: 'interactive-assistant',
    prompt: null,
    interactive: true
  };

  const agent = await agentManager.spawnAgent(jobConfig);

  // Wait for agent to initialize
  await wait(1000);

  console.log(`✅ Agent ready! (Job ID: ${agent.job_id})`);
  console.log(`\n📤 Sending your message: "${message}"\n`);

  // Send message
  agentManager.sendToAgent(jobConfig.job_id, message);

  // Wait for response
  let lastOutputLength = 0;
  let attempts = 0;
  const maxAttempts = 20;

  while (attempts < maxAttempts) {
    await wait(500);
    attempts++;

    const output = agentManager.getAgentOutput(jobConfig.job_id);
    const fullOutput = output.output;

    if (fullOutput.length > lastOutputLength) {
      const newOutput = fullOutput.substring(lastOutputLength).trim();
      lastOutputLength = fullOutput.length;

      if (newOutput) {
        console.log('📥 Agent Response:');
        console.log('─'.repeat(50));
        console.log(newOutput);
        console.log('─'.repeat(50));
        break;
      }
    }
  }

  // Clean up
  await wait(500);
  agentManager.killAgent(jobConfig.job_id);
  console.log('\n✅ Session complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
