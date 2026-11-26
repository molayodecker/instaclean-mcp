import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { MithrilApi } from "../mithril/client.js";
import { MithrilApiError } from "../mithril/client.js";

const bookingTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);

const bookingInput = {
  serviceId: z.number().int().positive(),
  cleanerId: z.uuid(),
  scheduledDate: z.iso.date(),
  scheduledTime: bookingTime,
  durationHours: z.number().min(0.5).max(24),
  address: z.string().trim().min(3).max(500),
  specialInstructions: z.string().trim().max(4000).optional(),
  timezone: z.string().trim().min(1).default("Africa/Accra"),
};

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
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
  };
}

async function call(operation: () => Promise<unknown>) {
  try {
    return result(await operation());
  } catch (error) {
    return failure(error);
  }
}

export function createInstacleanMcpServer(api: MithrilApi): McpServer {
  const server = new McpServer({ name: "instaclean", version: "0.4.0" });

  server.registerTool(
    "search_customers",
    {
      description:
        "Search Instaclean customers by name, email, or phone. Requires an Instaclean admin actor.",
      inputSchema: z.object({ query: z.string().trim().max(120) }),
    },
    async ({ query }) =>
      call(() => api.request("/direct/admin/customers", { query: { q: query } })),
  );

  server.registerTool(
    "list_dispatch_requests",
    {
      description:
        "List the Instaclean Direct urgent-help and replacement dispatch queue. Requires an admin actor.",
      inputSchema: z.object({}),
    },
    async () => call(() => api.request("/direct/admin/service-requests")),
  );

  server.registerTool(
    "list_my_service_requests",
    {
      description:
        "List urgent-help and replacement requests belonging to the authenticated Instaclean customer.",
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
      description:
        "List verified active Instaclean professionals eligible for a specific booking service.",
      inputSchema: z.object({ serviceId: z.number().int().positive() }),
    },
    async ({ serviceId }) =>
      call(() => api.request("/direct/booking-cleaners", { query: { serviceId } })),
  );

  server.registerTool(
    "list_cleaners",
    {
      description:
        "List the Instaclean cleaner roster, including verification and application state. Requires an admin actor.",
      inputSchema: z.object({
        query: z.string().trim().max(120).optional(),
        status: z.enum(["active", "inactive", "suspended", "pending"]).optional(),
        verified: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    },
    async ({ query, status, verified, limit }) =>
      call(() =>
        api.request("/direct/admin/cleaners", {
          query: { q: query, status, verified, limit },
        }),
      ),
  );

  server.registerTool(
    "list_cleaner_applications",
    {
      description:
        "List cleaner applications awaiting review or already decided. Requires an admin actor.",
      inputSchema: z.object({
        query: z.string().trim().max(120).optional(),
        status: z
          .enum(["pending", "submitted", "under_review", "approved", "rejected"])
          .optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    },
    async ({ query, status, limit }) =>
      call(() =>
        api.request("/direct/admin/cleaner-applications", {
          query: { q: query, status, limit },
        }),
      ),
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
    "create_booking",
    {
      description:
        "Create a booking for the authenticated Instaclean customer using Mithril's canonical pricing and availability rules. Requires explicit confirmation.",
      inputSchema: z.object({
        ...bookingInput,
        confirm: z.literal(true),
      }),
    },
    async ({ confirm, ...body }) => {
      void confirm;
      return call(() => api.request("/direct/bookings", { method: "POST", body }));
    },
  );

  server.registerTool(
    "create_admin_booking",
    {
      description:
        "Create a booking on behalf of an Instaclean customer using Mithril's canonical booking pipeline. Explicit customer consent is required.",
      inputSchema: z.object({
        customerUserId: z.uuid(),
        ...bookingInput,
        source: z.enum(["admin", "phone", "whatsapp"]).default("admin"),
        consentConfirmed: z.literal(true),
        adminNote: z.string().trim().max(2000).optional(),
      }),
    },
    async (input) =>
      call(() => api.request("/direct/admin/bookings", { method: "POST", body: input })),
  );

  server.registerTool(
    "preview_cancellation",
    {
      description:
        "Preview whether a booking can be cancelled and the policy-derived refund tier and amount. Does not modify the booking.",
      inputSchema: z.object({ bookingId: z.uuid() }),
    },
    async ({ bookingId }) =>
      call(() => api.request(`/direct/bookings/${bookingId}/cancellation-policy`)),
  );

  server.registerTool(
    "cancel_booking",
    {
      description:
        "Cancel a booking after explicit confirmation. Mithril enforces ownership/admin access and cancellation policy, and queues any eligible refund for review.",
      inputSchema: z.object({
        bookingId: z.uuid(),
        reason: z.string().trim().max(500).optional(),
        confirm: z.literal(true),
      }),
    },
    async ({ bookingId, reason, confirm }) => {
      void confirm;
      return call(() =>
        api.request(`/direct/bookings/${bookingId}/cancel`, {
          method: "POST",
          body: { reason },
        }),
      );
    },
  );

  server.registerTool(
    "request_refund",
    {
      description:
        "Request a refund review for a paid booking after explicit confirmation. This records an auditable request and does not directly send money through Paystack.",
      inputSchema: z.object({
        bookingId: z.uuid(),
        reason: z.string().trim().min(3).max(2000),
        confirm: z.literal(true),
      }),
    },
    async ({ bookingId, reason, confirm }) => {
      void confirm;
      return call(() =>
        api.request(`/direct/bookings/${bookingId}/refund-request`, {
          method: "POST",
          body: { reason },
        }),
      );
    },
  );

  server.registerTool(
    "reschedule_booking",
    {
      description:
        "Reschedule a paid one-off booking after explicit confirmation. Mithril revalidates the timeslot and cleaner availability before changing it.",
      inputSchema: z.object({
        bookingId: z.uuid(),
        scheduledDate: z.iso.date(),
        scheduledTime: bookingTime,
        timezone: z.string().trim().min(1).optional(),
        confirm: z.literal(true),
      }),
    },
    async ({ bookingId, scheduledDate, scheduledTime, timezone, confirm }) => {
      void confirm;
      return call(() =>
        api.request(`/direct/bookings/${bookingId}/reschedule`, {
          method: "POST",
          body: { scheduledDate, scheduledTime, timezone },
        }),
      );
    },
  );

  server.registerTool(
    "approve_cleaner",
    {
      description:
        "Approve a cleaner application after explicit confirmation. Requires an admin actor and uses Instaclean's canonical cleaner approval transaction.",
      inputSchema: z.object({
        applicationId: z.uuid(),
        confirm: z.literal(true),
      }),
    },
    async ({ applicationId, confirm }) => {
      void confirm;
      return call(() =>
        api.request(`/direct/admin/cleaner-applications/${applicationId}/approve`, {
          method: "POST",
        }),
      );
    },
  );

  server.registerTool(
    "diagnose_payment",
    {
      description:
        "Explain why a booking payment may have failed by inspecting Instaclean payment attempts and checking the latest Paystack reference. Requires an admin actor.",
      inputSchema: z.object({ bookingId: z.uuid() }),
    },
    async ({ bookingId }) =>
      call(() => api.request(`/direct/admin/bookings/${bookingId}/payment-diagnostics`)),
  );

  server.registerTool(
    "create_urgent_help_request",
    {
      description:
        "Create a non-medical urgent household-help request for the authenticated customer. This is not an emergency medical service.",
      inputSchema: z.object({
        role: z.enum([
          "househelp",
          "nanny",
          "cleaner",
          "elder_caregiver",
          "cook",
          "driver",
          "gardener",
        ]),
        priority: z.enum(["urgent", "same_day", "standard"]).default("urgent"),
        neededBy: z.iso.datetime({ offset: true }),
        durationHours: z.number().min(0.5).max(24),
        householdAddress: z.string().trim().min(3).max(500),
        requirements: z.record(z.string(), z.unknown()).default({}),
        notes: z.string().trim().max(4000).optional(),
      }),
    },
    async (input) =>
      call(() => api.request("/direct/urgent-help", { method: "POST", body: input })),
  );

  server.registerTool(
    "request_replacement",
    {
      description:
        "Request a qualified replacement professional for a booking owned by the authenticated customer.",
      inputSchema: z.object({
        bookingId: z.uuid(),
        priority: z.enum(["urgent", "same_day", "standard"]).default("same_day"),
        requirements: z.record(z.string(), z.unknown()).default({}),
        notes: z.string().trim().max(4000).optional(),
      }),
    },
    async ({ bookingId, ...body }) =>
      call(() =>
        api.request(`/direct/bookings/${bookingId}/replacement-request`, {
          method: "POST",
          body,
        }),
      ),
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
      call(() =>
        api.request(`/direct/admin/service-requests/${requestId}/assign`, {
          method: "POST",
          body,
        }),
      ),
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
      call(() =>
        api.request(`/direct/admin/service-requests/${requestId}/status`, {
          method: "POST",
          body,
        }),
      ),
  );

  server.registerTool(
    "list_twilio_messages",
    {
      description:
        "Read Twilio's own SMS and WhatsApp history for the Instaclean account. This is the provider log, including messages that were never copied into the Instaclean inbox. Requires an admin actor. Results are newest first, 50 at a time. Pass nextPageToken to read older pages. Filter with to or from exactly as Twilio stored the address, including the whatsapp: prefix.",
      inputSchema: z.object({
        to: z.string().trim().min(8).max(42).optional(),
        from: z.string().trim().min(8).max(42).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        pageToken: z.string().trim().regex(/^[A-Za-z0-9]{1,200}$/).optional(),
      }),
    },
    async ({ to, from, pageSize, pageToken }) =>
      call(() =>
        api.request("/direct/admin/twilio/messages", {
          query: { to, from, pageSize, pageToken },
        }),
      ),
  );

  server.registerTool(
    "list_whatsapp_threads",
    {
      description:
        "List the Instaclean staff WhatsApp inbox. Each thread includes the customer phone, last activity, and a short preview. Requires an admin actor.",
      inputSchema: z.object({}),
    },
    async () => call(() => api.request("/direct/admin/whatsapp/threads")),
  );

  server.registerTool(
    "list_whatsapp_messages",
    {
      description:
        "List WhatsApp messages for one customer phone in E.164 format. Requires an admin actor.",
      inputSchema: z.object({ phone: z.string().trim().min(8).max(32) }),
    },
    async ({ phone }) => call(() => api.request("/direct/admin/whatsapp/messages", { query: { phone } })),
  );

  server.registerTool(
    "send_whatsapp_message",
    {
      description:
        "Send a staff WhatsApp message through Mithril. Inside the 24-hour customer reply window the text is sent as typed. Outside that window Mithril uses the approved session follow-up template, or refuses if that template is unavailable. Requires an admin actor and confirm: true. Do not invent the phone number.",
      inputSchema: z.object({
        phoneE164: z.string().trim().min(8).max(32),
        body: z.string().trim().min(1).max(2000),
        confirm: z.literal(true),
      }),
    },
    async ({ confirm, ...body }) => {
      void confirm;
      return call(() => api.request("/direct/admin/whatsapp/send", { method: "POST", body }));
    },
  );

  server.registerTool(
    "send_sms",
    {
      description:
        "Send an SMS through Mithril's Twilio sender. Requires an admin actor and confirm: true. Do not invent the phone number. This does not send WhatsApp.",
      inputSchema: z.object({
        phoneE164: z.string().trim().min(8).max(32),
        body: z.string().trim().min(1).max(2000),
        confirm: z.literal(true),
      }),
    },
    async ({ confirm, ...body }) => {
      void confirm;
      return call(() => api.request("/direct/admin/whatsapp/sms", { method: "POST", body }));
    },
  );

  server.registerTool(
    "create_whatsapp_customer",
    {
      description:
        "Open an Instaclean customer account for a WhatsApp phone number. An existing account keeps its current name when one is already saved. Requires an admin actor and confirm: true.",
      inputSchema: z.object({
        phoneE164: z.string().trim().min(8).max(32),
        name: z.string().trim().min(1).max(80),
        confirm: z.literal(true),
      }),
    },
    async ({ confirm, ...body }) => {
      void confirm;
      return call(() => api.request("/direct/admin/whatsapp/customers", { method: "POST", body }));
    },
  );

  server.registerTool(
    "start_whatsapp_booking_offer",
    {
      description:
        "Send a WhatsApp booking offer for a specific price. The booking is not created until the customer chooses a time. Requires an admin actor. Do not invent the amount.",
      inputSchema: z.object({
        customerUserId: z.uuid(),
        serviceId: z.number().int().positive(),
        amountMinor: z.number().int().min(100),
        address: z.string().trim().min(3).max(500),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        durationHours: z.number().min(1).max(24).optional(),
      }),
    },
    async (body) => call(() => api.request("/direct/admin/whatsapp/booking-offers", { method: "POST", body })),
  );

  server.registerTool(
    "get_whatsapp_booking_offer",
    {
      description: "Read the latest WhatsApp booking offer for a customer phone in E.164 format.",
      inputSchema: z.object({ phone: z.string().trim().min(8).max(32) }),
    },
    async ({ phone }) =>
      call(() => api.request("/direct/admin/whatsapp/booking-offers", { query: { phone } })),
  );

  server.registerTool(
    "accept_whatsapp_booking_offer",
    {
      description:
        "Record that the customer tapped Book. Returns the next three morning options and keeps the offer waiting for a time. Does not create a booking.",
      inputSchema: z.object({ offerId: z.uuid() }),
    },
    async ({ offerId }) =>
      call(() => api.request(`/direct/admin/whatsapp/booking-offers/${offerId}/accept`, { method: "POST", body: {} })),
  );

  server.registerTool(
    "schedule_whatsapp_booking_offer",
    {
      description:
        "Create the booking at the customer's chosen future date and time, set the customer total to the offered amount, and assign the nearest eligible cleaner. Date is YYYY-MM-DD and time is HH:MM between 06:00 and 20:00.",
      inputSchema: z.object({
        offerId: z.uuid(),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    },
    async ({ offerId, ...body }) =>
      call(() =>
        api.request(`/direct/admin/whatsapp/booking-offers/${offerId}/schedule`, { method: "POST", body }),
      ),
  );

  return server;
}
