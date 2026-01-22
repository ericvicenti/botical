/**
 * Exe.dev Service
 *
 * Provides integration with exe.dev lightweight VMs via their SSH-based API.
 * Wraps the exe.dev CLI commands (ssh exe.dev ...) and parses JSON responses.
 *
 * Key commands:
 * - ls --json: List VMs
 * - new --json: Create VM
 * - rm <name>: Delete VM
 * - restart <name>: Restart VM
 *
 * For running commands inside VMs, we use: ssh <vmname>.exe.xyz <command>
 */

import { spawn } from "bun";

export interface ExeVM {
  name: string;
  status: "running" | "stopped" | "creating" | "unknown";
  created?: string;
  image?: string;
  cpus?: number;
  memory?: string;
  disk?: string;
  url?: string;
}

export interface ExeCommandResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
}

/**
 * Run an exe.dev CLI command
 */
async function runExeCommand(args: string[], timeout = 30000): Promise<ExeCommandResult> {
  try {
    const proc = spawn(["ssh", "exe.dev", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Command timed out")), timeout);
    });

    const result = await Promise.race([
      (async () => {
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;
        return { stdout, stderr, exitCode };
      })(),
      timeoutPromise,
    ]);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr || undefined,
      exitCode: result.exitCode,
    };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "Unknown error",
      exitCode: -1,
    };
  }
}

/**
 * Run a command inside an exe.dev VM
 *
 * Commands are executed via: ssh exe.dev ssh <vmname> -- <command>
 * The -- separator ensures command flags aren't interpreted by exe.dev's ssh.
 */
async function runVMCommand(
  vmName: string,
  command: string,
  timeout = 60000
): Promise<ExeCommandResult> {
  try {
    // Route through exe.dev's ssh command: ssh exe.dev ssh <vmname> -- <command>
    // The -- ensures flags in the command aren't parsed by exe.dev
    const proc = spawn([
      "ssh",
      "exe.dev",
      "ssh",
      vmName,
      "--",
      command
    ], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Command timed out")), timeout);
    });

    const result = await Promise.race([
      (async () => {
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;
        return { stdout, stderr, exitCode };
      })(),
      timeoutPromise,
    ]);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr || undefined,
      exitCode: result.exitCode,
    };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "Unknown error",
      exitCode: -1,
    };
  }
}

/**
 * Parse exe.dev VM list from JSON output
 *
 * Expected format from `ssh exe.dev ls --json`:
 * {"vms":[{"image":"boldsoftware/exeuntu","ssh_dest":"name.exe.xyz","status":"running","vm_name":"name"}]}
 */
function parseVMList(jsonOutput: string): ExeVM[] {
  try {
    const data = JSON.parse(jsonOutput);
    // Handle both array format and object with vms property
    const vms = Array.isArray(data) ? data : data.vms || data.machines || [];
    return vms.map((vm: Record<string, unknown>) => {
      // exe.dev uses vm_name as the primary field
      const name = String(vm.vm_name || vm.name || vm.id || "unknown");
      const sshDest = vm.ssh_dest ? String(vm.ssh_dest) : `${name}.exe.xyz`;
      return {
        name,
        status: parseStatus(vm.status as string),
        created: vm.created ? String(vm.created) : undefined,
        image: vm.image ? String(vm.image) : undefined,
        cpus: typeof vm.cpus === "number" ? vm.cpus : undefined,
        memory: vm.memory ? String(vm.memory) : undefined,
        disk: vm.disk ? String(vm.disk) : undefined,
        url: vm.https_url ? String(vm.https_url) : `https://${sshDest.replace('.exe.xyz', '')}.exe.xyz`,
      };
    });
  } catch {
    return [];
  }
}

function parseStatus(status: string | undefined): ExeVM["status"] {
  if (!status) return "unknown";
  const lower = status.toLowerCase();
  if (lower.includes("running") || lower === "up") return "running";
  if (lower.includes("stopped") || lower === "down") return "stopped";
  if (lower.includes("creating") || lower.includes("starting")) return "creating";
  return "unknown";
}

/**
 * Parse single VM from JSON output (for new command)
 *
 * Expected format from `ssh exe.dev new --json`:
 * {"vm_name":"name","ssh_command":"ssh name.exe.xyz","ssh_dest":"name.exe.xyz",
 *  "ssh_port":22,"https_url":"https://name.exe.xyz","proxy_port":8000,...}
 */
function parseVM(jsonOutput: string): ExeVM | null {
  try {
    const data = JSON.parse(jsonOutput);
    // Could be the VM directly or wrapped
    const vm = data.vm || data.machine || data;
    // exe.dev uses vm_name as the primary field
    const name = vm.vm_name || vm.name || vm.id;
    if (!name) return null;
    return {
      name: String(name),
      status: vm.status ? parseStatus(vm.status as string) : "running", // New VMs default to running
      created: vm.created ? String(vm.created) : undefined,
      image: vm.image ? String(vm.image) : undefined,
      cpus: typeof vm.cpus === "number" ? vm.cpus : undefined,
      memory: vm.memory ? String(vm.memory) : undefined,
      disk: vm.disk ? String(vm.disk) : undefined,
      url: vm.https_url ? String(vm.https_url) : `https://${name}.exe.xyz`,
    };
  } catch {
    return null;
  }
}

export const ExeService = {
  /**
   * List all VMs
   */
  async listVMs(): Promise<{ vms: ExeVM[]; error?: string }> {
    const result = await runExeCommand(["ls", "--json"]);

    if (!result.success) {
      // Check for common errors
      if (result.output.includes("registration") || result.error?.includes("registration")) {
        return {
          vms: [],
          error: "Please complete exe.dev registration by running 'ssh exe.dev' in your terminal",
        };
      }
      return { vms: [], error: result.error || "Failed to list VMs" };
    }

    const vms = parseVMList(result.output);
    return { vms };
  },

  /**
   * Create a new VM
   */
  async createVM(name?: string, image?: string): Promise<{ vm?: ExeVM; error?: string }> {
    const args = ["new", "--json"];
    if (name) args.push("--name", name);
    if (image) args.push("--image", image);

    const result = await runExeCommand(args, 60000); // Longer timeout for creation

    if (!result.success) {
      return { error: result.error || result.output || "Failed to create VM" };
    }

    const vm = parseVM(result.output);
    if (!vm) {
      // Try to extract name from output
      const nameMatch = result.output.match(/([a-z0-9-]+)\.exe\.xyz/i);
      if (nameMatch && nameMatch[1]) {
        const vmName = nameMatch[1];
        return {
          vm: {
            name: vmName,
            status: "creating",
            url: `https://${vmName}.exe.xyz`,
          },
        };
      }
      return { error: "Failed to parse VM creation response" };
    }

    return { vm };
  },

  /**
   * Delete a VM
   */
  async deleteVM(name: string): Promise<{ success: boolean; error?: string }> {
    const result = await runExeCommand(["rm", name]);

    if (!result.success) {
      return { success: false, error: result.error || result.output || "Failed to delete VM" };
    }

    return { success: true };
  },

  /**
   * Restart a VM
   */
  async restartVM(name: string): Promise<{ success: boolean; error?: string }> {
    const result = await runExeCommand(["restart", name]);

    if (!result.success) {
      return { success: false, error: result.error || result.output || "Failed to restart VM" };
    }

    return { success: true };
  },

  /**
   * Run a command inside a VM
   */
  async exec(
    vmName: string,
    command: string,
    timeout?: number
  ): Promise<ExeCommandResult> {
    return runVMCommand(vmName, command, timeout);
  },

  /**
   * Check exe.dev connectivity and authentication status
   */
  async checkStatus(): Promise<{
    connected: boolean;
    authenticated: boolean;
    error?: string;
  }> {
    const result = await runExeCommand(["whoami"], 10000);

    if (!result.success) {
      if (result.output.includes("registration") || result.error?.includes("registration")) {
        return {
          connected: true,
          authenticated: false,
          error: "Please complete registration by running 'ssh exe.dev' in your terminal",
        };
      }
      if (result.error?.includes("Host key") || result.error?.includes("known_hosts")) {
        return {
          connected: false,
          authenticated: false,
          error: "SSH host key verification failed. Run 'ssh exe.dev' to add the host key.",
        };
      }
      return {
        connected: false,
        authenticated: false,
        error: result.error || "Failed to connect to exe.dev",
      };
    }

    return {
      connected: true,
      authenticated: true,
    };
  },
};
