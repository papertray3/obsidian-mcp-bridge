#!/usr/bin/env node

/**
 * Single-process Claude interactive session test
 * Spawns Claude, sends message, captures response
 */

const ConfigLoader = require('./src/config-loader');
const ToolRegistry = require('./src/tool-registry');
const AgentManager = require('./src/agent-manager');

const vaultPath = 'C:\\Users\\sthat\\OneDrive\\Documents\\Obsidian\\DigitalGarden';
const message = process.argv[2];

if (!message) {
  console.error('Usage: node test-claude-session.js <message>');
  console.error('Example: node test-claude-session.js "How big is the moon?"');
  process.exit(1);
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('📡 Starting interactive Claude session...\n');

  // Initialize orchestrator
  const configLoader = new ConfigLoader(vaultPath);
  const config = await configLoader.loadAll();
  const registry = new ToolRegistry(config);
  const agentManager = new AgentManager(vaultPath, registry);

  // Spawn Claude in interactive mode
  const jobConfig = {
    job_id: `claude-${Date.now()}`,
    role: 'general-assistant',
    prompt: null,
    interactive: true
  };

  console.log('🚀 Spawning Claude agent...');
  const agent = await agentManager.spawnAgent(jobConfig);
  console.log(`✅ Claude spawned (Job ID: ${agent.job_id}, PID: ${agent.process.pid})\n`);

  // Wait for Claude to initialize
  console.log('⏳ Waiting for Claude to initialize (3 seconds)...\n');
  await wait(3000);

  // Send your message
  console.log(`📤 YOU: "${message}"\n`);
  agentManager.sendToAgent(jobConfig.job_id, message);

  // Poll for response
  console.log('⏳ Waiting for Claude response...\n');
  let lastOutputLength = 0;
  let attempts = 0;
  const maxAttempts = 60;
  let gotResponse = false;

  while (attempts < maxAttempts) {
    await wait(500);
    attempts++;

    const output = agentManager.getAgentOutput(jobConfig.job_id);
    const fullOutput = output.output;

    if (fullOutput.length > lastOutputLength) {
      const newOutput = fullOutput.substring(lastOutputLength);
      lastOutputLength = fullOutput.length;

      if (newOutput.trim()) {
        console.log('📥 CLAUDE AGENT:');
        console.log('═'.repeat(70));
        console.log(newOutput.trim());
        console.log('═'.repeat(70));
        console.log(`\n✓ Response received after ${attempts * 0.5} seconds`);
        gotResponse = true;
        break;
      }
    }

    // Show errors
    if (output.errors && output.errors.length > 0) {
      console.log('\n⚠️  Errors from agent:');
      console.log(output.errors);
    }

    // Progress
    if (attempts % 10 === 0) {
      console.log(`  ... still waiting (${attempts * 0.5}s) ...`);
    }
  }

  if (!gotResponse) {
    console.log('\n❌ No response within timeout.\n');
    console.log('Full captured output:');
    console.log('─'.repeat(70));
    const output = agentManager.getAgentOutput(jobConfig.job_id);
    console.log('STDOUT:', output.output || '(empty)');
    console.log('STDERR:', output.errors || '(empty)');
    console.log('─'.repeat(70));
  }

  // Cleanup
  console.log('\n🧹 Terminating agent...');
  agentManager.killAgent(jobConfig.job_id);
  console.log('✅ Session complete.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
