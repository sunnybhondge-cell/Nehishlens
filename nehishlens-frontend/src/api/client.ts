import { apiConfig, type Lens } from './config';
import { recordApiCall } from './apiLog';

/** Shape the mock API returns for every error — see wiring guide rule 1. */
export interface ApiErrorBody {
  code: string;
  message: string;
  retryable: boolean;
}

/** Thrown by `request()`. Carries the server's own message — never replaced with a generic one. */
export class ApiError extends Error {
  code: string;
  retryable: boolean;
  status: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.retryable = body.retryable;
  }
}

let currentLens: Lens = apiConfig.defaultLens;
export function setLens(lens: Lens) {
  currentLens = lens;
}
export function getLens(): Lens {
  return currentLens;
}

/**
 * Tracks whether the API is reachable. Read by the hydration hooks so that
 * "offline changes nothing" (guide: hydration layer, property 1) — no
 * screen ever silently swaps fixtures in without the top bar saying so.
 */
export const connectionState = {
  online: false as boolean,
  lastCheckedAt: null as number | null,
};

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  /** Per-call override of the X-Mock-State header / ?_state= query param. */
  mockState?: string;
  /** true => append ?_state=, false/undefined => send as X-Mock-State header (both are supported by the mock). */
  mockStateAsQueryParam?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const forcedState = opts.mockState ?? apiConfig.forceMockState;

  let url = `${apiConfig.baseUrl}${path}`;
  if (forcedState && opts.mockStateAsQueryParam) {
    url += (url.includes('?') ? '&' : '?') + `_state=${encodeURIComponent(forcedState)}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Lens': currentLens,
  };
  if (forcedState && !opts.mockStateAsQueryParam) {
    headers['X-Mock-State'] = forcedState;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), apiConfig.timeoutMs);
  const startedAt = performance.now();
  const durationMs = () => Math.round(performance.now() - startedAt);
  // Fire-and-forget dev capture; a complete no-op unless VITE_API_LOG is set.
  const log = (status: number, ok: boolean, responseBody: unknown, error?: string) =>
    recordApiCall({
      ts: new Date().toISOString(),
      method,
      path,
      url,
      lens: currentLens,
      status,
      ok,
      durationMs: durationMs(),
      requestBody: opts.body,
      responseBody,
      error,
    });

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    if (apiConfig.debugLogging) {
      // eslint-disable-next-line no-console
      console.debug(
        `[api] ${method} ${path} -> ${res.status} (${durationMs()}ms) lens=${currentLens}`,
      );
    }

    if (!res.ok) {
      let body: ApiErrorBody;
      try {
        body = await res.json();
      } catch {
        // Server didn't return the documented {code, message, retryable} shape.
        // We still don't invent our own copy — flag it plainly instead.
        body = { code: 'unknown', message: `Request failed with status ${res.status}`, retryable: false };
      }
      log(res.status, false, body, body.message);
      throw new ApiError(res.status, body);
    }

    connectionState.online = true;
    connectionState.lastCheckedAt = Date.now();

    if (res.status === 204) {
      log(204, true, undefined);
      return undefined as T;
    }
    const data = (await res.json()) as T;
    log(res.status, true, data);
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Network failure, timeout, abort — the API itself never got to answer.
    connectionState.online = false;
    connectionState.lastCheckedAt = Date.now();
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? `Request to ${path} timed out after ${apiConfig.timeoutMs}ms.`
        : `Could not reach the API at ${apiConfig.baseUrl}.`;
    log(0, false, null, message);
    throw new ApiError(0, { code: 'network_unreachable', message, retryable: true });
  } finally {
    clearTimeout(timeout);
  }
}

/** Envelope every list endpoint on the mock now returns. */
export interface PageEnvelope<T> {
  items: T[];
  total?: number;
  cursor?: string | null;
}

function unwrap<T>(body: PageEnvelope<T> | T[]): T[] {
  return Array.isArray(body) ? body : (body?.items ?? []);
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),

  /**
   * GET a list endpoint. The mock wraps every collection as
   * `{ items, total, cursor }`; older builds returned a bare array. This
   * normalises both to `T[]` so screens never see the envelope.
   */
  async list<T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>): Promise<T[]> {
    return unwrap<T>(await request<PageEnvelope<T> | T[]>(path, { ...opts, method: 'GET' }));
  },

  /** Same as `list`, but keeps `total`/`cursor` for screens that show them. */
  async page<T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>): Promise<PageEnvelope<T>> {
    const body = await request<PageEnvelope<T> | T[]>(path, { ...opts, method: 'GET' });
    return Array.isArray(body) ? { items: body } : body;
  },

  /** GET /health lives at the root, not under /api/v1 — hit it directly. */
  async probe(): Promise<boolean> {
    try {
      const res = await fetch(`${apiConfig.root}/health`, { signal: AbortSignal.timeout(apiConfig.timeoutMs) });
      connectionState.online = res.ok;
    } catch {
      connectionState.online = false;
    }
    connectionState.lastCheckedAt = Date.now();
    return connectionState.online;
  },
};

/**
 * Wiring guide rule 5: "a refusal is data, not a failure." Use this instead
 * of Promise.all whenever you fan out one request per item — a single 403
 * (e.g. a lens-denied source) must not take the whole screen down.
 */
export async function fetchAllSettled<T>(
  promises: Promise<T>[],
): Promise<Array<{ status: 'fulfilled'; value: T } | { status: 'rejected'; reason: ApiError }>> {
  const settled = await Promise.allSettled(promises);
  return settled.map((s) =>
    s.status === 'fulfilled'
      ? s
      : { status: 'rejected', reason: s.reason instanceof ApiError ? s.reason : new ApiError(0, { code: 'unknown', message: String(s.reason), retryable: false }) },
  );
}
