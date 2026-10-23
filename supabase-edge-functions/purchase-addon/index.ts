import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── ENVIRONMENT VARIABLES ───────────────────────────────────────────────────

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") || "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── HMAC-SHA256 SIGNATURE VERIFICATION ──────────────────────────────────────

async function computeHmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeCompare(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    // ── 1. AUTHENTICATE CALLER JWT ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing Bearer token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authenticatedUserId = authData.user.id;
    const authenticatedEmail = authData.user.email || "";

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

    const action = String(body.action || "create_order").toLowerCase();
    const company_id = body.company_id as string | undefined;

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. VERIFY COMPANY ACCESS ────────────────────────────────────────────
    const { data: company, error: companyErr } = await supabaseAdmin
      .from("companies")
      .select("company_id, owner_user_id, company_name")
      .eq("company_id", company_id)
      .maybeSingle();

    if (companyErr || !company) {
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let hasAccess = company.owner_user_id === authenticatedUserId;
    if (!hasAccess) {
      const { data: uRow } = await supabaseAdmin
        .from("users")
        .select("id, company_id")
        .eq("company_id", company_id)
        .eq("id", authenticatedUserId)
        .maybeSingle();
      if (uRow) hasAccess = true;
    }

    if (!hasAccess) {
      return new Response(
        JSON.stringify({ error: "You do not have access to this company" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Customer contact details
    const verifiedName =
      (body.customer_name as string) ||
      authData.user.user_metadata?.full_name ||
      authData.user.user_metadata?.name ||
      "Salon Owner";
    const verifiedEmail = authenticatedEmail || (body.customer_email as string) || "";
    let rawPhone = (body.customer_phone as string) || authData.user.phone || "";
    let verifiedPhone = String(rawPhone).replace(/\D/g, "");
    if (verifiedPhone.length === 12 && verifiedPhone.startsWith("91")) {
      verifiedPhone = verifiedPhone.substring(2);
    }

    // Resolve Active Subscription for this Company
    const { data: subRows } = await supabaseAdmin
      .from("subscriptions")
      .select("subscription_id, plan_id, status")
      .eq("company_id", company_id)
      .in("status", ["active", "trial", "trialing", "created", "authenticated"])
      .order("created_at", { ascending: false })
      .limit(1);

    const activeSub = subRows && subRows.length > 0 ? subRows[0] : null;
    const subscriptionId = activeSub ? activeSub.subscription_id : `direct_${company_id}`;

    // ── ACTION A: CREATE RAZORPAY ORDER ─────────────────────────────────────
    if (action === "create_order") {
      const addon_id = body.addon_id as string | undefined;
      const cycle = String(body.billing_cycle || body.cycle || "monthly").toLowerCase();

      if (!addon_id) {
        return new Response(
          JSON.stringify({ error: "addon_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch authoritative Add-on details from public.add_ons
      const { data: addon, error: addonErr } = await supabaseAdmin
        .from("add_ons")
        .select("*")
        .eq("addon_id", addon_id)
        .eq("status", "active")
        .maybeSingle();

      if (addonErr || !addon) {
        return new Response(
          JSON.stringify({ error: "Add-on not found or inactive" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isYearly = cycle === "yearly" || cycle === "annual";
      const derivedAmount = isYearly ? Number(addon.price_yearly) : Number(addon.price_monthly);
      const durationDays = isYearly
        ? Number(addon.duration_yearly || 365)
        : Number(addon.duration_monthly || 30);

      if (!Number.isFinite(derivedAmount) || derivedAmount <= 0) {
        return new Response(
          JSON.stringify({ error: "Invalid add-on price configured" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if already active in subscription_add_ons
      const { data: existingActive } = await supabaseAdmin
        .from("subscription_add_ons")
        .select("id, status")
        .eq("company_id", company_id)
        .eq("addon_id", addon_id)
        .eq("status", "active")
        .maybeSingle();

      if (existingActive) {
        return new Response(
          JSON.stringify({ error: "This add-on is already active on your account." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
        return new Response(
          JSON.stringify({ error: "Payment gateway credentials are not configured on server." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const rzpAuthHeader = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
      const amountPaise = Math.round(derivedAmount * 100);

      // Create Razorpay Order
      const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: rzpAuthHeader,
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: "INR",
          receipt: `addon_${String(addon_id).slice(0, 8)}_${Date.now().toString().slice(-6)}`,
          notes: {
            type: "addon_purchase",
            company_id: company_id,
            subscription_id: subscriptionId,
            addon_id: addon.addon_id,
            addon_name: addon.name,
            cycle: isYearly ? "yearly" : "monthly",
          },
        }),
      });

      const orderData = await rzpRes.json();

      if (!rzpRes.ok || !orderData.id) {
        console.error("Razorpay order creation failed:", orderData);
        return new Response(
          JSON.stringify({ error: orderData?.error?.description || "Failed to create payment order" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          order_id: orderData.id,
          key_id: RAZORPAY_KEY_ID,
          amount: derivedAmount,
          currency: "INR",
          addon_id: addon.addon_id,
          addon_name: addon.name,
          billing_cycle: isYearly ? "yearly" : "monthly",
          duration_days: durationDays,
          customer_name: verifiedName,
          customer_email: verifiedEmail,
          customer_phone: verifiedPhone,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION B: VERIFY PAYMENT & ACTIVATE ADD-ON ───────────────────────────
    if (action === "verify_and_activate") {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        addon_id,
        billing_cycle,
      } = body as Record<string, string>;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !addon_id) {
        return new Response(
          JSON.stringify({ error: "Missing required payment verification parameters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Verify HMAC Signature
      const expectedSign = await computeHmacSha256Hex(
        RAZORPAY_KEY_SECRET,
        `${razorpay_order_id}|${razorpay_payment_id}`
      );

      if (!safeCompare(expectedSign, razorpay_signature)) {
        console.error("Signature mismatch in verify_and_activate:", { expectedSign, razorpay_signature });
        return new Response(
          JSON.stringify({ error: "Payment verification failed: Signature mismatch" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2. Fetch payment details from Razorpay to get confirmed payment method
      const rzpAuthHeader = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
      let paymentMethod = "online";

      try {
        const payRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
          headers: { Authorization: rzpAuthHeader },
        });
        if (payRes.ok) {
          const payData = await payRes.json();
          paymentMethod = payData.method || "online";
        }
      } catch (e) {
        console.warn("Could not fetch payment method detail from Razorpay:", e);
      }

      // 3. Derive authoritative price & duration from add_ons
      const { data: addon, error: aErr } = await supabaseAdmin
        .from("add_ons")
        .select("*")
        .eq("addon_id", addon_id)
        .maybeSingle();

      if (aErr || !addon) {
        return new Response(
          JSON.stringify({ error: "Add-on definition not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isYearly = String(billing_cycle).toLowerCase() === "yearly" || String(billing_cycle).toLowerCase() === "annual";
      const price = isYearly ? Number(addon.price_yearly) : Number(addon.price_monthly);
      const durationDays = isYearly
        ? Number(addon.duration_yearly || 365)
        : Number(addon.duration_monthly || 30);

      // 4. Atomically activate add-on and record payment in Database via RPC
      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("activate_subscription_addon", {
        p_company_id: company_id,
        p_subscription_id: subscriptionId,
        p_addon_id: addon.addon_id,
        p_addon_name: addon.name,
        p_price: price,
        p_duration_days: durationDays,
        p_order_id: razorpay_order_id,
        p_payment_id: razorpay_payment_id,
        p_payment_method: paymentMethod,
        p_customer_name: verifiedName,
        p_customer_email: verifiedEmail,
        p_customer_phone: verifiedPhone,
      });

      if (rpcErr || (rpcRes && !rpcRes.success)) {
        console.error("activate_subscription_addon RPC error:", rpcErr || rpcRes);
        return new Response(
          JSON.stringify({ error: "Failed to record add-on in database: " + (rpcErr?.message || rpcRes?.message) }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`purchase-addon: Successfully activated [${addon.name}] for company [${company_id}]`);

      return new Response(
        JSON.stringify({
          success: true,
          message: `${addon.name} activated successfully!`,
          details: rpcRes,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION C: DEACTIVATE / REMOVE ACTIVE ADD-ON ──────────────────────────
    if (action === "deactivate") {
      const addon_id = body.addon_id as string | undefined;

      if (!addon_id) {
        return new Response(
          JSON.stringify({ error: "addon_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("deactivate_subscription_addon", {
        p_company_id: company_id,
        p_addon_id: addon_id,
      });

      if (rpcErr || (rpcRes && !rpcRes.success)) {
        return new Response(
          JSON.stringify({ error: rpcErr?.message || rpcRes?.message || "Failed to remove add-on" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Add-on removed successfully",
          details: rpcRes,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("purchase-addon error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
