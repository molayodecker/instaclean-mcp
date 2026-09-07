import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";

import { isOriginAllowed, resolveMithrilAuth, UnauthorizedError } from "../src/auth.js";
import type { Config } from "../src/config.js";

function request(headers: Record<string, string>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

const baseConfig: Config = {
  host: "127.0.0.1",
  port: 3000,
  mithrilApiUrl: "https://api.tryinstaclean.com",
  mithrilTimeoutMs: 15_000,
  authMode: "passthrough",
  allowedOrigins: ["https://chatgpt.com"],
};

describe("request authentication", () => {
  it("passes through a Mithril bearer token", () => {
    expect(resolveMithrilAuth(request({ authorization: "Bearer abc" }), baseConfig)).toEqual({
      type: "bearer",
      accessToken: "abc",
    });
  });

  it("requires the MCP key before using service credentials", () => {
    const config: Config = {
      ...baseConfig,
      authMode: "service",
      mcpApiKey: "mcp-secret",
      mithrilDirectToken: "direct-secret",
      mithrilActorUserId: "2d5d45f2-c415-4a4c-a1d1-dedc0fd501f0",
    };

    expect(() => resolveMithrilAuth(request({ authorization: "Bearer wrong" }), config)).toThrow(
      UnauthorizedError,
    );

    expect(resolveMithrilAuth(request({ authorization: "Bearer mcp-secret" }), config)).toEqual({
      type: "gateway",
      directToken: "direct-secret",
      actorUserId: "2d5d45f2-c415-4a4c-a1d1-dedc0fd501f0",
    });
  });

  it("rejects unapproved browser origins", () => {
    expect(isOriginAllowed(request({ origin: "https://chatgpt.com" }), baseConfig)).toBe(true);
    expect(isOriginAllowed(request({ origin: "https://evil.example" }), baseConfig)).toBe(false);
    expect(isOriginAllowed(request({}), baseConfig)).toBe(true);
  });
});
