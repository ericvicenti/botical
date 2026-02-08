/**
 * Docker Extension (Frontend)
 *
 * Provides Docker container management UI for Botical.
 */

// Register pages with the primitives system
import "./pages";

// Export components for direct use
export { DockerSidebarPanel } from "./components/DockerSidebarPanel";
export { ContainerDetailPage } from "./components/ContainerDetailPage";
export { ContainerLogsPage } from "./components/ContainerLogsPage";
export { ImageBrowserPage } from "./components/ImageBrowserPage";
export { NewContainerModal } from "./components/NewContainerModal";

// Export API hooks
export * from "./api";

// Export page definitions
export {
  dockerSidebarPage,
  dockerContainerPage,
  dockerLogsPage,
  dockerImagesPage,
  dockerNewContainerPage,
} from "./pages";
