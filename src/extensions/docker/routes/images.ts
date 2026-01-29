/**
 * Image Routes
 *
 * API endpoints for Docker image management.
 */

import { Hono } from "hono";
import { z } from "zod";
import { DockerClient } from "../client.ts";

export const imagesRouter = new Hono();

// List images
imagesRouter.get("/", async (c) => {
  try {
    const images = await DockerClient.listImages();

    // Transform to a cleaner format
    const result = images.map((image) => ({
      id: image.Id,
      repoTags: image.RepoTags || [],
      repoDigests: image.RepoDigests || [],
      created: image.Created,
      size: image.Size,
      labels: image.Labels || {},
    }));

    return c.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list images";
    return c.json({ error: message }, 500);
  }
});

// Pull image
const PullImageSchema = z.object({
  image: z.string(),
  tag: z.string().optional(),
});

imagesRouter.post("/pull", async (c) => {
  try {
    const body = await c.req.json();
    const input = PullImageSchema.parse(body);

    await DockerClient.pullImage(input.image, { tag: input.tag });

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Invalid request body", details: error.errors }, 400);
    }
    const message = error instanceof Error ? error.message : "Failed to pull image";
    return c.json({ error: message }, 500);
  }
});

// Remove image
imagesRouter.delete("/:id", async (c) => {
  try {
    const imageId = c.req.param("id");
    const force = c.req.query("force") === "true";

    await DockerClient.removeImage(imageId, { force });

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove image";
    return c.json({ error: message }, 500);
  }
});
