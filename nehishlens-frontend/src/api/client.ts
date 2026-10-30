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

/**
 * The lens the UI renders for, mirrored from the login response. It is never
 * sent: the server derives the lens from the token, and production rejects
 * X-Lens. (On the mock, X-Lens even overrides a token's lens on the older
 * endpoints, so sending it would make the token lens unreliable.)
 */
let currentLens: Lens = apiConfig.defaultLens;
export function setLens(lens: Lens) {
  currentLens = lens;
}
export function getLens(): Lens {
  return currentLens;
}

/**
 * Token pair from POST /auth/login. Held in memory only — never in storage —
 * so a reload means signing in again. Nehish recommends the refresh token
 * in an httpOnly cookie; a browser-only app cannot set one, so that needs a
 * server in front of the API (pending their confirmation).
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

let session: TokenPair | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshInFlight: Promise<boolean> | null = null;
const sessionEndedListeners = new Set<(message: string) => void>();

export function setSession(pair: TokenPair) {
  session = pair;
  clearTimeout(refreshTimer);
  // Refresh ahead of expiry; a 401 mid-request is still handled by the retry in request().
  refreshTimer = setTimeout(() => void refreshSession(), Math.max(pair.expiresIn * 0.8, 10) * 1000);
}

export function clearSession() {
  session = null;
  clearTimeout(refreshTimer);
}

export function getRefreshToken(): string | null {
  return session?.refreshToken ?? null;
}

/** Called when the session can no longer be refreshed, with the server's message. */
export function onSessionEnded(listener: (message: string) => void): () => void {
  sessionEndedListeners.add(listener);
  return () => sessionEndedListeners.delete(listener);
}

function endSession(message: string) {
  clearSession();
  sessionEndedListeners.forEach((l) => l(message));
}

/**
 * The refresh token is single-use, so concurrent 401s must share one refresh:
 * a second POST /auth/refresh with the same token is refused and would sign
 * the user out.
 */
function refreshSession(): Promise<boolean> {
  if (!session) return Promise.resolve(false);
  refreshInFlight ??= request<TokenPair>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: session.refreshToken },
    noAuthRetry: true,
  })
    .then((pair) => {
      setSession(pair);
      return true;
    })
    .catch((err: unknown) => {
      if (session) endSession(err instanceof ApiError ? err.message : 'Your session has ended. Sign in again.');
      return false;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
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
  /** Skip the refresh-and-retry on 401 (the auth endpoints themselves). */
  noAuthRetry?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const method = opts.method ?? 'GET';
  const forcedState = opts.mockState ?? apiConfig.forceMockState;

  let url = `${apiConfig.baseUrl}${path}`;
  if (forcedState && opts.mockStateAsQueryParam) {
    url += (url.includes('?') ? '&' : '?') + `_state=${encodeURIComponent(forcedState)}`;
  }

  const usedToken = session?.accessToken;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (usedToken) headers.Authorization = `Bearer ${usedToken}`;
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
      // An expired or invalid token is a 401, never a silent fallback to X-Lens.
      // Refresh once (or pick up a refresh another request already did) and retry;
      // a 401 means the server did nothing, so replaying a POST is safe.
      if (res.status === 401 && usedToken && !opts.noAuthRetry && !retried) {
        const renewed = session && session.accessToken !== usedToken ? true : await refreshSession();
        if (renewed) return request<T>(path, opts, true);
      }
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
  post: <T>(path: string, body?: unknown, opts?: Pick<RequestOptions, 'noAuthRetry'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
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

  /**
   * Fetch a server-relative file URL (e.g. a pack's `downloadUrl`) with the
   * bearer token — a plain link would go out unauthenticated.
   */
  async download(rootPath: string): Promise<Blob> {
    const headers: Record<string, string> = {};
    if (session) headers.Authorization = `Bearer ${session.accessToken}`;
    const res = await fetch(`${apiConfig.root}${rootPath}`, { headers });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
      throw new ApiError(res.status, {
        code: body?.code ?? 'unknown',
        message: body?.message ?? `Download failed with status ${res.status}.`,
        retryable: false,
      });
    }
    return res.blob();
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
