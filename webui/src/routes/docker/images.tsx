import { createFileRoute } from "@tanstack/react-router";
import { ImageBrowserPage } from "@/extensions/docker";

export const Route = createFileRoute("/docker/images")({
  component: ImagesRoute,
});

function ImagesRoute() {
  return <ImageBrowserPage />;
}
