import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── ENVIRONMENT VARIABLES ───────────────────────────────────────────────────

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") || "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Service role client used ONLY for trusted backend operations after caller auth
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    // ── 1. AUTHENTICATE THE CALLER ──────────────────────────────────────────
    const authHeader =
      req.headers.get("Authorization") ||
      req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing or invalid token" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Empty token" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid session" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const authenticatedUserId = authData.user.id;

    // ── 2. PARSE REQUEST BODY ───────────────────────────────────────────────
    let body: Record<string, unknown> = {};

    try {
      body = await req.json();
    } catch (_) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const company_id = body.company_id as string | undefined;
    const subscription_id = body.subscription_id as string | undefined;
    const reason = (body.reason as string | undefined) || "other";
    const feedback = (body.feedback as string | undefined) || "";
    // Default to cancelling at billing cycle end so customer retains paid access
    const cancel_at_cycle_end = body.cancel_at_cycle_end !== false;

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ── 3. VALIDATE COMPANY ACCESS ──────────────────────────────────────────
    const { data: company, error: companyErr } = await supabaseAdmin
      .from("companies")
      .select("company_id, owner_user_id, company_name")
      .eq("company_id", company_id)
      .maybeSingle();

    if (companyErr) {
      console.error("Company lookup error:", companyErr);
      return new Response(
        JSON.stringify({ error: "Database error during company lookup" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Check ownership or staff membership
    let hasAccess = company && company.owner_user_id === authenticatedUserId;

    if (!hasAccess && company) {
      const { data: userRow } = await supabaseAdmin
        .from("users")
        .select("id, company_id")
        .eq("company_id", company_id)
        .eq("id", authenticatedUserId)
        .maybeSingle();

      if (userRow) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return new Response(
        JSON.stringify({ error: "You do not have permission to manage subscriptions for this company" }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ── 4. RESOLVE ACTIVE LOCAL SUBSCRIPTION ────────────────────────────────
    let subQuery = supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("company_id", company_id);

    if (subscription_id && subscription_id.trim()) {
      subQuery = subQuery.or(
        `subscription_id.eq.${subscription_id},razorpay_subscription_id.eq.${subscription_id}`
      );
    } else {
      subQuery = subQuery
        .in("status", ["active", "trial", "trialing", "created", "authenticated"])
        .order("created_at", { ascending: false })
        .limit(1);
    }

    const { data: subs, error: subErr } = await subQuery;

    if (subErr) {
      console.error("Subscription lookup error:", subErr);
      return new Response(
        JSON.stringify({ error: "Database error while fetching subscription" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const currentSub = subs && subs.length > 0 ? subs[0] : null;

    if (!currentSub) {
      return new Response(
        JSON.stringify({ error: "No active subscription found to cancel for this company" }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Check if already fully cancelled
    if (currentSub.auto_renew === false && String(currentSub.status).toLowerCase() === "cancelled") {
      return new Response(
        JSON.stringify({
          success: true,
          already_cancelled: true,
          message: "Subscription is already cancelled",
          subscription_id: currentSub.subscription_id,
          status: currentSub.status,
          auto_renew: false,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ── 5. CANCEL IN RAZORPAY (STRICT ATOMIC REQUIREMENT) ─────────────────
    const rzpSubId =
      currentSub.razorpay_subscription_id ||
      (String(currentSub.subscription_id).startsWith("sub_") ? currentSub.subscription_id : null);

    // If there is no Razorpay Subscription ID, recurring billing cannot be safely stopped.
    // We MUST NOT mark it cancelled locally while recurring debits might still be active.
    if (!rzpSubId) {
      console.error(`cancel-subscription: Subscription [${currentSub.subscription_id}] has no Razorpay ID. Aborting.`);
      return new Response(
        JSON.stringify({
          error: "No active Razorpay subscription ID found for this account. Cannot verify mandate cancellation. Please contact support.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      console.error("cancel-subscription: RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Payment gateway credentials are not configured on server." }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let rzpCancelled = false;
    let rzpError: string | null = null;
    let isImmediateCancel = !cancel_at_cycle_end;

    const rzpAuthHeader = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    console.log(`cancel-subscription: Calling Razorpay API to cancel subscription [${rzpSubId}], cancel_at_cycle_end=${cancel_at_cycle_end}`);

    // Attempt cancellation at cycle end first
    let rzpRes = await fetch(
      `https://api.razorpay.com/v1/subscriptions/${rzpSubId}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": rzpAuthHeader,
        },
        body: JSON.stringify({
          cancel_at_cycle_end: cancel_at_cycle_end ? 1 : 0,
        }),
      }
    );

    let rzpData = await rzpRes.json().catch(() => ({}));

    // If Razorpay rejects cycle-end cancellation (e.g. unbilled trial or pending mandate),
    // fallback to immediate cancellation (cancel_at_cycle_end: 0)
    if (!rzpRes.ok) {
      const errorDesc = rzpData?.error?.description || "";
      console.warn(`cancel-subscription: Razorpay cancel with cycle_end=${cancel_at_cycle_end ? 1 : 0} responded:`, errorDesc);

      if (
        errorDesc.toLowerCase().includes("already cancelled") ||
        errorDesc.toLowerCase().includes("cannot be cancelled")
      ) {
        // Subscription already cancelled in Razorpay dashboard
        rzpCancelled = true;
      } else if (cancel_at_cycle_end) {
        console.log(`cancel-subscription: Retrying with immediate cancel for [${rzpSubId}]...`);
        rzpRes = await fetch(
          `https://api.razorpay.com/v1/subscriptions/${rzpSubId}/cancel`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": rzpAuthHeader,
            },
            body: JSON.stringify({
              cancel_at_cycle_end: 0,
            }),
          }
        );
        rzpData = await rzpRes.json().catch(() => ({}));

        if (rzpRes.ok) {
          rzpCancelled = true;
          isImmediateCancel = true;
        } else {
          rzpError = rzpData?.error?.description || "Razorpay cancellation failed";
        }
      } else {
        rzpError = errorDesc || "Razorpay cancellation failed";
      }
    } else {
      rzpCancelled = true;
    }

    // STRICT ATOMICITY: If Razorpay failed, STOP! Do not touch the database!
    if (rzpError && !rzpCancelled) {
      console.error(`cancel-subscription: Razorpay cancellation rejected:`, rzpError);
      return new Response(
        JSON.stringify({ error: `Payment gateway error: ${rzpError}. Subscription was NOT cancelled.` }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log(`cancel-subscription: Razorpay cancellation confirmed for [${rzpSubId}]. Proceeding to update local DB.`);

    // ── 6. ATOMICALLY UPDATE SUPABASE DATABASE VIA RPC ──────────────────────
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc(
      "cancel_company_subscription",
      {
        p_company_id: company_id,
        p_subscription_id: currentSub.subscription_id,
        p_reason: reason,
        p_feedback: feedback,
        p_immediate: isImmediateCancel,
      }
    );

    if (rpcErr) {
      console.error("cancel_company_subscription RPC error:", rpcErr);
      return new Response(
        JSON.stringify({ error: "Failed to update subscription in database: " + rpcErr.message }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ── 7. RETURN SUCCESS RESPONSE ──────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        message: isImmediateCancel
          ? "Subscription cancelled immediately"
          : "Subscription scheduled for cancellation at the end of the billing cycle",
        auto_renew: false,
        subscription_id: currentSub.subscription_id,
        subscription_end_date: rpcResult?.subscription_end_date || currentSub.subscription_end_date,
        details: rpcResult,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );

  } catch (err: any) {
    console.error("cancel-subscription unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
