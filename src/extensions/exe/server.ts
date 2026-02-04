/**
 * Exe.dev Extension Server
 *
 * Standalone HTTP server for the exe.dev extension.
 * Runs on its own port and provides exe.dev VM management APIs.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { ExeService } from "./exe-service.ts";
import { handleError } from "@/server/middleware/error-handler.ts";
import { ValidationError } from "@/utils/errors.ts";

// Get port from environment (set by extension manager)
const port = parseInt(process.env.EXTENSION_PORT || "4103", 10);
const extensionId = process.env.EXTENSION_ID || "exe";

const app = new Hono();

app.use("*", cors());

// Health check
app.get("/health", (c) => c.json({ status: "ok", extension: extensionId }));

/**
 * GET /status
 * Check exe.dev connection and authentication status
 */
app.get("/status", async (c) => {
  const status = await ExeService.checkStatus();
  return c.json({ data: status });
});

/**
 * GET /vms
 * List all VMs
 */
app.get("/vms", async (c) => {
  const result = await ExeService.listVMs();

  if (result.error) {
    return c.json({ data: [], error: result.error });
  }

  return c.json({ data: result.vms });
});

const CreateVMSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/).min(1).max(63).optional(),
  image: z.string().optional(),
});

/**
 * POST /vms
 * Create a new VM
 */
app.post("/vms", async (c) => {
  const body = await c.req.json().catch(() => ({}));

  const result = CreateVMSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const createResult = await ExeService.createVM(result.data.name, result.data.image);

  if (createResult.error) {
    return c.json({ error: createResult.error }, 400);
  }

  return c.json({ data: createResult.vm }, 201);
});

/**
 * DELETE /vms/:name
 * Delete a VM
 */
app.delete("/vms/:name", async (c) => {
  const name = c.req.param("name");

  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    throw new ValidationError("Invalid VM name");
  }

  const result = await ExeService.deleteVM(name);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ success: true });
});

/**
 * POST /vms/:name/restart
 * Restart a VM
 */
app.post("/vms/:name/restart", async (c) => {
  const name = c.req.param("name");

  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    throw new ValidationError("Invalid VM name");
  }

  const result = await ExeService.restartVM(name);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ success: true });
});

const ExecSchema = z.object({
  command: z.string().min(1).max(10000),
  timeout: z.number().int().min(1000).max(300000).optional(),
});

/**
 * POST /vms/:name/exec
 * Run a command inside a VM
 */
app.post("/vms/:name/exec", async (c) => {
  const name = c.req.param("name");

  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    throw new ValidationError("Invalid VM name");
  }

  const body = await c.req.json();

  const result = ExecSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const execResult = await ExeService.exec(
    name,
    result.data.command,
    result.data.timeout
  );

  return c.json({
    data: {
      success: execResult.success,
      output: execResult.output,
      error: execResult.error,
      exitCode: execResult.exitCode,
    },
  });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => handleError(err, c));

console.log(`[${extensionId}] Starting server on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
