// Global auth check function - shared between App and AuthProvider
let globalAuthCheck: (() => Promise<void>) | null = null;

export function setGlobalAuthCheck(fn: () => Promise<void>) {
  globalAuthCheck = fn;
}

export function triggerGlobalAuthCheck() {
  globalAuthCheck?.();
}