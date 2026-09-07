import type { IncomingMessage } from "node:http";

import { describe, expect, it } from "vitest";

import type { Config } from "../src/config.js";
import { corsHeaders, isCorsPreflight, requestPath } from "../src/http.js";

const baseConfig: Config = {
  host: "127.0.0.1",
  port: 3000,
  mithrilApiUrl: "https://api.tryinstaclean.com",
  mithrilTimeoutMs: 15_000,
  authMode: "passthrough",
  allowedOrigins: ["https://app.tryinstaclean.com"],
};

function request(
  url: string | undefined,
  method = "POST",
  headers: Record<string, string> = {},
): IncomingMessage {
  return { url, method, headers } as unknown as IncomingMessage;
}

describe("requestPath", () => {
  it("does not trust a malformed Host header when parsing the path", () => {
    const req = request("/mcp?session=1", "POST", { host: "[" });
    expect(requestPath(req)).toBe("/mcp");
  });

  it("rejects an invalid request target instead of throwing", () => {
    const req = request("http://[", "POST");
    expect(requestPath(req)).toBeNull();
  });
});

describe("CORS policy", () => {
  it("returns browser response headers for an approved origin", () => {
    const req = request("/mcp", "POST", { origin: "https://app.tryinstaclean.com" });
    const headers = corsHeaders(req, baseConfig);

    expect(headers).not.toBeNull();
    expect(headers?.["access-control-allow-origin"]).toBe("https://app.tryinstaclean.com");
    expect(headers?.vary).toBe("Origin");
    expect(headers?.["access-control-allow-headers"]).toContain("Authorization");
    expect(headers?.["access-control-expose-headers"]).toContain("MCP-Session-Id");
  });

  it("rejects an unapproved browser origin", () => {
    const req = request("/mcp", "POST", { origin: "https://evil.example" });
    expect(corsHeaders(req, baseConfig)).toBeNull();
  });

  it("recognizes an authenticated MCP browser preflight before auth is required", () => {
    const req = request("/mcp", "OPTIONS", {
      origin: "https://app.tryinstaclean.com",
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type,mcp-protocol-version",
    });

    expect(corsHeaders(req, baseConfig)).not.toBeNull();
    expect(isCorsPreflight(req)).toBe(true);
  });
});
