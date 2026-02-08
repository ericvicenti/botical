import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { WebSocketProvider } from "./lib/websocket/context";
import { UIProvider } from "./contexts/ui";
import { TabsProvider } from "./contexts/tabs";
import { AuthProvider, useAuth } from "./contexts/auth";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { AuthErrorBoundary } from "./components/auth/AuthErrorBoundary";
import { ApiError } from "./lib/api/client";
import { triggerGlobalAuthCheck } from "./lib/auth/globalCheck";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry authentication errors
        if (error instanceof ApiError && error.data?.error?.code === 'AUTHENTICATION_ERROR') {
          // Trigger auth check
          triggerGlobalAuthCheck();
          return false;
        }
        // Retry other errors up to 1 time
        return failureCount < 1;
      },
    },
    mutations: {
      onError: (error) => {
        // Handle authentication errors in mutations
        if (error instanceof ApiError && error.data?.error?.code === 'AUTHENTICATION_ERROR') {
          triggerGlobalAuthCheck();
        }
      },
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function AppContent() {
  const { checkAuth } = useAuth();

  return (
    <AuthErrorBoundary onAuthError={checkAuth}>
      <ProtectedRoute>
        <WebSocketProvider>
          <UIProvider>
            <TabsProvider>
              <RouterProvider router={router} />
            </TabsProvider>
          </UIProvider>
        </WebSocketProvider>
      </ProtectedRoute>
    </AuthErrorBoundary>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
  );
}
