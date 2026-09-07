import { createServer } from "node:http";

import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";

import { isOriginAllowed, resolveMithrilAuth, UnauthorizedError } from "./auth.js";
import { loadConfig } from "./config.js";
import { MithrilClient } from "./mithril/client.js";
import { createInstacleanMcpServer } from "./tools/register.js";

const config = loadConfig();

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    sendJson(res, 200, { status: "ok", service: "instaclean-mcp", version: "0.1.0" });
    return;
  }

  if (url.pathname !== "/mcp") {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  if (!isOriginAllowed(req, config)) {
    sendJson(res, 403, { error: "origin_not_allowed" });
    return;
  }

  let auth;
  try {
    auth = resolveMithrilAuth(req, config);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.setHeader("www-authenticate", 'Bearer realm="instaclean-mcp"');
      sendJson(res, 401, { error: error.message });
      return;
    }
    sendJson(res, 500, { error: "authentication_error" });
    return;
  }

  const api = new MithrilClient(config.mithrilApiUrl, auth, config.mithrilTimeoutMs);
  const handler = createMcpHandler(() => createInstacleanMcpServer(api));
  const nodeHandler = toNodeHandler(handler);

  let closed = false;
  const closeHandler = () => {
    if (closed) return;
    closed = true;
    handler.close().catch((error) => console.error("Failed to close MCP handler", error));
  };

  res.once("finish", closeHandler);
  res.once("close", closeHandler);

  nodeHandler(req, res).catch((error) => {
    console.error("MCP request failed", error);
    if (!res.headersSent) sendJson(res, 500, { error: "mcp_request_failed" });
    else res.destroy();
  });
});

httpServer.listen(config.port, config.host, () => {
  console.log(`Instaclean MCP listening on http://${config.host}:${config.port}/mcp`);
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}; shutting down`);
  httpServer.close((error) => {
    if (error) {
      console.error("HTTP shutdown failed", error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
