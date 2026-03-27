const BASE = '';

let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(cb: () => void) {
  onUnauthorized = cb;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    if (res.status === 401 && !path.includes('/api/auth/')) {
      onUnauthorized?.();
    }
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText);
  }

  return res.json();
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  upload: async (file: File, linkedType?: string, linkedId?: number) => {
    const form = new FormData();
    form.append('file', file);
    if (linkedType) form.append('linked_type', linkedType);
    if (linkedId !== undefined) form.append('linked_id', String(linkedId));

    const res = await fetch(`${BASE}/api/uploads`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });

    if (!res.ok) {
      if (res.status === 401) onUnauthorized?.();
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error || res.statusText);
    }

    return res.json();
  },
};
