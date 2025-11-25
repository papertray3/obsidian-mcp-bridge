/**
 * Agent Manager - Spawns and manages AI agent processes
 *
 * Handles process spawning, stdin/stdout communication, and lifecycle management.
 */

const { spawn } = require('child_process');
const PathTranslator = require('./path-translator');

class AgentManager {
  constructor(vaultPath, registry) {
    this.vaultPath = vaultPath;
    this.registry = registry;
    this.pathTranslator = new PathTranslator(vaultPath);
    this.runningAgents = new Map();
  }

  /**
   * Spawn an agent for a job
   */
  async spawnAgent(jobConfig) {
    const { role, job_id, prompt, output_path, interactive } = jobConfig;

    // Resolve full configuration
    const config = this.registry.resolveRoleConfig(role, jobConfig);

    // Get tool definition
    const tool = config.tool;

    // Translate vault path for tool
    const vaultPath = this.pathTranslator.getVaultPathForTool(tool);

    // Build command arguments
    const args = this.buildAgentArgs(tool, config, {
      vaultPath,
      prompt,
      output_path,
      interactive
    });

    console.log(`Spawning agent for job ${job_id}:`);
    console.log(`  Tool: ${tool.name}`);
    console.log(`  Command: ${tool.command} ${args.join(' ')}`);
    console.log(`  Role: ${role}`);

    // Determine if we need shell for Windows .cmd/.ps1 files
    const needsShell = tool.command.endsWith('.cmd') || tool.command.endsWith('.ps1');

    // Spawn the process
    const agentProcess = spawn(tool.command, args, {
      env: {
        ...process.env,
        ...tool.env,
        VAULT_PATH: vaultPath,
        JOB_ID: job_id
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: needsShell  // Only for .cmd/.ps1 files on Windows
    });

    // Track the agent
    const agent = {
      job_id,
      process: agentProcess,
      config,
      startTime: Date.now(),
      output: [],
      errors: []
    };

    this.runningAgents.set(job_id, agent);

    // Set up event handlers
    this.setupAgentHandlers(agent, jobConfig);

    // Close stdin for non-interactive agents (prevents them from waiting for input)
    // For interactive agents, keep stdin open for bidirectional communication
    if (agentProcess.stdin && !interactive) {
      agentProcess.stdin.end();
    }

    return agent;
  }

  /**
   * Build command line arguments for agent
   */
  buildAgentArgs(tool, config, context) {
    const args = [...tool.args];

    // Tool-specific argument handling
    if (tool.name === 'claude') {
      // Claude CLI specific arguments
      // Only use --print for non-interactive mode
      if (!context.interactive) {
        args.push('--print');
      }

      if (config.model) {
        args.push('--model', config.model);
      }

      if (config.system_prompt) {
        args.push('--system-prompt', config.system_prompt);
      }

      // Prompt goes as final positional argument (only for non-interactive)
      if (context.prompt && !context.interactive) {
        args.push(context.prompt);
      }
    } else if (tool.name === 'codex') {
      // Codex CLI specific arguments
      args.push('exec'); // Non-interactive mode

      if (config.model) {
        args.push('--model', config.model);
      }

      // Working directory (vault path)
      if (context.vaultPath) {
        args.push('-C', context.vaultPath);
      }

      // Prompt goes as final positional argument
      if (context.prompt) {
        args.push(context.prompt);
      }
    } else {
      // Generic tool arguments (for test-agent, codex, etc.)

      // For tools that accept --vault
      if (context.vaultPath) {
        args.push('--vault', context.vaultPath);
      }

      // For tools that accept model specification
      if (config.model) {
        args.push('--model', config.model);
      }

      // For tools that accept temperature
      if (config.temperature !== undefined) {
        args.push('--temperature', String(config.temperature));
      }

      // For tools that accept prompt
      if (context.prompt) {
        args.push('--prompt', context.prompt);
      }
    }

    return args;
  }

  /**
   * Set up event handlers for agent process
   */
  setupAgentHandlers(agent, jobConfig) {
    const { process: agentProcess, job_id } = agent;

    // Capture stdout
    agentProcess.stdout.on('data', (data) => {
      const output = data.toString();
      agent.output.push(output);
      console.log(`[${job_id}] ${output}`);
    });

    // Capture stderr
    agentProcess.stderr.on('data', (data) => {
      const error = data.toString();
      agent.errors.push(error);
      console.error(`[${job_id}] ERROR: ${error}`);
    });

    // Handle process exit
    agentProcess.on('exit', (code) => {
      agent.exitCode = code;
      agent.endTime = Date.now();
      agent.duration = agent.endTime - agent.startTime;

      console.log(`[${job_id}] Exited with code ${code} (${agent.duration}ms)`);

      // Call completion callback if provided
      if (jobConfig.onComplete) {
        jobConfig.onComplete({
          job_id,
          exitCode: code,
          output: agent.output.join(''),
          errors: agent.errors.join(''),
          duration: agent.duration
        });
      }

      // Remove from running agents after a delay (to allow result retrieval)
      setTimeout(() => {
        this.runningAgents.delete(job_id);
      }, 60000); // Keep for 1 minute
    });

    // Handle process errors
    agentProcess.on('error', (error) => {
      console.error(`[${job_id}] Process error:`, error);
      agent.errors.push(error.message);

      if (jobConfig.onError) {
        jobConfig.onError({
          job_id,
          error: error.message
        });
      }
    });
  }

  /**
   * Send input to agent's stdin
   */
  sendToAgent(job_id, message) {
    const agent = this.runningAgents.get(job_id);
    if (!agent) {
      throw new Error(`Agent not found: ${job_id}`);
    }

    agent.process.stdin.write(message + '\n');
  }

  /**
   * Get agent status
   */
  getAgentStatus(job_id) {
    const agent = this.runningAgents.get(job_id);
    if (!agent) {
      return { status: 'not_found' };
    }

    return {
      status: agent.exitCode !== undefined ? 'completed' : 'running',
      job_id: agent.job_id,
      startTime: agent.startTime,
      endTime: agent.endTime,
      duration: agent.duration,
      exitCode: agent.exitCode,
      outputLines: agent.output.length,
      errorLines: agent.errors.length
    };
  }

  /**
   * Get agent output
   */
  getAgentOutput(job_id) {
    const agent = this.runningAgents.get(job_id);
    if (!agent) {
      throw new Error(`Agent not found: ${job_id}`);
    }

    return {
      output: agent.output.join(''),
      errors: agent.errors.join('')
    };
  }

  /**
   * Kill a running agent
   */
  killAgent(job_id) {
    const agent = this.runningAgents.get(job_id);
    if (!agent) {
      throw new Error(`Agent not found: ${job_id}`);
    }

    agent.process.kill();
    this.runningAgents.delete(job_id);
  }

  /**
   * List all running agents
   */
  listRunningAgents() {
    return Array.from(this.runningAgents.values()).map(agent => ({
      job_id: agent.job_id,
      role: agent.config.role,
      startTime: agent.startTime,
      status: agent.exitCode !== undefined ? 'completed' : 'running'
    }));
  }
}

module.exports = AgentManager;
