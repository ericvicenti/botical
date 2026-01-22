import { ReactNode, createContext, useContext } from "react";
import { render as rtlRender, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
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

// Mock WebSocket context value
type WSStatus = "connecting" | "connected" | "disconnected";

interface WebSocketContextValue {
  status: WSStatus;
  send: (message: object) => void;
  subscribe: (room: string) => void;
  unsubscribe: (room: string) => void;
}

const MockWebSocketContext = createContext<WebSocketContextValue | null>(null);

// Re-export the useWebSocket hook that uses our mock context
export function useWebSocket() {
  const context = useContext(MockWebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within WebSocketProvider");
  }
  return context;
}

// Mock WebSocket provider that provides a mock context
function MockWebSocketProvider({ children }: { children: ReactNode }) {
  const mockValue: WebSocketContextValue = {
    status: "connected",
    send: () => {},
    subscribe: () => {},
    unsubscribe: () => {},
  };
  return (
    <MockWebSocketContext.Provider value={mockValue}>
      {children}
    </MockWebSocketContext.Provider>
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
  const { queryClient = createTestQueryClient(), initialRoute = "/", withRouter = true, ...renderOptions } = options || {};

  if (!withRouter) {
    // Simple case - no router needed
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <TestProvidersNoRouter queryClient={queryClient}>
        {children}
      </TestProvidersNoRouter>
    );
    return rtlRender(ui, { wrapper: Wrapper, ...renderOptions });
  }

  // With router - create a router that renders the UI as its root component
  const rootRoute = createRootRoute({
    component: () => <>{ui}</>,
  });

  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [initialRoute] }),
  });

  // Render the full app with router
  const FullApp = (
    <QueryClientProvider client={queryClient}>
      <MockWebSocketProvider>
        <UIProvider>
          <TabsProvider>
            <RouterProvider router={router} />
          </TabsProvider>
        </UIProvider>
      </MockWebSocketProvider>
    </QueryClientProvider>
  );

  return rtlRender(FullApp, renderOptions);
}

export * from "@testing-library/react";
export { customRender as render };
export { createTestQueryClient };
