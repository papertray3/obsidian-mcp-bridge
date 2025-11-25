#!/usr/bin/env node

/**
 * Mycelium CLI - Scriptable interface to the orchestrator
 *
 * Commands:
 *   spawn <role> [--interactive] [--prompt "text"]  - Spawn a new agent
 *   send <job-id> <message>                         - Send message to running agent
 *   output <job-id>                                 - Get agent output
 *   list                                            - List running agents
 *   kill <job-id>                                   - Kill a running agent
 */

const ConfigLoader = require('./src/config-loader');
const ToolRegistry = require('./src/tool-registry');
const AgentManager = require('./src/agent-manager');
const path = require('path');

// Default vault path (can be overridden with --vault)
const DEFAULT_VAULT = 'C:\\Users\\sthat\\OneDrive\\Documents\\Obsidian\\DigitalGarden';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }

  const command = args[0];

  // Parse vault path
  let vaultPath = DEFAULT_VAULT;
  const vaultIndex = args.indexOf('--vault');
  if (vaultIndex !== -1 && args[vaultIndex + 1]) {
    vaultPath = args[vaultIndex + 1];
  }

  // Initialize orchestrator
  const configLoader = new ConfigLoader(vaultPath);
  const config = await configLoader.loadAll();
  const registry = new ToolRegistry(config);
  const agentManager = new AgentManager(vaultPath, registry);

  switch (command) {
    case 'spawn':
      await cmdSpawn(args.slice(1), agentManager);
      break;
    case 'send':
      await cmdSend(args.slice(1), agentManager);
      break;
    case 'output':
      await cmdOutput(args.slice(1), agentManager);
      break;
    case 'list':
      await cmdList(agentManager);
      break;
    case 'kill':
      await cmdKill(args.slice(1), agentManager);
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

async function cmdSpawn(args, agentManager) {
  const role = args[0];
  if (!role) {
    console.error('Usage: mycelium spawn <role> [--interactive] [--prompt "text"] [--job-id <id>]');
    process.exit(1);
  }

  const interactive = args.includes('--interactive');
  const promptIndex = args.indexOf('--prompt');
  const prompt = promptIndex !== -1 && args[promptIndex + 1] ? args[promptIndex + 1] : null;
  const jobIdIndex = args.indexOf('--job-id');
  const jobId = jobIdIndex !== -1 && args[jobIdIndex + 1] ? args[jobIdIndex + 1] : `${role}-${Date.now()}`;

  const jobConfig = {
    job_id: jobId,
    role: role,
    prompt: prompt,
    interactive: interactive
  };

  console.log(`🚀 Spawning agent...`);
  console.log(`   Role: ${role}`);
  console.log(`   Job ID: ${jobId}`);
  console.log(`   Interactive: ${interactive}`);
  if (prompt) console.log(`   Prompt: ${prompt}`);

  const agent = await agentManager.spawnAgent(jobConfig);

  console.log(`\n✅ Agent spawned successfully!`);
  console.log(`   Job ID: ${agent.job_id}`);
  console.log(`   PID: ${agent.process.pid}`);

  if (interactive) {
    console.log(`\nAgent is running in interactive mode. Use these commands:`);
    console.log(`   mycelium send ${agent.job_id} "your message"`);
    console.log(`   mycelium output ${agent.job_id}`);
    console.log(`   mycelium kill ${agent.job_id}`);
  }
}

async function cmdSend(args, agentManager) {
  const jobId = args[0];
  const message = args.slice(1).join(' ');

  if (!jobId || !message) {
    console.error('Usage: mycelium send <job-id> <message>');
    process.exit(1);
  }

  console.log(`📤 Sending to ${jobId}: "${message}"`);

  try {
    agentManager.sendToAgent(jobId, message);
    console.log(`✅ Message sent!`);
    console.log(`\nWait a moment, then check output:`);
    console.log(`   mycelium output ${jobId}`);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

async function cmdOutput(args, agentManager) {
  const jobId = args[0];

  if (!jobId) {
    console.error('Usage: mycelium output <job-id>');
    process.exit(1);
  }

  try {
    const output = agentManager.getAgentOutput(jobId);

    console.log(`📥 Output from ${jobId}:`);
    console.log('═'.repeat(60));

    if (output.output) {
      console.log('STDOUT:');
      console.log(output.output);
    }

    if (output.errors) {
      console.log('\nSTDERR:');
      console.log(output.errors);
    }

    if (!output.output && !output.errors) {
      console.log('(no output yet)');
    }

    console.log('═'.repeat(60));
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

async function cmdList(agentManager) {
  const agents = agentManager.listRunningAgents();

  if (agents.length === 0) {
    console.log('No running agents.');
    return;
  }

  console.log(`📋 Running agents (${agents.length}):\n`);

  agents.forEach(agent => {
    const startDate = new Date(agent.startTime);
    console.log(`   Job ID: ${agent.job_id}`);
    console.log(`   Role: ${agent.role}`);
    console.log(`   Status: ${agent.status}`);
    console.log(`   Started: ${startDate.toLocaleString()}`);
    console.log('   ─'.repeat(30));
  });
}

async function cmdKill(args, agentManager) {
  const jobId = args[0];

  if (!jobId) {
    console.error('Usage: mycelium kill <job-id>');
    process.exit(1);
  }

  console.log(`🔪 Killing agent ${jobId}...`);

  try {
    agentManager.killAgent(jobId);
    console.log(`✅ Agent terminated.`);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
Mycelium CLI - Multi-Agent Orchestration

Usage: mycelium <command> [options]

Commands:
  spawn <role> [options]     Spawn a new agent
    --interactive            Keep agent running for bidirectional communication
    --prompt "text"          Initial prompt to send
    --job-id <id>            Custom job ID (default: role-timestamp)
    --vault <path>           Vault path (default: DigitalGarden)

  send <job-id> <message>    Send message to running agent

  output <job-id>            Get agent output (stdout/stderr)

  list                       List all running agents

  kill <job-id>              Terminate a running agent

Examples:
  # Spawn interactive Claude agent
  mycelium spawn general-assistant --interactive --job-id claude-1

  # Send it a message
  mycelium send claude-1 "What is 2+2?"

  # Check response
  mycelium output claude-1

  # Kill it when done
  mycelium kill claude-1

  # One-shot execution
  mycelium spawn noir-writer --prompt "Write a dark scene"
  `);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
