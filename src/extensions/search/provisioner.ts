/**
 * SearXNG Provisioner
 *
 * Handles auto-provisioning of the SearXNG Docker container.
 * Uses the existing Docker client from the Docker extension.
 */

import { DockerClient } from "../docker/client.ts";
import { SearxngClient } from "./client.ts";

// Container labels to identify managed containers
const EXTENSION_LABEL = "iris.extension";
const EXTENSION_VALUE = "search";
const CONTAINER_NAME = "iris-searxng";
const SEARXNG_IMAGE = "searxng/searxng:latest";

export interface ProvisionerOptions {
  /** Port to expose SearXNG on (default: 8888) */
  port?: number;
  /** Docker socket path */
  socketPath?: string;
}

export interface ProvisionerStatus {
  /** Whether SearXNG is available */
  available: boolean;
  /** Whether a managed container exists */
  containerExists: boolean;
  /** Whether the container is running */
  containerRunning: boolean;
  /** Container ID if exists */
  containerId?: string;
  /** Error message if any */
  error?: string;
}

/**
 * Get the status of the SearXNG container and service
 */
export async function getStatus(options: ProvisionerOptions = {}): Promise<ProvisionerStatus> {
  const { port = 8888, socketPath } = options;

  // Check if Docker is available
  const dockerAvailable = await DockerClient.isAvailable(socketPath);
  if (!dockerAvailable) {
    return {
      available: false,
      containerExists: false,
      containerRunning: false,
      error: "Docker is not available",
    };
  }

  // Look for existing container
  const containers = await DockerClient.listContainers({ all: true, socketPath });
  const searxngContainer = containers.find(
    (c) =>
      c.Labels?.[EXTENSION_LABEL] === EXTENSION_VALUE ||
      c.Names.some((n) => n === `/${CONTAINER_NAME}`)
  );

  if (!searxngContainer) {
    return {
      available: false,
      containerExists: false,
      containerRunning: false,
    };
  }

  const containerRunning = searxngContainer.State === "running";

  // Check if SearXNG is actually responding
  const searxngUrl = `http://localhost:${port}`;
  const available = containerRunning && (await SearxngClient.isAvailable(searxngUrl));

  return {
    available,
    containerExists: true,
    containerRunning,
    containerId: searxngContainer.Id,
  };
}

/**
 * Ensure SearXNG is running, provisioning if necessary
 */
export async function ensureSearxngRunning(
  options: ProvisionerOptions = {}
): Promise<ProvisionerStatus> {
  const { port = 8888, socketPath } = options;

  // Check if Docker is available
  const dockerAvailable = await DockerClient.isAvailable(socketPath);
  if (!dockerAvailable) {
    return {
      available: false,
      containerExists: false,
      containerRunning: false,
      error: "Docker is not available. Please install and start Docker.",
    };
  }

  // Look for existing container
  const containers = await DockerClient.listContainers({ all: true, socketPath });
  const existingContainer = containers.find(
    (c) =>
      c.Labels?.[EXTENSION_LABEL] === EXTENSION_VALUE ||
      c.Names.some((n) => n === `/${CONTAINER_NAME}`)
  );

  // If container exists but is not running, start it
  if (existingContainer) {
    if (existingContainer.State !== "running") {
      try {
        await DockerClient.startContainer(existingContainer.Id, socketPath);
        // Wait for it to be ready
        await waitForSearxng(port);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          available: false,
          containerExists: true,
          containerRunning: false,
          containerId: existingContainer.Id,
          error: `Failed to start container: ${error}`,
        };
      }
    }

    // Check if it's ready
    const searxngUrl = `http://localhost:${port}`;
    const available = await SearxngClient.isAvailable(searxngUrl);

    return {
      available,
      containerExists: true,
      containerRunning: true,
      containerId: existingContainer.Id,
    };
  }

  // Need to create a new container
  try {
    // Pull the image first
    await DockerClient.pullImage("searxng/searxng", { tag: "latest", socketPath });

    // Create the container
    const result = await DockerClient.createContainer({
      Image: SEARXNG_IMAGE,
      name: CONTAINER_NAME,
      ExposedPorts: {
        "8080/tcp": {},
      },
      HostConfig: {
        PortBindings: {
          "8080/tcp": [{ HostPort: String(port) }],
        },
        RestartPolicy: {
          Name: "unless-stopped",
          MaximumRetryCount: 0,
        },
      },
      Labels: {
        [EXTENSION_LABEL]: EXTENSION_VALUE,
        "iris.managed": "true",
      },
      socketPath,
    });

    // Start the container
    await DockerClient.startContainer(result.Id, socketPath);

    // Wait for SearXNG to be ready
    await waitForSearxng(port);

    return {
      available: true,
      containerExists: true,
      containerRunning: true,
      containerId: result.Id,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      containerExists: false,
      containerRunning: false,
      error: `Failed to provision SearXNG: ${error}`,
    };
  }
}

/**
 * Stop the SearXNG container
 */
export async function stopSearxng(options: ProvisionerOptions = {}): Promise<void> {
  const { socketPath } = options;

  const containers = await DockerClient.listContainers({ all: false, socketPath });
  const searxngContainer = containers.find(
    (c) =>
      c.Labels?.[EXTENSION_LABEL] === EXTENSION_VALUE ||
      c.Names.some((n) => n === `/${CONTAINER_NAME}`)
  );

  if (searxngContainer) {
    await DockerClient.stopContainer(searxngContainer.Id, { socketPath });
  }
}

/**
 * Remove the SearXNG container
 */
export async function removeSearxng(options: ProvisionerOptions = {}): Promise<void> {
  const { socketPath } = options;

  const containers = await DockerClient.listContainers({ all: true, socketPath });
  const searxngContainer = containers.find(
    (c) =>
      c.Labels?.[EXTENSION_LABEL] === EXTENSION_VALUE ||
      c.Names.some((n) => n === `/${CONTAINER_NAME}`)
  );

  if (searxngContainer) {
    // Stop first if running
    if (searxngContainer.State === "running") {
      await DockerClient.stopContainer(searxngContainer.Id, { socketPath });
    }
    await DockerClient.removeContainer(searxngContainer.Id, { socketPath });
  }
}

/**
 * Wait for SearXNG to become available
 */
async function waitForSearxng(port: number, maxAttempts = 30): Promise<void> {
  const searxngUrl = `http://localhost:${port}`;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await SearxngClient.isAvailable(searxngUrl)) {
      return;
    }
    // Wait 1 second between attempts
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`SearXNG did not become available within ${maxAttempts} seconds`);
}
