import { createFileRoute } from "@tanstack/react-router";
import { ThemePage } from "@/primitives/settings";

export const Route = createFileRoute("/settings/theme")({
  component: ThemeRoute,
});

function ThemeRoute() {
  return <ThemePage params={{}} />;
}
