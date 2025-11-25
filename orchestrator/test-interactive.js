#!/usr/bin/env node

/**
 * Interactive Agent Test
 * Tests bidirectional communication with a spawned agent
 */

const PathTranslator = require('./src/path-translator');
const ConfigLoader = require('./src/config-loader');
const ToolRegistry = require('./src/tool-registry');
const AgentManager = require('./src/agent-manager');

const vaultPath = process.argv[2] || process.env.MYCELIUM_VAULT;
if (!vaultPath) {
  console.error('Error: No vault path specified');
  console.error('Usage: node test-interactive.js <vault-path>');
  process.exit(1);
}

console.log('=== Interactive Agent Test ===');
console.log(`Vault: ${vaultPath}\n`);

// Main async function
async function main() {
  // Load configuration
  const configLoader = new ConfigLoader(vaultPath);
  const config = await configLoader.loadAll();
  const registry = new ToolRegistry(config);  // Pass the whole config object
  const agentManager = new AgentManager(vaultPath, registry);

  // Debug: log what roles are loaded
  console.log('Loaded roles:', Object.keys(config.roles.roles));

  // Spawn interactive agent
  const jobConfig = {
    job_id: `test-interactive-${Date.now()}`,
    role: 'noir-writer',  // Use noir-writer which we know works
    prompt: null,  // No initial prompt
    interactive: true  // INTERACTIVE MODE
  };

  console.log('Spawning interactive agent...\n');

  const agent = await agentManager.spawnAgent(jobConfig);
  console.log(`Agent spawned! Job ID: ${agent.job_id}`);
  console.log('Agent is ready for interaction.\n');
  console.log('=== Instructions ===');
  console.log('I will relay messages between you and the agent.');
  console.log('Tell me what to send, and I\'ll show you the responses.');
  console.log('Say "exit" when you want to stop.\n');

  // Export agent manager for external use
  global.testAgent = {
    jobId: agent.job_id,
    manager: agentManager,

    send: function(message) {
      console.log(`\n>>> Sending to agent: "${message}"`);
      agentManager.sendToAgent(this.jobId, message);
    },

    getOutput: function() {
      const output = agentManager.getAgentOutput(this.jobId);
      return output;
    },

    exit: function() {
      console.log('\n>>> Sending exit signal...');
      agentManager.killAgent(this.jobId);
      console.log('Agent terminated.');
      process.exit(0);
    }
  };

  console.log('Test agent available as global.testAgent');
  console.log('Use: testAgent.send("your message")');
  console.log('Use: testAgent.getOutput()');
  console.log('Use: testAgent.exit()');
}

main().catch(err => {
  console.error('Error spawning agent:', err);
  process.exit(1);
});
