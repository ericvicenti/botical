import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { NewContainerModal } from "@/extensions/docker";

export const Route = createFileRoute("/docker/new")({
  component: NewContainerRoute,
});

function NewContainerRoute() {
  const navigate = useNavigate();

  const handleClose = () => {
    navigate({ to: "/" });
  };

  return <NewContainerModal params={{}} onClose={handleClose} />;
}
