import { ReactNode } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { UIProvider } from "@/contexts/ui";
import { TabsProvider } from "@/contexts/tabs";

// Create a fresh query client for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// Mock WebSocket context that doesn't actually connect
function MockWebSocketProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

interface TestProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
  initialRoute?: string;
}

// Create a minimal router for testing
function createTestRouter(initialRoute: string = "/") {
  const rootRoute = createRootRoute({
    component: () => null,
  });

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });

  const projectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId",
    component: () => null,
  });

  const routeTree = rootRoute.addChildren([indexRoute, projectRoute]);

  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialRoute] }),
  });
}

export function TestProviders({
  children,
  queryClient = createTestQueryClient(),
  initialRoute = "/",
}: TestProvidersProps) {
  const router = createTestRouter(initialRoute);

  return (
    <QueryClientProvider client={queryClient}>
      <MockWebSocketProvider>
        <UIProvider>
          <TabsProvider>
            <RouterProvider router={router}>{children}</RouterProvider>
          </TabsProvider>
        </UIProvider>
      </MockWebSocketProvider>
    </QueryClientProvider>
  );
}

// Wrapper for testing without router (for isolated component tests)
export function TestProvidersNoRouter({
  children,
  queryClient = createTestQueryClient(),
}: {
  children: ReactNode;
  queryClient?: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <MockWebSocketProvider>
        <UIProvider>
          <TabsProvider>{children}</TabsProvider>
        </UIProvider>
      </MockWebSocketProvider>
    </QueryClientProvider>
  );
}

// Custom render function
function customRender(
  ui: ReactNode,
  options?: Omit<RenderOptions, "wrapper"> & {
    queryClient?: QueryClient;
    initialRoute?: string;
    withRouter?: boolean;
  }
) {
  const { queryClient, initialRoute, withRouter = true, ...renderOptions } = options || {};

  const Wrapper = ({ children }: { children: ReactNode }) =>
    withRouter ? (
      <TestProviders queryClient={queryClient} initialRoute={initialRoute}>
        {children}
      </TestProviders>
    ) : (
      <TestProvidersNoRouter queryClient={queryClient}>
        {children}
      </TestProvidersNoRouter>
    );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

export * from "@testing-library/react";
export { customRender as render };
export { createTestQueryClient };
