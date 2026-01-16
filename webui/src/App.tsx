import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { WebSocketProvider } from "./lib/websocket/context";
import { UIProvider } from "./contexts/ui";
import { TabsProvider } from "./contexts/tabs";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
      retry: 1,
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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <UIProvider>
          <TabsProvider>
            <RouterProvider router={router} />
          </TabsProvider>
        </UIProvider>
      </WebSocketProvider>
    </QueryClientProvider>
  );
}
