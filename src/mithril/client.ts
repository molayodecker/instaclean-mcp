export type MithrilAuth =
  | { type: "bearer"; accessToken: string }
  | { type: "gateway"; directToken: string; actorUserId: string };

export interface RequestOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export interface MithrilApi {
  request<T = unknown>(path: string, options?: RequestOptions): Promise<T>;
}

export class MithrilApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly payload: unknown,
  ) {
    super(`Mithril API error ${status}: ${code}`);
  }
}

export class MithrilClient implements MithrilApi {
  constructor(
    private readonly baseUrl: string,
    private readonly auth: MithrilAuth,
    private readonly timeoutMs = 15_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path, `${this.baseUrl.replace(/\/$/, "")}/`);
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers = new Headers({ accept: "application/json", "user-agent": "instaclean-mcp/0.1.0" });
    if (this.auth.type === "bearer") {
      headers.set("authorization", `Bearer ${this.auth.accessToken}`);
    } else {
      headers.set("x-mithril-direct-token", this.auth.directToken);
      headers.set("x-instaclean-user-id", this.auth.actorUserId);
    }

    let body: string | undefined;
    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(options.body);
    }

    const response = await this.fetchImpl(url, {
      method: options.method || "GET",
      headers,
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }

    if (!response.ok) {
      const code =
        typeof payload === "object" && payload !== null && "error" in payload
          ? String((payload as { error: unknown }).error)
          : response.statusText || "request_failed";
      throw new MithrilApiError(response.status, code, payload);
    }

    return payload as T;
  }
}
