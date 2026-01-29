/**
 * Info Routes
 *
 * API endpoints for Docker daemon information.
 */

import { Hono } from "hono";
import { DockerClient } from "../client.ts";

export const infoRouter = new Hono();

// Get Docker info
infoRouter.get("/", async (c) => {
  try {
    const info = await DockerClient.getInfo();

    const result = {
      id: info.ID,
      containers: info.Containers,
      containersRunning: info.ContainersRunning,
      containersPaused: info.ContainersPaused,
      containersStopped: info.ContainersStopped,
      images: info.Images,
      driver: info.Driver,
      memoryTotal: info.MemTotal,
      cpus: info.NCPU,
      operatingSystem: info.OperatingSystem,
      osType: info.OSType,
      architecture: info.Architecture,
      serverVersion: info.ServerVersion,
      name: info.Name,
    };

    return c.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get Docker info";

    // Check if Docker is not available
    if (message.includes("ENOENT") || message.includes("ECONNREFUSED")) {
      return c.json({
        error: "Docker is not available",
        details: "Make sure Docker is installed and running",
      }, 503);
    }

    return c.json({ error: message }, 500);
  }
});

// Health check - simple availability check
infoRouter.get("/available", async (c) => {
  try {
    const available = await DockerClient.isAvailable();
    return c.json({ available });
  } catch {
    return c.json({ available: false });
  }
});
