import { createFileRoute } from "@tanstack/react-router";
import { ShortcutsPage } from "@/primitives/settings";

export const Route = createFileRoute("/settings/shortcuts")({
  component: ShortcutsRoute,
});

function ShortcutsRoute() {
  return <ShortcutsPage params={{}} />;
}
