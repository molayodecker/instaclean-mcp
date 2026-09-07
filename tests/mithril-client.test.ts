import { describe, expect, it, vi } from "vitest";

import { MithrilApiError, MithrilClient } from "../src/mithril/client.js";

describe("MithrilClient", () => {
  it("forwards a user bearer token to Mithril", async () => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer user-token");
      expect(headers.get("x-mithril-direct-token")).toBeNull();
      return new Response(JSON.stringify({ services: [] }), { status: 200 });
    }) as typeof fetch;

    const client = new MithrilClient(
      "https://api.tryinstaclean.com",
      { type: "bearer", accessToken: "user-token" },
      1_000,
      fetchImpl,
    );

    await expect(client.request("/direct/booking-services")).resolves.toEqual({ services: [] });
  });

  it("uses Mithril Direct gateway headers in service mode", async () => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("x-mithril-direct-token")).toBe("direct-token");
      expect(headers.get("x-instaclean-user-id")).toBe("2d5d45f2-c415-4a4c-a1d1-dedc0fd501f0");
      return new Response(JSON.stringify({ requests: [] }), { status: 200 });
    }) as typeof fetch;

    const client = new MithrilClient(
      "https://api.tryinstaclean.com",
      {
        type: "gateway",
        directToken: "direct-token",
        actorUserId: "2d5d45f2-c415-4a4c-a1d1-dedc0fd501f0",
      },
      1_000,
      fetchImpl,
    );

    await expect(client.request("/direct/admin/service-requests")).resolves.toEqual({ requests: [] });
  });

  it("turns Mithril API failures into typed errors", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
    ) as typeof fetch;

    const client = new MithrilClient(
      "https://api.tryinstaclean.com",
      { type: "bearer", accessToken: "user-token" },
      1_000,
      fetchImpl,
    );

    await expect(client.request("/direct/admin/customers")).rejects.toMatchObject<MithrilApiError>({
      status: 403,
      code: "forbidden",
    });
  });
});
