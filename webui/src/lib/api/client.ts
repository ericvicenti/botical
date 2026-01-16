const API_BASE = import.meta.env.VITE_API_URL || "";

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: { error: { code: string; message: string } }
  ) {
    super(data.error.message);
    this.name = "ApiError";
  }
}

export async function apiClient<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(response.status, data);
  }

  return data.data ?? data;
}

export async function apiClientRaw<T>(
  path: string,
  options?: RequestInit
): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(response.status, data);
  }

  return data;
}
