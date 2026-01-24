import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "@/primitives/settings";

export const Route = createFileRoute("/settings/about")({
  component: AboutRoute,
});

function AboutRoute() {
  return <AboutPage params={{}} />;
}
