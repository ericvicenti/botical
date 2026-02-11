import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/**
 * Portal — Renders children at the document body root.
 *
 * Use this for ALL modals, dialogs, and fullscreen overlays to prevent
 * them from being clipped by parent overflow/transform/z-index contexts
 * (e.g., rendering a modal inside a sidebar).
 *
 * @example
 * <Portal>
 *   <div className="fixed inset-0 z-50">...</div>
 * </Portal>
 */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
