/**
 * ApiKeysPage - Redirects to ModelsPage
 * API keys are now managed in the Models page with server-side storage.
 */
import ModelsPage from "./ModelsPage";

export default function ApiKeysPage(_props: { params: Record<string, never>; search?: unknown }) {
  return <ModelsPage params={{}} />;
}
