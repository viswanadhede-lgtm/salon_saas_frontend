import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── ENVIRONMENT ───────────────────────────────────────────────────────────────

const RAZORPAY_WEBHOOK_SECRET =
  Deno.env.get("RAZORPAY_WEBHOOK_SECRET") || "";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") || "";

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Service-role client — never exposed to the client
const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
    },
  }
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-razorpay-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── HMAC-SHA256 HELPER ────────────────────────────────────────────────────────

async function computeHmacSha256Hex(
  secret: string,
  message: string
): Promise<string> {
  const enc = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(message)
  );

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Safe constant-time-like string comparison
function safeCompare(
  a: string,
  b: string
): boolean {
  if (!a || !b || a.length !== b.length) {
    return false;
  }

  let diff = 0;

  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

// ── JSON RESPONSE HELPER ─────────────────────────────────────────────────────

function jsonResponse(
  body: unknown,
  status = 200
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {

  // ── CORS preflight ────────────────────────────────────────────────────────

  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers: corsHeaders,
      }
    );
  }

  // ── Only POST is accepted ─────────────────────────────────────────────────

  if (req.method !== "POST") {
    return jsonResponse(
      {
        error: "Method not allowed",
      },
      405
    );
  }

  // ── READ RAW BODY FIRST ───────────────────────────────────────────────────

  let rawBody: string;

  try {
    rawBody = await req.text();
  } catch (e) {
    console.error(
      "razorpay-webhook: Failed to read request body:",
      e
    );

    return jsonResponse(
      {
        error: "Failed to read request body",
      },
      400
    );
  }

  // ── READ RAZORPAY SIGNATURE ───────────────────────────────────────────────

  const receivedSignature =
    req.headers.get("x-razorpay-signature") || "";

  if (!receivedSignature) {
    console.warn(
      "razorpay-webhook: Missing x-razorpay-signature header"
    );

    return jsonResponse(
      {
        error: "Invalid webhook signature",
      },
      401
    );
  }

  // ── VERIFY WEBHOOK SECRET ─────────────────────────────────────────────────

  if (!RAZORPAY_WEBHOOK_SECRET) {
    console.error(
      "razorpay-webhook: RAZORPAY_WEBHOOK_SECRET is not configured"
    );

    return jsonResponse(
      {
        error: "Webhook secret not configured",
      },
      500
    );
  }

  // ── COMPUTE HMAC ──────────────────────────────────────────────────────────

  let computedSignature: string;

  try {
    computedSignature =
      await computeHmacSha256Hex(
        RAZORPAY_WEBHOOK_SECRET,
        rawBody
      );
  } catch (e) {
    console.error(
      "razorpay-webhook: HMAC computation failed:",
      e
    );

    return jsonResponse(
      {
        error: "Signature computation failed",
      },
      500
    );
  }

  // ── REJECT INVALID SIGNATURES ─────────────────────────────────────────────

  if (
    !safeCompare(
      computedSignature,
      receivedSignature
    )
  ) {
    console.warn(
      "razorpay-webhook: Signature mismatch — rejecting event"
    );

    return jsonResponse(
      {
        error: "Invalid webhook signature",
      },
      401
    );
  }

  // ── PARSE JSON ONLY AFTER SIGNATURE VERIFICATION ──────────────────────────

  let event: Record<string, unknown>;

  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    console.error(
      "razorpay-webhook: Invalid JSON in request body:",
      e
    );

    return jsonResponse(
      {
        error: "Invalid JSON body",
      },
      400
    );
  }

  const eventName =
    event.event as string | undefined;

  if (!eventName) {
    console.warn(
      "razorpay-webhook: Missing event name in payload"
    );

    return jsonResponse(
      {
        error: "Missing event name",
      },
      400
    );
  }

  console.log(
    `razorpay-webhook: Received event [${eventName}]`
  );

  // ── ROUTE EVENT ───────────────────────────────────────────────────────────

  try {
    switch (eventName) {

      case "invoice.paid":
        return await handleInvoicePaid(event);

      case "invoice.expired":
        return await handleInvoiceExpired(event);

      case "subscription.authenticated":
        return await handleSubscriptionLifecycle(
          event,
          "authenticated"
        );

      case "subscription.activated":
        return await handleSubscriptionLifecycle(
          event,
          "activated"
        );

      case "subscription.cancelled":
        return await handleSubscriptionLifecycle(
          event,
          "cancelled"
        );

      case "subscription.halted":
        return await handleSubscriptionLifecycle(
          event,
          "halted"
        );

      case "subscription.completed":
        return await handleSubscriptionLifecycle(
          event,
          "completed"
        );

      default:
        // Unknown but validly-signed event.
        // Acknowledge without mutation.
        console.log(
          `razorpay-webhook: Unknown event [${eventName}] — no action taken`
        );

        return jsonResponse({
          received: true,
          event: eventName,
          action: "ignored",
        });
    }

  } catch (err: any) {

    console.error(
      `razorpay-webhook: Unhandled exception for event [${eventName}]:`,
      err
    );

    return jsonResponse(
      {
        error: "Internal server error",
      },
      500
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: invoice.paid
// ─────────────────────────────────────────────────────────────────────────────

async function handleInvoicePaid(
  event: Record<string, unknown>
): Promise<Response> {

  const payload =
    (event.payload as Record<string, unknown>) || {};

  const invoiceEntity =
    (
      (payload.invoice as Record<string, unknown>)
        ?.entity as Record<string, unknown>
    ) || {};

  const rzpSubscriptionId =
    invoiceEntity.subscription_id as
    | string
    | undefined;

  const rzpInvoiceId =
    (invoiceEntity.id as string | undefined) ||
    (invoiceEntity.invoice_id as string | undefined);

  const rzpPaymentId =
    invoiceEntity.payment_id as
    | string
    | undefined;

  // Razorpay amounts are in paise.
  const rzpAmountRaw =
    invoiceEntity.amount_paid as
    | number
    | undefined;

  const paidAmount =
    rzpAmountRaw != null
      ? rzpAmountRaw / 100
      : null;

  const paidAt =
    invoiceEntity.paid_at as
    | number
    | undefined;

  const paidAtIso =
    paidAt
      ? new Date(
        paidAt * 1000
      ).toISOString()
      : new Date().toISOString();

  // Payment method comes only from Razorpay.
  const paymentEntity =
    (
      (payload.payment as Record<string, unknown>)
        ?.entity as Record<string, unknown>
    ) || {};

  const paymentMethod =
    (paymentEntity.method as string | undefined) ||
    null;

  console.log(
    `razorpay-webhook: invoice.paid | ` +
    `rzp_subscription_id=${rzpSubscriptionId} | ` +
    `invoice_id=${rzpInvoiceId} | ` +
    `payment_id=${rzpPaymentId}`
  );

  if (!rzpSubscriptionId) {
    console.error(
      "razorpay-webhook: invoice.paid — missing subscription_id in invoice entity"
    );

    return jsonResponse(
      {
        error:
          "Missing subscription_id in invoice payload",
      },
      400
    );
  }

  // ── IDEMPOTENCY: payment_id ───────────────────────────────────────────────

  if (rzpPaymentId) {

    const {
      data: existingPayment,
      error: dupCheckErr,
    } = await supabaseAdmin
      .from("payments")
      .select("id, status")
      .eq("payment_id", rzpPaymentId)
      .maybeSingle();

    if (dupCheckErr) {
      console.error(
        "razorpay-webhook: invoice.paid — duplicate payment check failed:",
        dupCheckErr
      );

      return jsonResponse(
        {
          error:
            "Database error during idempotency check",
        },
        500
      );
    }

    if (existingPayment) {
      console.log(
        `razorpay-webhook: invoice.paid — payment_id ` +
        `[${rzpPaymentId}] already recorded ` +
        `(id=${existingPayment.id}). Idempotent skip.`
      );

      return jsonResponse({
        received: true,
        action: "already_processed",
        payment_id: rzpPaymentId,
      });
    }
  }

  // ── IDEMPOTENCY: invoice_id ───────────────────────────────────────────────

  if (rzpInvoiceId) {

    const {
      data: existingByInvoice,
      error: dupInvoiceErr,
    } = await supabaseAdmin
      .from("payments")
      .select("id, status")
      .or(
        `invoice_id.eq.${rzpInvoiceId},order_id.eq.${rzpInvoiceId}`
      )
      .eq("status", "paid")
      .maybeSingle();

    if (dupInvoiceErr) {
      console.error(
        "razorpay-webhook: invoice.paid — invoice duplicate check failed:",
        dupInvoiceErr
      );

      return jsonResponse(
        {
          error:
            "Database error during idempotency check",
        },
        500
      );
    }

    if (existingByInvoice) {
      console.log(
        `razorpay-webhook: invoice.paid — invoice_id ` +
        `[${rzpInvoiceId}] already recorded as paid.`
      );

      return jsonResponse({
        received: true,
        action: "already_processed",
        invoice_id: rzpInvoiceId,
      });
    }
  }

  // ── BRIDGE: Resolve local subscription ────────────────────────────────────

  const {
    data: localSub,
    error: subLookupErr,
  } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "subscription_id, company_id, plan_id, user_id, billing_cycle, plan_name"
    )
    .eq(
      "subscription_id",
      rzpSubscriptionId
    )
    .maybeSingle();

  if (subLookupErr) {
    console.error(
      `razorpay-webhook: invoice.paid — local subscription lookup error for [${rzpSubscriptionId}]:`,
      subLookupErr
    );

    return jsonResponse(
      {
        error:
          "Database error during subscription lookup",
      },
      500
    );
  }

  if (!localSub) {

    // Never fabricate a payment row without a local subscription.
    console.error(
      `razorpay-webhook: invoice.paid — no local subscription found for rzp_subscription_id [${rzpSubscriptionId}]. Cannot process payment.`
    );

    return jsonResponse(
      {
        error:
          "Local subscription not found for Razorpay subscription ID",
        rzp_subscription_id:
          rzpSubscriptionId,
      },
      422
    );
  }

  const {
    company_id,
    plan_id,
    subscription_id,
  } = localSub;

  console.log(
    `razorpay-webhook: invoice.paid — ` +
    `resolved local company_id=${company_id} ` +
    `plan_id=${plan_id}`
  );

  // ── FIND EXISTING INITIAL PAYMENT ROW ─────────────────────────────────────
  //
  // The create function already creates:
  //
  // status = created
  // payment_method = pending
  // subscription_id = Razorpay subscription ID
  //
  // For the FIRST invoice.paid event, update that row instead
  // of inserting a duplicate payment record.

  const {
    data: existingPendingPayment,
    error: pendingLookupErr,
  } = await supabaseAdmin
    .from("payments")
    .select("id, status")
    .eq(
      "subscription_id",
      subscription_id
    )
    .eq(
      "status",
      "created"
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    )
    .limit(1)
    .maybeSingle();

  if (pendingLookupErr) {
    console.error(
      "razorpay-webhook: invoice.paid — pending payment lookup failed:",
      pendingLookupErr
    );

    return jsonResponse(
      {
        error:
          "Database error during pending payment lookup",
      },
      500
    );
  }

  const nowIso =
    new Date().toISOString();

  // ── UPDATE EXISTING INITIAL PAYMENT ──────────────────────────────────────

  if (existingPendingPayment) {

    const {
      error: paymentUpdateErr,
    } = await supabaseAdmin
      .from("payments")
      .update({
        order_id:
          rzpInvoiceId ||
          rzpSubscriptionId,

        invoice_id:
          rzpInvoiceId ||
          null,

        payment_id:
          rzpPaymentId ||
          null,

        amount:
          paidAmount,

        payment_method:
          paymentMethod,

        status:
          "paid",
      })
      .eq(
        "id",
        existingPendingPayment.id
      );

    if (paymentUpdateErr) {
      console.error(
        "razorpay-webhook: invoice.paid — existing payment update failed:",
        paymentUpdateErr
      );

      return jsonResponse(
        {
          error:
            "Database error: failed to update payment",
        },
        500
      );
    }

    console.log(
      `razorpay-webhook: invoice.paid — ` +
      `updated existing payment row [${existingPendingPayment.id}] to paid.`
    );

  } else {

    // ── RECURRING PAYMENT ───────────────────────────────────────────────────
    //
    // If there is no pending initial row, this is treated as a
    // subsequent recurring payment and gets a new ledger row.

    const {
      error: payInsertErr,
    } = await supabaseAdmin
      .from("payments")
      .insert({
        order_id:
          rzpInvoiceId ||
          rzpSubscriptionId,

        invoice_id:
          rzpInvoiceId ||
          null,

        subscription_id:
          subscription_id,

        company_id:
          company_id,

        plan_id:
          plan_id,

        amount:
          paidAmount,

        payment_id:
          rzpPaymentId ||
          null,

        email:
          null,

        name:
          null,

        payment_method:
          paymentMethod,

        status:
          "paid",

        created_at:
          paidAtIso ||
          nowIso,
      });

    if (payInsertErr) {
      console.error(
        "razorpay-webhook: invoice.paid — recurring payment insert failed:",
        payInsertErr
      );

      return jsonResponse(
        {
          error:
            "Database error: failed to record payment",
        },
        500
      );
    }

    console.log(
      "razorpay-webhook: invoice.paid — " +
      "created recurring payment row."
    );
  }

  // ── UPDATE SUBSCRIPTION ───────────────────────────────────────────────────
  //
  // invoice.paid is the authoritative confirmed payment event.
  // Only this event grants the paid subscription ACTIVE status.

  const subUpdate:
    Record<string, unknown> = {
    status:
      "active",

    updated_at:
      nowIso,
  };

  // Use Razorpay invoice dates when available.

  if (
    invoiceEntity.billing_start != null
  ) {
    subUpdate.subscription_start_date =
      new Date(
        (invoiceEntity.billing_start as number) *
        1000
      ).toISOString();
  }

  if (
    invoiceEntity.billing_end != null
  ) {
    subUpdate.subscription_end_date =
      new Date(
        (invoiceEntity.billing_end as number) *
        1000
      ).toISOString();

    subUpdate.next_billing_at =
      new Date(
        (invoiceEntity.billing_end as number) *
        1000
      ).toISOString();
  }

  const {
    error: subUpdateErr,
  } = await supabaseAdmin
    .from("subscriptions")
    .update(subUpdate)
    .eq(
      "subscription_id",
      rzpSubscriptionId
    );

  if (subUpdateErr) {
    console.error(
      `razorpay-webhook: invoice.paid — subscriptions update failed for [${rzpSubscriptionId}]:`,
      subUpdateErr
    );

    return jsonResponse(
      {
        error:
          "Database error: failed to update subscription status",
      },
      500
    );
  }

  console.log(
    `razorpay-webhook: invoice.paid — processed successfully. ` +
    `company_id=${company_id} ` +
    `subscription_id=${subscription_id} ` +
    `payment_id=${rzpPaymentId}`
  );

  return jsonResponse({
    received: true,
    action: "processed",
    event: "invoice.paid",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: invoice.expired
// ─────────────────────────────────────────────────────────────────────────────

async function handleInvoiceExpired(
  event: Record<string, unknown>
): Promise<Response> {

  const payload =
    (event.payload as Record<string, unknown>) || {};

  const invoiceEntity =
    (
      (payload.invoice as Record<string, unknown>)
        ?.entity as Record<string, unknown>
    ) || {};

  const rzpSubscriptionId =
    invoiceEntity.subscription_id as
    | string
    | undefined;

  const rzpInvoiceId =
    (invoiceEntity.id as string | undefined) ||
    (invoiceEntity.invoice_id as string | undefined);

  const rzpAmountRaw =
    invoiceEntity.amount as
    | number
    | undefined;

  const invoiceAmount =
    rzpAmountRaw != null
      ? rzpAmountRaw / 100
      : null;

  const expiredAt =
    invoiceEntity.expired_at as
    | number
    | undefined;

  const expiredAtIso =
    expiredAt
      ? new Date(
        expiredAt * 1000
      ).toISOString()
      : new Date().toISOString();

  console.log(
    `razorpay-webhook: invoice.expired | ` +
    `rzp_subscription_id=${rzpSubscriptionId} | ` +
    `invoice_id=${rzpInvoiceId}`
  );

  if (!rzpSubscriptionId) {
    console.error(
      "razorpay-webhook: invoice.expired — missing subscription_id in invoice entity"
    );

    return jsonResponse(
      {
        error:
          "Missing subscription_id in invoice.expired payload",
      },
      400
    );
  }

  // ── IDEMPOTENCY ───────────────────────────────────────────────────────────

  if (rzpInvoiceId) {

    const {
      data: existingExpired,
      error: dupErr,
    } = await supabaseAdmin
      .from("payments")
      .select("id")
      .or(
        `invoice_id.eq.${rzpInvoiceId},order_id.eq.${rzpInvoiceId}`
      )
      .eq(
        "status",
        "expired"
      )
      .maybeSingle();

    if (dupErr) {
      console.error(
        "razorpay-webhook: invoice.expired — duplicate check failed:",
        dupErr
      );

      return jsonResponse(
        {
          error:
            "Database error during idempotency check",
        },
        500
      );
    }

    if (existingExpired) {
      console.log(
        `razorpay-webhook: invoice.expired — invoice_id [${rzpInvoiceId}] already recorded as expired.`
      );

      return jsonResponse({
        received: true,
        action: "already_processed",
        invoice_id: rzpInvoiceId,
      });
    }
  }

  // ── BRIDGE: Resolve local subscription ────────────────────────────────────

  const {
    data: localSub,
    error: subErr,
  } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "subscription_id, company_id, plan_id"
    )
    .eq(
      "subscription_id",
      rzpSubscriptionId
    )
    .maybeSingle();

  if (subErr) {
    console.error(
      `razorpay-webhook: invoice.expired — subscription lookup error for [${rzpSubscriptionId}]:`,
      subErr
    );

    return jsonResponse(
      {
        error:
          "Database error during subscription lookup",
      },
      500
    );
  }

  if (!localSub) {
    console.error(
      `razorpay-webhook: invoice.expired — no local subscription found for rzp_subscription_id [${rzpSubscriptionId}].`
    );

    return jsonResponse(
      {
        error:
          "Local subscription not found for Razorpay subscription ID",
        rzp_subscription_id:
          rzpSubscriptionId,
      },
      422
    );
  }

  // ── FIND INITIAL PENDING PAYMENT ──────────────────────────────────────────

  const {
    data: existingPendingPayment,
    error: pendingLookupErr,
  } = await supabaseAdmin
    .from("payments")
    .select("id, status")
    .eq(
      "subscription_id",
      localSub.subscription_id
    )
    .eq(
      "status",
      "created"
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    )
    .limit(1)
    .maybeSingle();

  if (pendingLookupErr) {
    console.error(
      "razorpay-webhook: invoice.expired — pending payment lookup failed:",
      pendingLookupErr
    );

    return jsonResponse(
      {
        error:
          "Database error during pending payment lookup",
      },
      500
    );
  }

  const nowIso =
    new Date().toISOString();

  // ── UPDATE INITIAL PAYMENT IF PRESENT ────────────────────────────────────

  if (existingPendingPayment) {

    const {
      error: paymentUpdateErr,
    } = await supabaseAdmin
      .from("payments")
      .update({
        order_id:
          rzpInvoiceId ||
          rzpSubscriptionId,

        invoice_id:
          rzpInvoiceId ||
          null,

        amount:
          invoiceAmount,

        payment_method:
          "pending",

        status:
          "expired",
      })
      .eq(
        "id",
        existingPendingPayment.id
      );

    if (paymentUpdateErr) {
      console.error(
        "razorpay-webhook: invoice.expired — existing payment update failed:",
        paymentUpdateErr
      );

      return jsonResponse(
        {
          error:
            "Database error: failed to update expired payment",
        },
        500
      );
    }

  } else {

    // ── RECURRING EXPIRED INVOICE ────────────────────────────────────────────

    const {
      error: payInsertErr,
    } = await supabaseAdmin
      .from("payments")
      .insert({
        order_id:
          rzpInvoiceId ||
          rzpSubscriptionId,

        invoice_id:
          rzpInvoiceId ||
          null,

        subscription_id:
          localSub.subscription_id,

        company_id:
          localSub.company_id,

        plan_id:
          localSub.plan_id,

        amount:
          invoiceAmount,

        payment_method:
          "pending",

        status:
          "expired",

        created_at:
          expiredAtIso ||
          nowIso,
      });

    if (payInsertErr) {
      console.error(
        "razorpay-webhook: invoice.expired — payments insert failed:",
        payInsertErr
      );

      return jsonResponse(
        {
          error:
            "Database error: failed to record expired invoice",
        },
        500
      );
    }
  }

  // ── UPDATE LOCAL SUBSCRIPTION TIMESTAMP ONLY ──────────────────────────────
  //
  // invoice.expired by itself does not automatically set a new access
  // status here. Subscription lifecycle events remain responsible for
  // cancelled/halted/completed states.

  const {
    error: subUpdateErr,
  } = await supabaseAdmin
    .from("subscriptions")
    .update({
      updated_at:
        nowIso,
    })
    .eq(
      "subscription_id",
      rzpSubscriptionId
    );

  if (subUpdateErr) {
    console.error(
      `razorpay-webhook: invoice.expired — subscriptions update failed for [${rzpSubscriptionId}]:`,
      subUpdateErr
    );

    return jsonResponse(
      {
        error:
          "Database error: failed to update subscription",
      },
      500
    );
  }

  console.log(
    `razorpay-webhook: invoice.expired — recorded. ` +
    `invoice_id=${rzpInvoiceId} ` +
    `subscription_id=${rzpSubscriptionId} ` +
    `company_id=${localSub.company_id}`
  );

  return jsonResponse({
    received: true,
    action: "processed",
    event: "invoice.expired",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: subscription lifecycle events
//
// Handles:
// subscription.authenticated
// subscription.activated
// subscription.cancelled
// subscription.halted
// subscription.completed
// ─────────────────────────────────────────────────────────────────────────────

async function handleSubscriptionLifecycle(
  event: Record<string, unknown>,
  targetStatus:
    | "authenticated"
    | "activated"
    | "cancelled"
    | "halted"
    | "completed"
): Promise<Response> {

  const eventName =
    event.event as string;

  const payload =
    (event.payload as Record<string, unknown>) || {};

  const subEntity =
    (
      (payload.subscription as Record<string, unknown>)
        ?.entity as Record<string, unknown>
    ) || {};

  const rzpSubId =
    subEntity.id as
    | string
    | undefined;

  console.log(
    `razorpay-webhook: ${eventName} | rzp_subscription_id=${rzpSubId}`
  );

  if (!rzpSubId) {
    console.error(
      `razorpay-webhook: ${eventName} — missing subscription id in payload`
    );

    return jsonResponse(
      {
        error:
          `Missing subscription id in ${eventName} payload`,
      },
      400
    );
  }

  // ── RESOLVE LOCAL SUBSCRIPTION ────────────────────────────────────────────

  const {
    data: localSub,
    error: lookupErr,
  } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "subscription_id, company_id, status, remarks"
    )
    .eq(
      "subscription_id",
      rzpSubId
    )
    .maybeSingle();

  if (lookupErr) {
    console.error(
      `razorpay-webhook: ${eventName} — subscription lookup error:`,
      lookupErr
    );

    return jsonResponse(
      {
        error:
          "Database error during subscription lookup",
      },
      500
    );
  }

  if (!localSub) {
    console.error(
      `razorpay-webhook: ${eventName} — no local subscription found for rzp_id [${rzpSubId}]`
    );

    return jsonResponse(
      {
        error:
          "Local subscription not found for Razorpay subscription ID",
        rzp_subscription_id:
          rzpSubId,
      },
      422
    );
  }

  const nowIso =
    new Date().toISOString();

  // ── DEFAULT UPDATE ────────────────────────────────────────────────────────

  const update:
    Record<string, unknown> = {
    updated_at:
      nowIso,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // subscription.authenticated
  //
  // This is the Razorpay technical authentication/mandate event.
  //
  // Trial:
  //     created → trial
  //
  // Paid:
  //     created → created
  //
  // We DO NOT set paid subscriptions to active here.
  // invoice.paid is the confirmed payment event.
  // ─────────────────────────────────────────────────────────────────────────

  if (
    targetStatus === "authenticated"
  ) {

    const notes =
      (
        subEntity.notes as
        | Record<string, unknown>
        | undefined
      ) || {};

    const flowType =
      String(
        notes.flow_type ||
        ""
      ).toLowerCase();

    const isTrial =
      flowType === "trial" ||
      String(
        localSub.remarks || ""
      ).toLowerCase().includes(
        "trial"
      );

    if (isTrial) {

      update.status =
        "trial";

      console.log(
        `razorpay-webhook: subscription.authenticated — ` +
        `trial subscription [${rzpSubId}] → trial`
      );

    } else {

      // Paid subscription remains non-active until invoice.paid.
      //
      // Normally current status will be "created".
      // If an older record happens to contain "authenticated",
      // normalize it back to created.

      if (
        localSub.status ===
        "authenticated"
      ) {
        update.status =
          "created";
      }

      console.log(
        `razorpay-webhook: subscription.authenticated — ` +
        `paid subscription [${rzpSubId}] remains non-active ` +
        `until invoice.paid`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // subscription.activated
  //
  // Razorpay's technical activated event does NOT independently grant
  // application access.
  //
  // Preserve the current business status.
  //
  // Trial remains trial.
  // Paid remains created until invoice.paid.
  //
  // We only use Razorpay dates when available.
  // ─────────────────────────────────────────────────────────────────────────

  else if (
    targetStatus === "activated"
  ) {

    // Do NOT set status = active here.

    if (
      localSub.status ===
      "active"
    ) {
      update.status =
        "active";
    } else if (
      localSub.status ===
      "trial"
    ) {
      update.status =
        "trial";
    } else if (
      localSub.status ===
      "trialing"
    ) {
      update.status =
        "trialing";
    } else {
      update.status =
        localSub.status ||
        "created";
    }

    // IMPORTANT:
    // subscription.activated is a Razorpay technical lifecycle event.
    // It must NOT overwrite the 7-day trial window.
    //
    // For a trial, the create function already stores:
    //   subscription_end_date = charge_at
    //   next_billing_at      = charge_at
    //
    // invoice.paid is responsible for replacing those dates with the
    // confirmed paid billing period. Therefore, preserve the existing
    // trial dates while the subscription is still in trial.
    if (localSub.status !== "trial" && localSub.status !== "trialing") {
      if (
        subEntity.current_start != null
      ) {
        update.subscription_start_date =
          new Date(
            (subEntity.current_start as number) *
            1000
          ).toISOString();
      }

      if (
        subEntity.current_end != null
      ) {
        update.subscription_end_date =
          new Date(
            (subEntity.current_end as number) *
            1000
          ).toISOString();

        update.next_billing_at =
          new Date(
            (subEntity.current_end as number) *
            1000
          ).toISOString();
      }
    } else {
      console.log(
        `razorpay-webhook: subscription.activated — ` +
        `preserving trial dates for [${rzpSubId}]`
      );
    }

    console.log(
      `razorpay-webhook: subscription.activated — ` +
      `subscription [${rzpSubId}] preserved business status [${update.status}]`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // subscription.cancelled
  // ─────────────────────────────────────────────────────────────────────────

  else if (
    targetStatus === "cancelled"
  ) {

    update.status =
      "cancelled";

    if (
      subEntity.ended_at != null
    ) {

      update.subscription_end_date =
        new Date(
          (subEntity.ended_at as number) *
          1000
        ).toISOString();

    } else if (
      subEntity.cancel_at != null
    ) {

      update.subscription_end_date =
        new Date(
          (subEntity.cancel_at as number) *
          1000
        ).toISOString();
    }

    console.log(
      `razorpay-webhook: subscription.cancelled — ` +
      `subscription [${rzpSubId}] → cancelled`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // subscription.halted
  // ─────────────────────────────────────────────────────────────────────────

  else if (
    targetStatus === "halted"
  ) {

    update.status =
      "halted";

    console.log(
      `razorpay-webhook: subscription.halted — ` +
      `subscription [${rzpSubId}] → halted`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // subscription.completed
  // ─────────────────────────────────────────────────────────────────────────

  else if (
    targetStatus === "completed"
  ) {

    update.status =
      "completed";

    if (
      subEntity.ended_at != null
    ) {

      update.subscription_end_date =
        new Date(
          (subEntity.ended_at as number) *
          1000
        ).toISOString();

    } else if (
      subEntity.current_end != null
    ) {

      update.subscription_end_date =
        new Date(
          (subEntity.current_end as number) *
          1000
        ).toISOString();
    }

    console.log(
      `razorpay-webhook: subscription.completed — ` +
      `subscription [${rzpSubId}] → completed`
    );
  }

  // ── UPDATE SUBSCRIPTIONS ONLY ────────────────────────────────────────────
  //
  // Never update companies.subscription_status.
  // subscriptions is the authoritative subscription state.

  const {
    error: updateErr,
  } = await supabaseAdmin
    .from("subscriptions")
    .update(update)
    .eq(
      "subscription_id",
      rzpSubId
    );

  if (updateErr) {
    console.error(
      `razorpay-webhook: ${eventName} — subscriptions update failed for [${rzpSubId}]:`,
      updateErr
    );

    return jsonResponse(
      {
        error:
          `Database error: failed to update subscription for ${eventName}`,
      },
      500
    );
  }

  console.log(
    `razorpay-webhook: ${eventName} — ` +
    `subscription [${rzpSubId}] → status [${update.status}] | ` +
    `company_id=${localSub.company_id}`
  );

  return jsonResponse({
    received: true,
    action: "processed",
    event: eventName,
    status: update.status,
  });
}