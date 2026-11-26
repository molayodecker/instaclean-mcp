import { describe, expect, it } from "vitest";

import type { MithrilApi, RequestOptions } from "../src/mithril/client.js";
import { createInstacleanMcpServer } from "../src/tools/register.js";

type RegisteredTool = {
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

function harness() {
  const calls: { path: string; options?: RequestOptions }[] = [];
  const api: MithrilApi = {
    request: async (path, options) => {
      calls.push({ path, options });
      return { ok: true };
    },
  };
  const server = createInstacleanMcpServer(api) as unknown as {
    _registeredTools: Record<string, RegisteredTool>;
  };
  return { calls, server };
}

describe("staff Twilio inbox tools", () => {
  it("registers inbox reads and confirmed sends", () => {
    const { server } = harness();
    expect(Object.keys(server._registeredTools)).toEqual(
      expect.arrayContaining([
        "list_whatsapp_threads",
        "list_whatsapp_messages",
        "send_whatsapp_message",
        "send_sms",
        "create_whatsapp_customer",
      ]),
    );
  });

  it("sends SMS through Mithril without forwarding the confirmation flag", async () => {
    const { calls, server } = harness();
    await server._registeredTools.send_sms.handler({
      phoneE164: "+233200000000",
      body: "Your cleaner is on the way.",
      confirm: true,
    });

    expect(calls).toEqual([
      {
        path: "/direct/admin/whatsapp/sms",
        options: {
          method: "POST",
          body: { phoneE164: "+233200000000", body: "Your cleaner is on the way." },
        },
      },
    ]);
  });

  it("reads one WhatsApp thread by phone", async () => {
    const { calls, server } = harness();
    await server._registeredTools.list_whatsapp_messages.handler({ phone: "+233200000000" });

    expect(calls).toEqual([
      {
        path: "/direct/admin/whatsapp/messages",
        options: { query: { phone: "+233200000000" } },
      },
    ]);
  });
});
