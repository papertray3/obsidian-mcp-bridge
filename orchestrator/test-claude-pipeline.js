#!/usr/bin/env node

/**
 * Test Claude CLI with pipeline-style input
 * Send message, CLOSE stdin, capture response
 */

const ConfigLoader = require('./src/config-loader');
const ToolRegistry = require('./src/tool-registry');
const AgentManager = require('./src/agent-manager');

const vaultPath = 'C:\\Users\\sthat\\OneDrive\\Documents\\Obsidian\\DigitalGarden';
const message = process.argv[2];

if (!message) {
  console.error('Usage: node test-claude-pipeline.js <message>');
  console.error('Example: node test-claude-pipeline.js "How big is the moon?"');
  process.exit(1);
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('📡 Testing Claude with pipeline-style input...\n');

  const configLoader = new ConfigLoader(vaultPath);
  const config = await configLoader.loadAll();
  const registry = new ToolRegistry(config);
  const agentManager = new AgentManager(vaultPath, registry);

  // Spawn Claude WITHOUT interactive flag (so stdin gets closed by default)
  const jobConfig = {
    job_id: `claude-pipeline-${Date.now()}`,
    role: 'general-assistant',
    prompt: message,  // Pass as prompt, not via stdin
    interactive: false  // This will close stdin and use --print
  };

  console.log('🚀 Spawning Claude with prompt...');
  const agent = await agentManager.spawnAgent(jobConfig);
  console.log(`✅ Claude spawned (Job ID: ${agent.job_id}, PID: ${agent.process.pid})\n`);

  console.log(`📤 Prompt: "${message}"\n`);
  console.log('⏳ Waiting for response...\n');

  // Poll for response
  let lastOutputLength = 0;
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    await wait(500);
    attempts++;

    const output = agentManager.getAgentOutput(jobConfig.job_id);
    const fullOutput = output.output;

    if (fullOutput.length > lastOutputLength) {
      const newOutput = fullOutput.substring(lastOutputLength);
      lastOutputLength = fullOutput.length;

      if (newOutput.trim()) {
        console.log('📥 CLAUDE RESPONSE:');
        console.log('═'.repeat(70));
        console.log(newOutput.trim());
        console.log('═'.repeat(70));
        console.log(`\n✓ Response received after ${attempts * 0.5} seconds`);

        // Wait a bit more to see if there's more output
        await wait(1000);
        const finalOutput = agentManager.getAgentOutput(jobConfig.job_id);
        if (finalOutput.output.length > fullOutput.length) {
          console.log(finalOutput.output.substring(fullOutput.length));
        }

        console.log('\n✅ Test complete!\n');
        process.exit(0);
      }
    }

    // Show errors
    if (output.errors && output.errors.length > 0) {
      console.log('\n⚠️  Errors:');
      console.log(output.errors);
    }

    // Progress
    if (attempts % 10 === 0) {
      console.log(`  ... waiting (${attempts * 0.5}s) ...`);
    }
  }

  console.log('\n❌ Timeout\n');
  const output = agentManager.getAgentOutput(jobConfig.job_id);
  console.log('STDOUT:', output.output || '(empty)');
  console.log('STDERR:', output.errors || '(empty)');
  process.exit(1);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
