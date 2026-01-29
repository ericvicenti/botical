/**
 * Container Routes
 *
 * API endpoints for Docker container management.
 */

import { Hono } from "hono";
import { z } from "zod";
import { DockerClient } from "../client.ts";

export const containersRouter = new Hono();

// List containers
containersRouter.get("/", async (c) => {
  try {
    const all = c.req.query("all") === "true";
    const containers = await DockerClient.listContainers({ all });

    // Transform to a cleaner format
    const result = containers.map((container) => ({
      id: container.Id,
      name: container.Names[0]?.replace(/^\//, "") || container.Id.slice(0, 12),
      image: container.Image,
      imageId: container.ImageID,
      status: container.State.toLowerCase(),
      statusText: container.Status,
      ports: container.Ports.map((p) => ({
        privatePort: p.PrivatePort,
        publicPort: p.PublicPort,
        type: p.Type,
        ip: p.IP,
      })),
      mounts: container.Mounts.map((m) => ({
        type: m.Type,
        source: m.Source,
        destination: m.Destination,
        mode: m.Mode,
        rw: m.RW,
      })),
      created: container.Created,
      labels: container.Labels,
    }));

    return c.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list containers";
    return c.json({ error: message }, 500);
  }
});

// Get container details
containersRouter.get("/:id", async (c) => {
  try {
    const containerId = c.req.param("id");
    const container = await DockerClient.inspectContainer(containerId);

    const result = {
      id: container.Id,
      name: container.Name.replace(/^\//, ""),
      image: container.Config.Image,
      created: container.Created,
      state: {
        status: container.State.Status,
        running: container.State.Running,
        paused: container.State.Paused,
        restarting: container.State.Restarting,
        exitCode: container.State.ExitCode,
        startedAt: container.State.StartedAt,
        finishedAt: container.State.FinishedAt,
      },
      env: container.Config.Env,
      cmd: container.Config.Cmd,
      labels: container.Config.Labels,
      ports: Object.entries(container.HostConfig.PortBindings || {}).map(
        ([containerPort, bindings]) => ({
          containerPort,
          hostBindings: bindings,
        })
      ),
      mounts: container.Mounts,
      restartPolicy: container.HostConfig.RestartPolicy,
    };

    return c.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get container";
    return c.json({ error: message }, 500);
  }
});

// Create container
const CreateContainerSchema = z.object({
  image: z.string(),
  name: z.string().optional(),
  env: z.record(z.string()).optional(),
  ports: z.array(z.object({
    hostPort: z.number(),
    containerPort: z.number(),
    protocol: z.enum(["tcp", "udp"]).default("tcp"),
  })).optional(),
  volumes: z.array(z.object({
    hostPath: z.string(),
    containerPath: z.string(),
    mode: z.enum(["rw", "ro"]).default("rw"),
  })).optional(),
  cmd: z.array(z.string()).optional(),
  autoRemove: z.boolean().default(false),
  restartPolicy: z.enum(["no", "always", "unless-stopped", "on-failure"]).default("no"),
});

containersRouter.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const input = CreateContainerSchema.parse(body);

    // Build Docker API request
    const envArray = input.env
      ? Object.entries(input.env).map(([k, v]) => `${k}=${v}`)
      : undefined;

    const exposedPorts: Record<string, object> = {};
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};

    if (input.ports) {
      for (const port of input.ports) {
        const key = `${port.containerPort}/${port.protocol}`;
        exposedPorts[key] = {};
        portBindings[key] = [{ HostPort: String(port.hostPort) }];
      }
    }

    const binds = input.volumes?.map(
      (v) => `${v.hostPath}:${v.containerPath}:${v.mode}`
    );

    const result = await DockerClient.createContainer({
      Image: input.image,
      name: input.name,
      Env: envArray,
      Cmd: input.cmd,
      ExposedPorts: Object.keys(exposedPorts).length > 0 ? exposedPorts : undefined,
      HostConfig: {
        PortBindings: Object.keys(portBindings).length > 0 ? portBindings : undefined,
        Binds: binds,
        AutoRemove: input.autoRemove,
        RestartPolicy: {
          Name: input.restartPolicy,
          MaximumRetryCount: input.restartPolicy === "on-failure" ? 3 : 0,
        },
      },
    });

    return c.json({ data: { id: result.Id, warnings: result.Warnings } }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Invalid request body", details: error.errors }, 400);
    }
    const message = error instanceof Error ? error.message : "Failed to create container";
    return c.json({ error: message }, 500);
  }
});

// Start container
containersRouter.post("/:id/start", async (c) => {
  try {
    const containerId = c.req.param("id");
    await DockerClient.startContainer(containerId);
    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start container";
    return c.json({ error: message }, 500);
  }
});

// Stop container
containersRouter.post("/:id/stop", async (c) => {
  try {
    const containerId = c.req.param("id");
    const timeout = c.req.query("timeout");
    await DockerClient.stopContainer(containerId, {
      timeout: timeout ? parseInt(timeout, 10) : undefined,
    });
    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to stop container";
    return c.json({ error: message }, 500);
  }
});

// Restart container
containersRouter.post("/:id/restart", async (c) => {
  try {
    const containerId = c.req.param("id");
    const timeout = c.req.query("timeout");
    await DockerClient.restartContainer(containerId, {
      timeout: timeout ? parseInt(timeout, 10) : undefined,
    });
    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to restart container";
    return c.json({ error: message }, 500);
  }
});

// Remove container
containersRouter.delete("/:id", async (c) => {
  try {
    const containerId = c.req.param("id");
    const force = c.req.query("force") === "true";
    await DockerClient.removeContainer(containerId, { force });
    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove container";
    return c.json({ error: message }, 500);
  }
});

// Get container logs
containersRouter.get("/:id/logs", async (c) => {
  try {
    const containerId = c.req.param("id");
    const tail = c.req.query("tail");
    const timestamps = c.req.query("timestamps") === "true";

    const logs = await DockerClient.getContainerLogs(containerId, {
      stdout: true,
      stderr: true,
      tail: tail ? parseInt(tail, 10) : 100,
      timestamps,
    });

    // Return as text for streaming compatibility
    return c.text(logs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get logs";
    return c.json({ error: message }, 500);
  }
});
