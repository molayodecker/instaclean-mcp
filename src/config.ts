export type AuthMode = "passthrough" | "service";

export interface Config {
  host: string;
  port: number;
  mithrilApiUrl: string;
  mithrilTimeoutMs: number;
  authMode: AuthMode;
  allowedOrigins: string[];
  mcpApiKey?: string;
  mithrilDirectToken?: string;
  mithrilActorUserId?: string;
}

function requireValue(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function parsePositiveInteger(value: string | undefined, fallback: number, key: string): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${key} must be a positive integer`);
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const authMode = (env.AUTH_MODE?.trim() || "passthrough") as AuthMode;
  if (authMode !== "passthrough" && authMode !== "service") {
    throw new Error("AUTH_MODE must be passthrough or service");
  }

  const config: Config = {
    host: env.HOST?.trim() || "127.0.0.1",
    port: parsePositiveInteger(env.PORT, 3000, "PORT"),
    mithrilApiUrl: (env.MITHRIL_API_URL?.trim() || "https://api.tryinstaclean.com").replace(/\/$/, ""),
    mithrilTimeoutMs: parsePositiveInteger(env.MITHRIL_TIMEOUT_MS, 15_000, "MITHRIL_TIMEOUT_MS"),
    authMode,
    allowedOrigins: (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };

  if (authMode === "service") {
    config.mcpApiKey = requireValue(env, "MCP_API_KEY");
    config.mithrilDirectToken = requireValue(env, "MITHRIL_DIRECT_TOKEN");
    config.mithrilActorUserId = requireValue(env, "MITHRIL_ACTOR_USER_ID");
  }

  return config;
}
