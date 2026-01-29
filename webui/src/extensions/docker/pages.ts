/**
 * Docker Extension Pages
 *
 * Registers all Docker extension pages with the primitives system.
 */

import { z } from "zod";
import { definePage } from "@/primitives/registry";
import { DockerSidebarPanel } from "./components/DockerSidebarPanel";
import { ContainerDetailPage } from "./components/ContainerDetailPage";
import { ContainerLogsPage } from "./components/ContainerLogsPage";
import { ImageBrowserPage } from "./components/ImageBrowserPage";
import { NewContainerModal } from "./components/NewContainerModal";

/**
 * Docker sidebar panel - shows container list
 */
export const dockerSidebarPage = definePage({
  id: "docker.sidebar",
  icon: "box",
  size: "sidebar",
  category: "docker",
  description: "Docker container list",

  getLabel: () => "Docker",

  params: z.object({}),
  route: "",
  parseParams: () => ({}),
  getRouteParams: () => ({}),

  component: DockerSidebarPanel,
});

/**
 * Container detail page - shows container info and controls
 */
export const dockerContainerPage = definePage({
  id: "docker.container",
  icon: "box",
  size: "full",
  category: "docker",
  description: "Docker container details",

  getLabel: (params) => params.containerName || "Container",
  getTitle: (params) => `${params.containerName || "Container"} - Docker`,

  params: z.object({
    containerId: z.string(),
    containerName: z.string().optional(),
  }),

  route: "/docker/containers/$containerId",
  parseParams: (routeParams) => ({
    containerId: routeParams.containerId,
  }),
  getRouteParams: (params) => ({
    containerId: params.containerId,
  }),

  component: ContainerDetailPage,
});

/**
 * Container logs page - real-time log viewer
 */
export const dockerLogsPage = definePage({
  id: "docker.logs",
  icon: "terminal",
  size: "full",
  category: "docker",
  description: "Docker container logs",

  getLabel: (params) => `Logs: ${params.containerName || params.containerId.slice(0, 12)}`,
  getTitle: (params) => `Logs - ${params.containerName || "Container"}`,

  params: z.object({
    containerId: z.string(),
    containerName: z.string().optional(),
  }),

  route: "/docker/containers/$containerId/logs",
  parseParams: (routeParams) => ({
    containerId: routeParams.containerId,
  }),
  getRouteParams: (params) => ({
    containerId: params.containerId,
  }),

  component: ContainerLogsPage,
});

/**
 * Images browser page - list and manage images
 */
export const dockerImagesPage = definePage({
  id: "docker.images",
  icon: "layers",
  size: "full",
  category: "docker",
  description: "Docker images browser",

  getLabel: () => "Docker Images",
  getTitle: () => "Docker Images",

  params: z.object({}),

  route: "/docker/images",
  parseParams: () => ({}),
  getRouteParams: () => ({}),

  component: ImageBrowserPage,
});

/**
 * New container modal - create container form
 */
export const dockerNewContainerPage = definePage({
  id: "docker.new-container",
  icon: "plus",
  size: "modal-md",
  category: "docker",
  description: "Create new Docker container",

  getLabel: () => "New Container",
  getTitle: () => "Create Container",

  params: z.object({}),

  route: "/docker/new",
  parseParams: () => ({}),
  getRouteParams: () => ({}),

  component: NewContainerModal,
});
