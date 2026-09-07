import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { MithrilApi } from "../mithril/client.js";
import { MithrilApiError } from "../mithril/client.js";

function result(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function failure(error: unknown) {
  if (error instanceof MithrilApiError) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { error: error.code, status: error.status, details: error.payload },
            null,
            2,
          ),
        },
      ],
    };
  }

  const message = error instanceof Error ? error.message : "unexpected_error";
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

async function call(operation: () => Promise<unknown>) {
  try {
    return result(await operation());
  } catch (error) {
    return failure(error);
  }
}

export function createInstacleanMcpServer(api: MithrilApi): McpServer {
  const server = new McpServer({ name: "instaclean", version: "0.1.0" });

  server.registerTool(
    "search_customers",
    {
      description: "Search Instaclean customers by name, email, or phone. Requires an Instaclean admin actor.",
      inputSchema: z.object({ query: z.string().trim().max(120) }),
    },
    async ({ query }) => call(() => api.request("/direct/admin/customers", { query: { q: query } })),
  );

  server.registerTool(
    "list_dispatch_requests",
    {
      description: "List the Instaclean Direct urgent-help and replacement dispatch queue. Requires an admin actor.",
      inputSchema: z.object({}),
    },
    async () => call(() => api.request("/direct/admin/service-requests")),
  );

  server.registerTool(
    "list_my_service_requests",
    {
      description: "List urgent-help and replacement requests belonging to the authenticated Instaclean customer.",
      inputSchema: z.object({}),
    },
    async () => call(() => api.request("/direct/service-requests")),
  );

  server.registerTool(
    "list_booking_services",
    {
      description: "List active Instaclean services available through Direct booking.",
      inputSchema: z.object({}),
    },
    async () => call(() => api.request("/direct/booking-services")),
  );

  server.registerTool(
    "list_available_workers",
    {
      description: "List verified active Instaclean professionals eligible for a specific booking service.",
      inputSchema: z.object({ serviceId: z.number().int().positive() }),
    },
    async ({ serviceId }) =>
      call(() => api.request("/direct/booking-cleaners", { query: { serviceId } })),
  );

  server.registerTool(
    "get_booking",
    {
      description: "Get a booking owned by the authenticated Instaclean customer.",
      inputSchema: z.object({ bookingId: z.uuid() }),
    },
    async ({ bookingId }) => call(() => api.request(`/direct/bookings/${bookingId}`)),
  );

  server.registerTool(
    "create_admin_booking",
    {
      description:
        "Create a booking on behalf of an Instaclean customer using Mithril's canonical booking pipeline. Explicit customer consent is required.",
      inputSchema: z.object({
        customerUserId: z.uuid(),
        serviceId: z.number().int().positive(),
        cleanerId: z.uuid(),
        scheduledDate: z.iso.date(),
        scheduledTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/),
        durationHours: z.number().min(0.5).max(24),
        address: z.string().trim().min(3).max(500),
        specialInstructions: z.string().trim().max(4000).optional(),
        timezone: z.string().trim().min(1).default("Africa/Accra"),
        source: z.enum(["admin", "phone", "whatsapp"]).default("admin"),
        consentConfirmed: z.literal(true),
        adminNote: z.string().trim().max(2000).optional(),
      }),
    },
    async (input) =>
      call(() => api.request("/direct/admin/bookings", { method: "POST", body: input })),
  );

  server.registerTool(
    "create_urgent_help_request",
    {
      description:
        "Create a non-medical urgent household-help request for the authenticated customer. This is not an emergency medical service.",
      inputSchema: z.object({
        role: z.enum(["househelp", "nanny", "cleaner", "elder_caregiver", "cook", "driver", "gardener"]),
        priority: z.enum(["urgent", "same_day", "standard"]).default("urgent"),
        neededBy: z.iso.datetime({ offset: true }),
        durationHours: z.number().min(0.5).max(24),
        householdAddress: z.string().trim().min(3).max(500),
        requirements: z.record(z.string(), z.unknown()).default({}),
        notes: z.string().trim().max(4000).optional(),
      }),
    },
    async (input) => call(() => api.request("/direct/urgent-help", { method: "POST", body: input })),
  );

  server.registerTool(
    "request_replacement",
    {
      description: "Request a qualified replacement professional for a booking owned by the authenticated customer.",
      inputSchema: z.object({
        bookingId: z.uuid(),
        priority: z.enum(["urgent", "same_day", "standard"]).default("same_day"),
        requirements: z.record(z.string(), z.unknown()).default({}),
        notes: z.string().trim().max(4000).optional(),
      }),
    },
    async ({ bookingId, ...body }) =>
      call(() => api.request(`/direct/bookings/${bookingId}/replacement-request`, { method: "POST", body })),
  );

  server.registerTool(
    "assign_worker",
    {
      description:
        "Assign a vetted eligible Instaclean worker to an open Direct service request. Mithril revalidates worker eligibility before assignment.",
      inputSchema: z.object({
        requestId: z.uuid(),
        workerUserId: z.uuid(),
        adminNote: z.string().trim().max(2000).optional(),
      }),
    },
    async ({ requestId, ...body }) =>
      call(() => api.request(`/direct/admin/service-requests/${requestId}/assign`, { method: "POST", body })),
  );

  server.registerTool(
    "update_service_request",
    {
      description:
        "Advance or close an Instaclean Direct service request. Assignment is intentionally excluded and must use assign_worker.",
      inputSchema: z.object({
        requestId: z.uuid(),
        status: z.enum(["submitted", "triaging", "matching", "resolved", "cancelled"]),
        adminNote: z.string().trim().max(2000).optional(),
      }),
    },
    async ({ requestId, ...body }) =>
      call(() => api.request(`/direct/admin/service-requests/${requestId}/status`, { method: "POST", body })),
  );

  return server;
}
