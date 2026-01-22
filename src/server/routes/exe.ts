/**
 * Exe.dev API Routes
 *
 * REST API endpoints for managing exe.dev lightweight VMs.
 *
 * Endpoints:
 * - GET /api/exe/status - Check exe.dev connection status
 * - GET /api/exe/vms - List all VMs
 * - POST /api/exe/vms - Create a new VM
 * - DELETE /api/exe/vms/:name - Delete a VM
 * - POST /api/exe/vms/:name/restart - Restart a VM
 * - POST /api/exe/vms/:name/exec - Run a command in a VM
 */

import { Hono } from "hono";
import { z } from "zod";
import { ExeService } from "@/services/exe-service.ts";
import { ValidationError } from "@/utils/errors.ts";

const exe = new Hono();

/**
 * GET /api/exe/status
 * Check exe.dev connection and authentication status
 */
exe.get("/status", async (c) => {
  const status = await ExeService.checkStatus();
  return c.json({ data: status });
});

/**
 * GET /api/exe/vms
 * List all VMs
 */
exe.get("/vms", async (c) => {
  const result = await ExeService.listVMs();

  if (result.error) {
    return c.json({ data: [], error: result.error });
  }

  return c.json({ data: result.vms });
});

/**
 * Schema for creating a VM
 */
const CreateVMSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/).min(1).max(63).optional(),
  image: z.string().optional(),
});

/**
 * POST /api/exe/vms
 * Create a new VM
 */
exe.post("/vms", async (c) => {
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
 * DELETE /api/exe/vms/:name
 * Delete a VM
 */
exe.delete("/vms/:name", async (c) => {
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
 * POST /api/exe/vms/:name/restart
 * Restart a VM
 */
exe.post("/vms/:name/restart", async (c) => {
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

/**
 * Schema for exec command
 */
const ExecSchema = z.object({
  command: z.string().min(1).max(10000),
  timeout: z.number().int().min(1000).max(300000).optional(),
});

/**
 * POST /api/exe/vms/:name/exec
 * Run a command inside a VM
 */
exe.post("/vms/:name/exec", async (c) => {
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

export { exe };
