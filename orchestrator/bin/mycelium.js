#!/usr/bin/env node

/**
 * Mycelium Orchestrator CLI
 *
 * Multi-agent workflow orchestration for Obsidian vaults
 */

const { Command } = require('commander');
const ConfigLoader = require('../src/config-loader');
const ToolRegistry = require('../src/tool-registry');
const AgentManager = require('../src/agent-manager');
const path = require('path');

const program = new Command();

program
  .name('mycelium')
  .description('Multi-agent workflow orchestration for Obsidian vaults')
  .version('0.1.0');

/**
 * Initialize orchestrator for a vault
 */
async function initOrchestrator(vaultPath) {
  // Resolve vault path
  const resolvedVaultPath = path.resolve(vaultPath);

  console.log(`Initializing Mycelium Orchestrator...`);
  console.log(`Vault: ${resolvedVaultPath}`);

  // Load configuration
  const configLoader = new ConfigLoader(resolvedVaultPath);
  const config = await configLoader.loadAll();

  // Create registry
  const registry = new ToolRegistry(config);

  // Create agent manager
  const agentManager = new AgentManager(resolvedVaultPath, registry);

  return {
    vaultPath: resolvedVaultPath,
    config,
    registry,
    agentManager
  };
}

/**
 * Get vault path from --vault flag or MYCELIUM_VAULT env var
 */
function getVaultPath(options) {
  const vaultPath = options.vault || process.env.MYCELIUM_VAULT;

  if (!vaultPath) {
    console.error('Error: Vault path not specified.');
    console.error('Use --vault flag or set MYCELIUM_VAULT environment variable.');
    process.exit(1);
  }

  return vaultPath;
}

/**
 * init command - Initialize config in vault
 */
program
  .command('init')
  .description('Initialize Mycelium configuration in vault')
  .option('--vault <path>', 'Path to Obsidian vault')
  .action(async (options) => {
    try {
      const vaultPath = getVaultPath(options);
      const orchestrator = await initOrchestrator(vaultPath);

      console.log('\n✓ Mycelium initialized successfully!');
      console.log(`\nConfiguration files created at:`);
      console.log(`  ${path.join(vaultPath, '.obsidian', 'mycelium')}`);
      console.log(`\nAvailable tools: ${orchestrator.registry.listTools().join(', ')}`);
      console.log(`Available roles: ${orchestrator.registry.listRoles().join(', ')}`);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

/**
 * run command - Run a single job
 */
program
  .command('run')
  .description('Run a single job')
  .option('--vault <path>', 'Path to Obsidian vault')
  .option('--role <name>', 'Role to use', 'general-assistant')
  .option('--prompt <text>', 'Prompt for the agent')
  .option('--output <path>', 'Output path (relative to vault)')
  .action(async (options) => {
    try {
      const vaultPath = getVaultPath(options);

      if (!options.prompt) {
        console.error('Error: --prompt is required');
        process.exit(1);
      }

      const orchestrator = await initOrchestrator(vaultPath);

      // Create job config
      const jobConfig = {
        job_id: `job-${Date.now()}`,
        role: options.role,
        prompt: options.prompt,
        output_path: options.output,
        onComplete: (result) => {
          console.log('\n✓ Job completed!');
          console.log(`Exit code: ${result.exitCode}`);
          console.log(`Duration: ${result.duration}ms`);
          if (result.output) {
            console.log('\nOutput:');
            console.log(result.output);
          }
          process.exit(result.exitCode);
        },
        onError: (result) => {
          console.error('\n✗ Job failed!');
          console.error(result.error);
          process.exit(1);
        }
      };

      console.log(`\nStarting job with role: ${options.role}`);
      console.log(`Prompt: ${options.prompt}\n`);

      // Spawn agent
      await orchestrator.agentManager.spawnAgent(jobConfig);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

/**
 * list command - List available tools/roles
 */
program
  .command('list')
  .description('List available tools, profiles, and roles')
  .option('--vault <path>', 'Path to Obsidian vault')
  .option('--type <type>', 'Type to list (tools, profiles, roles)', 'all')
  .action(async (options) => {
    try {
      const vaultPath = getVaultPath(options);
      const orchestrator = await initOrchestrator(vaultPath);

      const { registry } = orchestrator;

      if (options.type === 'all' || options.type === 'tools') {
        console.log('\nTools:');
        registry.listTools().forEach(tool => {
          const def = registry.getTool(tool);
          console.log(`  - ${tool}: ${def.description || def.command}`);
        });
      }

      if (options.type === 'all' || options.type === 'profiles') {
        console.log('\nProfiles:');
        registry.listProfiles().forEach(profile => {
          const def = registry.getProfile(profile);
          console.log(`  - ${profile}: ${def.model || 'N/A'}`);
        });
      }

      if (options.type === 'all' || options.type === 'roles') {
        console.log('\nRoles:');
        registry.listRoles().forEach(role => {
          const def = registry.getRole(role);
          console.log(`  - ${role}: ${def.tool} (${def.profile || 'no profile'})`);
        });
      }

      console.log('');
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

/**
 * test command - Test tool configuration
 */
program
  .command('test')
  .description('Test a tool configuration')
  .option('--vault <path>', 'Path to Obsidian vault')
  .option('--role <name>', 'Role to test', 'general-assistant')
  .action(async (options) => {
    try {
      const vaultPath = getVaultPath(options);
      const orchestrator = await initOrchestrator(vaultPath);

      console.log(`\nTesting role: ${options.role}\n`);

      // Validate role
      const validation = orchestrator.registry.validateRole(options.role);
      if (!validation.valid) {
        console.error('✗ Role validation failed:', validation.error);
        process.exit(1);
      }

      // Resolve configuration
      const config = orchestrator.registry.resolveRoleConfig(options.role);

      console.log('✓ Role configuration resolved:\n');
      console.log(JSON.stringify(config, null, 2));

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Parse command line
program.parse();
