/**
 * Docker Client
 *
 * Wrapper around the Docker Engine API using fetch.
 * Communicates with the Docker daemon via Unix socket.
 */

import { z } from "zod";

// ============================================================================
// Types
// ============================================================================

export const ContainerStateSchema = z.object({
  Status: z.string(),
  Running: z.boolean(),
  Paused: z.boolean(),
  Restarting: z.boolean(),
  OOMKilled: z.boolean(),
  Dead: z.boolean(),
  Pid: z.number(),
  ExitCode: z.number(),
  Error: z.string(),
  StartedAt: z.string(),
  FinishedAt: z.string(),
});

export const PortBindingSchema = z.object({
  IP: z.string().optional(),
  PrivatePort: z.number(),
  PublicPort: z.number().optional(),
  Type: z.string(),
});

export const MountSchema = z.object({
  Type: z.string(),
  Source: z.string(),
  Destination: z.string(),
  Mode: z.string(),
  RW: z.boolean(),
});

export const ContainerSchema = z.object({
  Id: z.string(),
  Names: z.array(z.string()),
  Image: z.string(),
  ImageID: z.string(),
  Command: z.string(),
  Created: z.number(),
  Ports: z.array(PortBindingSchema).optional().default([]),
  Labels: z.record(z.string()).optional().default({}),
  State: z.string(),
  Status: z.string(),
  Mounts: z.array(MountSchema).optional().default([]),
});

export const ContainerInspectSchema = z.object({
  Id: z.string(),
  Created: z.string(),
  Name: z.string(),
  State: ContainerStateSchema,
  Image: z.string(),
  Config: z.object({
    Image: z.string(),
    Env: z.array(z.string()).optional().default([]),
    Cmd: z.array(z.string()).optional(),
    Labels: z.record(z.string()).optional().default({}),
  }),
  HostConfig: z.object({
    PortBindings: z.record(z.array(z.object({
      HostIp: z.string().optional(),
      HostPort: z.string(),
    }))).optional().default({}),
    Binds: z.array(z.string()).optional().default([]),
    RestartPolicy: z.object({
      Name: z.string(),
      MaximumRetryCount: z.number(),
    }).optional(),
  }),
  Mounts: z.array(MountSchema).optional().default([]),
});

export const ImageSchema = z.object({
  Id: z.string(),
  RepoTags: z.array(z.string()).nullable().default([]),
  RepoDigests: z.array(z.string()).nullable().default([]),
  Created: z.number(),
  Size: z.number(),
  VirtualSize: z.number().optional(),
  Labels: z.record(z.string()).nullable().optional(),
});

export const DockerInfoSchema = z.object({
  ID: z.string().optional(),
  Containers: z.number(),
  ContainersRunning: z.number(),
  ContainersPaused: z.number(),
  ContainersStopped: z.number(),
  Images: z.number(),
  Driver: z.string(),
  MemTotal: z.number(),
  NCPU: z.number(),
  OperatingSystem: z.string(),
  OSType: z.string(),
  Architecture: z.string(),
  ServerVersion: z.string(),
  Name: z.string(),
});

export type Container = z.infer<typeof ContainerSchema>;
export type ContainerInspect = z.infer<typeof ContainerInspectSchema>;
export type Image = z.infer<typeof ImageSchema>;
export type DockerInfo = z.infer<typeof DockerInfoSchema>;

// ============================================================================
// Docker Client
// ============================================================================

const DEFAULT_SOCKET_PATH = "/var/run/docker.sock";

/**
 * Make a request to the Docker daemon
 */
async function dockerRequest<T>(
  method: string,
  path: string,
  options: {
    body?: unknown;
    socketPath?: string;
    timeout?: number;
  } = {}
): Promise<T> {
  const socketPath = options.socketPath || DEFAULT_SOCKET_PATH;
  const timeout = options.timeout || 30000;

  // Bun supports Unix socket requests via the unix option
  const url = `http://localhost${path}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      unix: socketPath,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Docker API error (${response.status}): ${errorText}`);
    }

    // Handle empty responses (204 No Content)
    if (response.status === 204) {
      return {} as T;
    }

    return await response.json() as T;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Docker request timed out");
    }

    throw error;
  }
}

// ============================================================================
// Container Operations
// ============================================================================

export const DockerClient = {
  /**
   * Check if Docker is available
   */
  async isAvailable(socketPath?: string): Promise<boolean> {
    try {
      await this.getInfo(socketPath);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Get Docker daemon info
   */
  async getInfo(socketPath?: string): Promise<DockerInfo> {
    const data = await dockerRequest<unknown>("GET", "/info", { socketPath });
    return DockerInfoSchema.parse(data);
  },

  /**
   * List containers
   */
  async listContainers(
    options: { all?: boolean; socketPath?: string } = {}
  ): Promise<Container[]> {
    const query = options.all ? "?all=true" : "";
    const data = await dockerRequest<unknown[]>("GET", `/containers/json${query}`, {
      socketPath: options.socketPath,
    });
    return z.array(ContainerSchema).parse(data);
  },

  /**
   * Get container details
   */
  async inspectContainer(
    containerId: string,
    socketPath?: string
  ): Promise<ContainerInspect> {
    const data = await dockerRequest<unknown>("GET", `/containers/${containerId}/json`, {
      socketPath,
    });
    return ContainerInspectSchema.parse(data);
  },

  /**
   * Start a container
   */
  async startContainer(containerId: string, socketPath?: string): Promise<void> {
    await dockerRequest("POST", `/containers/${containerId}/start`, { socketPath });
  },

  /**
   * Stop a container
   */
  async stopContainer(
    containerId: string,
    options: { timeout?: number; socketPath?: string } = {}
  ): Promise<void> {
    const query = options.timeout ? `?t=${options.timeout}` : "";
    await dockerRequest("POST", `/containers/${containerId}/stop${query}`, {
      socketPath: options.socketPath,
    });
  },

  /**
   * Restart a container
   */
  async restartContainer(
    containerId: string,
    options: { timeout?: number; socketPath?: string } = {}
  ): Promise<void> {
    const query = options.timeout ? `?t=${options.timeout}` : "";
    await dockerRequest("POST", `/containers/${containerId}/restart${query}`, {
      socketPath: options.socketPath,
    });
  },

  /**
   * Remove a container
   */
  async removeContainer(
    containerId: string,
    options: { force?: boolean; socketPath?: string } = {}
  ): Promise<void> {
    const query = options.force ? "?force=true" : "";
    await dockerRequest("DELETE", `/containers/${containerId}${query}`, {
      socketPath: options.socketPath,
    });
  },

  /**
   * Get container logs
   */
  async getContainerLogs(
    containerId: string,
    options: {
      stdout?: boolean;
      stderr?: boolean;
      tail?: number;
      timestamps?: boolean;
      socketPath?: string;
    } = {}
  ): Promise<string> {
    const params = new URLSearchParams();
    params.set("stdout", String(options.stdout ?? true));
    params.set("stderr", String(options.stderr ?? true));
    if (options.tail) params.set("tail", String(options.tail));
    if (options.timestamps) params.set("timestamps", "true");

    const socketPath = options.socketPath || DEFAULT_SOCKET_PATH;
    const url = `http://localhost/containers/${containerId}/logs?${params}`;

    const response = await fetch(url, {
      unix: socketPath,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Docker API error (${response.status}): ${errorText}`);
    }

    // Docker logs come with a multiplexed stream header
    // For simplicity, we'll just return the raw text
    const buffer = await response.arrayBuffer();
    return new TextDecoder().decode(buffer);
  },

  /**
   * Create a container
   */
  async createContainer(
    options: {
      Image: string;
      name?: string;
      Env?: string[];
      Cmd?: string[];
      ExposedPorts?: Record<string, object>;
      HostConfig?: {
        PortBindings?: Record<string, Array<{ HostIp?: string; HostPort: string }>>;
        Binds?: string[];
        RestartPolicy?: { Name: string; MaximumRetryCount?: number };
        AutoRemove?: boolean;
      };
      Labels?: Record<string, string>;
      socketPath?: string;
    }
  ): Promise<{ Id: string; Warnings: string[] }> {
    const { socketPath, name, ...body } = options;
    const query = name ? `?name=${encodeURIComponent(name)}` : "";

    const data = await dockerRequest<{ Id: string; Warnings: string[] }>(
      "POST",
      `/containers/create${query}`,
      { body, socketPath }
    );

    return data;
  },

  // ============================================================================
  // Image Operations
  // ============================================================================

  /**
   * List images
   */
  async listImages(socketPath?: string): Promise<Image[]> {
    const data = await dockerRequest<unknown[]>("GET", "/images/json", { socketPath });
    return z.array(ImageSchema).parse(data);
  },

  /**
   * Pull an image
   */
  async pullImage(
    imageName: string,
    options: { tag?: string; socketPath?: string } = {}
  ): Promise<void> {
    const tag = options.tag || "latest";
    const socketPath = options.socketPath || DEFAULT_SOCKET_PATH;

    // Pull image - this is a streaming endpoint
    const url = `http://localhost/images/create?fromImage=${encodeURIComponent(imageName)}&tag=${tag}`;

    const response = await fetch(url, {
      method: "POST",
      unix: socketPath,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Docker API error (${response.status}): ${errorText}`);
    }

    // Consume the stream to completion
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }
  },

  /**
   * Remove an image
   */
  async removeImage(
    imageId: string,
    options: { force?: boolean; socketPath?: string } = {}
  ): Promise<void> {
    const query = options.force ? "?force=true" : "";
    await dockerRequest("DELETE", `/images/${imageId}${query}`, {
      socketPath: options.socketPath,
    });
  },
};
