import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RAZORPAY_KEY_ID     = Deno.env.get("RAZORPAY_KEY_ID") || "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") || "";
const SUPABASE_URL        = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Service role client used ONLY for trusted backend operations after caller auth
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // ── 1. AUTHENTICATE THE CALLER ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authoritative user ID from verified auth token
    const authenticatedUserId = authData.user.id;
    const authenticatedUserEmail = authData.user.email || "";

    // ── 2. PARSE REQUEST BODY ───────────────────────────────────────────────
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch (_) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const company_id     = body.company_id as string | undefined;
    const db_plan_id     = (body.db_plan_id || body.plan_id) as string | undefined;
    const billing_cycle  = (body.billing_cycle || body.cycle) as string | undefined;
    const customer_email = body.customer_email as string | undefined;
    const customer_name  = body.customer_name as string | undefined;
    const customer_phone = body.customer_phone as string | undefined;
    const is_trial       = Boolean(body.is_trial);
    const trial_days     = Number(body.trial_days) || 7;

    // ── 3. VALIDATE COMPANY OWNERSHIP ───────────────────────────────────────
    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: company, error: companyErr } = await supabaseAdmin
      .from("companies")
      .select("company_id, owner_user_id, company_name")
      .eq("company_id", company_id)
      .maybeSingle();

    if (companyErr) {
      console.error("Company lookup error:", companyErr);
      return new Response(
        JSON.stringify({ error: "Database error during company lookup" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!company || company.owner_user_id !== authenticatedUserId) {
      return new Response(
        JSON.stringify({ error: "You do not have access to this company" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. VALIDATE THE DATABASE PLAN ───────────────────────────────────────
    if (!db_plan_id) {
      return new Response(
        JSON.stringify({ error: "db_plan_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("plan_id", db_plan_id)
      .maybeSingle();

    if (planErr) {
      console.error("Plan lookup error:", planErr);
      return new Response(
        JSON.stringify({ error: "Database error during plan lookup" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!plan || plan.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Invalid or inactive plan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 5 & 6. DERIVE BILLING CYCLE & RAZORPAY PLAN ID (BACKEND-ONLY) ──────
    if (!billing_cycle) {
      return new Response(
        JSON.stringify({ error: "Billing cycle is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let normalizedCycle: "monthly" | "yearly";
    const cleanCycle = String(billing_cycle).toLowerCase().trim();
    if (cleanCycle === "yearly" || cleanCycle === "annual") {
      normalizedCycle = "yearly";
    } else if (cleanCycle === "monthly") {
      normalizedCycle = "monthly";
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid billing_cycle. Must be 'monthly' or 'yearly'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const derivedRazorpayPlanId = normalizedCycle === "yearly"
      ? plan.razorpay_plan_id_yearly
      : plan.razorpay_plan_id_monthly;

    if (!derivedRazorpayPlanId) {
      return new Response(
        JSON.stringify({ error: "Razorpay plan is not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 7. DERIVE AUTHORITATIVE AMOUNT FROM PLANS TABLE ─────────────────────
    const derivedAmount = normalizedCycle === "yearly"
      ? Number(plan.price_yearly)
      : Number(plan.price_monthly);

    // ── 8. CUSTOMER INFORMATION (AUTHENTICATED EMAIL FIRST) ─────────────────
    const verifiedEmail = authenticatedUserEmail || customer_email || "";
    const verifiedName  = customer_name || authData.user.user_metadata?.full_name || authData.user.user_metadata?.name || "";
    let rawPhone = customer_phone || authData.user.phone || "";
    let verifiedPhone = String(rawPhone).replace(/\D/g, "");
    if (verifiedPhone.length === 12 && verifiedPhone.startsWith("91")) {
      verifiedPhone = verifiedPhone.substring(2);
    }

    // ── 16. DUPLICATE SUBSCRIPTION CHECK ────────────────────────────────────
    const { data: existingSubs, error: existingErr } = await supabaseAdmin
      .from("subscriptions")
      .select("subscription_id, plan_id, billing_cycle, status, created_at")
      .eq("company_id", company.company_id)
      .in("status", ["created", "pending", "authenticated", "active", "trial", "trialing"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingErr) {
      console.warn("Existing subscription lookup warning:", existingErr);
    } else if (existingSubs && existingSubs.length > 0) {
      return new Response(
        JSON.stringify({
          error: "Company already has an active or in-progress subscription.",
          subscription_id: existingSubs[0].subscription_id,
          status: existingSubs[0].status,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 9 & 10. CREATE RAZORPAY SUBSCRIPTION ────────────────────────────────
    const rzpAuthHeader = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    const subscriptionPayload: Record<string, unknown> = {
      plan_id:     derivedRazorpayPlanId,
      total_count: normalizedCycle === "yearly" ? 10 : 120,
      quantity:    1,
      customer_notify: 0,
      notify_info: {
        notify_phone: verifiedPhone || "",
        notify_email: verifiedEmail || "",
      },
      notes: {
        company_id:    company.company_id,
        plan_uuid:     plan.plan_id,
        billing_cycle: normalizedCycle,
        customer_name: verifiedName,
        email:         verifiedEmail,
        flow_type:     is_trial ? "trial" : "paid",
      },
    };

    if (is_trial) {
      const days = Number(trial_days) || 7;
      subscriptionPayload.start_at = Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
    }

    const rzpResponse = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": rzpAuthHeader },
      body: JSON.stringify(subscriptionPayload),
    });

    const rzpSubscription = await rzpResponse.json();

    if (!rzpResponse.ok || !rzpSubscription.id) {
      console.error("Razorpay subscription creation failed:", rzpSubscription);
      const errMsg = rzpSubscription.error?.description || "Failed to create subscription with payment provider.";
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rzpSubscriptionId = rzpSubscription.id as string;
    const nowIso = new Date().toISOString();
    const initialStatus = "created";

    // ── 11 & 12. CREATE AUTHORITATIVE SUBSCRIPTIONS ROW ─────────────────────
    const { error: subInsertErr } = await supabaseAdmin.from("subscriptions").insert({
      subscription_id:          rzpSubscriptionId,
      company_id:               company.company_id,
      plan_id:                  plan.plan_id,
      user_id:                  authenticatedUserId,
      name:                     verifiedName || null,
      email:                    verifiedEmail || null,
      phone:                    verifiedPhone || null,
      billing_cycle:            normalizedCycle,
      billing_amount:           derivedAmount,
      plan_name:                plan.plan_name,
      status:                   initialStatus,
      auto_renew:               true,
      razorpay_subscription_id: rzpSubscriptionId,
      razorpay_customer_id:     (rzpSubscription.customer_id as string) || null,
      remarks:                  is_trial ? "7-day trial subscription created" : "Paid subscription created",
      created_at:               nowIso,
      updated_at:               nowIso,
    });

    if (subInsertErr) {
      console.error("CRITICAL: Subscriptions row insertion failed:", subInsertErr);
      return new Response(
        JSON.stringify({
          error: "Critical consistency error: subscription created with payment provider but failed to record locally.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 14. PRE-INSERT INITIAL PAYMENTS RECORD ──────────────────────────────
    const { error: payInsertErr } = await supabaseAdmin.from("payments").insert({
      order_id:        rzpSubscriptionId,
      subscription_id: rzpSubscriptionId,
      company_id:      company.company_id,
      plan_id:         plan.plan_id,
      amount:          derivedAmount,
      email:           verifiedEmail,
      name:            verifiedName || null,
      phone:           verifiedPhone || null,
      payment_method:  "pending",
      status:          "created",
      created_at:      nowIso,
    });

    if (payInsertErr) {
      console.warn("Warning: Initial payments row insertion failed:", payInsertErr);
    }

    // ── 18. RETURN COMPATIBLE RESPONSE ──────────────────────────────────────
    return new Response(
      JSON.stringify({
        subscription_id: rzpSubscriptionId,
        id:              rzpSubscriptionId,
        key_id:          RAZORPAY_KEY_ID,
        status:          rzpSubscription.status || "created",
        is_trial:        is_trial,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("create-razorpay-subscription error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
