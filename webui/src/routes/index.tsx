import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/primitives/home";

export const Route = createFileRoute("/")({
  component: HomePageRoute,
});

function HomePageRoute() {
  return <DashboardPage />;
}
