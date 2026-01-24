import { createFileRoute } from "@tanstack/react-router";
import { ApiKeysPage } from "@/primitives/settings";

export const Route = createFileRoute("/settings/api-keys")({
  component: ApiKeysRoute,
});

function ApiKeysRoute() {
  return <ApiKeysPage params={{}} />;
}
