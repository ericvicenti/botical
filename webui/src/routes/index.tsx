import { createFileRoute } from "@tanstack/react-router";
import { ProjectsListPage } from "@/primitives/home";

export const Route = createFileRoute("/")({
  component: HomePageRoute,
});

function HomePageRoute() {
  return <ProjectsListPage params={{}} />;
}
