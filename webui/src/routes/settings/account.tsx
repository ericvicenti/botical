import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "@/primitives/settings";

export const Route = createFileRoute("/settings/account")({
  component: AccountRoute,
});

function AccountRoute() {
  return <AccountPage params={{}} />;
}
