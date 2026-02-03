/**
 * SearXNG Provisioner
 *
 * Handles auto-provisioning of the SearXNG Docker container.
 * Uses the existing Docker client from the Docker extension.
 */

import { DockerClient } from "../docker/client.ts";
import { SearxngClient } from "./client.ts";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

// Container labels to identify managed containers
const EXTENSION_LABEL = "iris.extension";
const EXTENSION_VALUE = "search";
const CONTAINER_NAME = "iris-searxng";
const SEARXNG_IMAGE = "searxng/searxng:latest";

// SearXNG settings that enable JSON API access
const SEARXNG_SETTINGS = `# SearXNG settings for Iris
# See https://docs.searxng.org/admin/settings/settings.html

use_default_settings: true

general:
  instance_name: "Iris Search"

search:
  safe_search: 0
  autocomplete: "google"
  formats:
    - html
    - json

server:
  limiter: false
  image_proxy: true
  secret_key: "REPLACE_WITH_SECRET"
`;

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
 * Get the Iris data directory for storing SearXNG config
 */
function getConfigDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, ".iris", "searxng");
}

/**
 * Ensure SearXNG settings file exists with proper config
 */
async function ensureSettingsFile(): Promise<string> {
  const configDir = getConfigDir();
  const settingsPath = path.join(configDir, "settings.yml");

  try {
    // Check if settings already exist
    await fs.access(settingsPath);
    return configDir;
  } catch {
    // Create directory and settings file
    await fs.mkdir(configDir, { recursive: true });

    // Generate a random secret key
    const secretKey = crypto.randomBytes(32).toString("hex");
    const settings = SEARXNG_SETTINGS.replace("REPLACE_WITH_SECRET", secretKey);

    await fs.writeFile(settingsPath, settings, "utf-8");
    return configDir;
  }
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

  // Ensure settings file exists
  let configDir: string;
  try {
    configDir = await ensureSettingsFile();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      containerExists: false,
      containerRunning: false,
      error: `Failed to create SearXNG config: ${error}`,
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

    // Create the container with settings mount
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
        Binds: [
          `${configDir}:/etc/searxng:rw`,
        ],
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
