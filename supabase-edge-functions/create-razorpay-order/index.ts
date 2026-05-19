import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RAZORPAY_KEY_ID     = Deno.env.get("RAZORPAY_KEY_ID")!;
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      company_id,
      plan_id,           // Supabase UUID
      razorpay_plan_id,  // Razorpay Plan ID from plans table (plan_XXXXXXXXXX)
      amount,
      billing_cycle,
      customer_email,
      customer_name,
      customer_phone,
      is_trial  = false, // If true, delays first charge by trial_days (free trial flow)
      trial_days = 7,    // Number of days before first charge fires
    } = await req.json();

    // Validate the Razorpay Plan ID is present
    if (!razorpay_plan_id) {
      return new Response(
        JSON.stringify({ error: "razorpay_plan_id is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    // Build the subscription payload.
    // For trial flow : set start_at = now + trial_days so Razorpay delays the first charge.
    // For paid flow  : no start_at — first charge fires immediately at checkout.
    const subscriptionPayload: Record<string, unknown> = {
      plan_id:     razorpay_plan_id,
      total_count: 12,   // 12 billing cycles; adjust for annual if needed
      quantity:    1,
      notify_info: {
        notify_phone: customer_phone || "",
        notify_email: customer_email || "",
      },
      notes: {
        company_id:    company_id     || "",
        plan_uuid:     plan_id        || "",
        billing_cycle: billing_cycle  || "monthly",
        customer_name: customer_name  || "",
        email:         customer_email || "",
        flow_type:     is_trial ? "trial" : "paid",
      },
    };

    // Add start_at for free trial — delays billing by trial_days
    if (is_trial) {
      const days = Number(trial_days) || 7;
      subscriptionPayload.start_at = Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
    }

    // Create a Razorpay SUBSCRIPTION (recurring) using the Plan ID
    const subscriptionResponse = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": authHeader },
      body: JSON.stringify(subscriptionPayload),
    });

    const subscription = await subscriptionResponse.json();

    if (!subscription.id) {
      console.error("Razorpay subscription creation failed:", subscription);
      return new Response(
        JSON.stringify({ error: subscription.error?.description || "Failed to create subscription." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pre-insert into payments table (webhook will update status after payment)
    await supabase.from("payments").insert({
      order_id:       subscription.id,  // subscription ID stored as order_id reference
      company_id:     company_id,
      plan_id:        plan_id,
      amount:         amount,
      email:          customer_email,
      payment_method: "pending",
      status:         "created",
      created_at:     new Date().toISOString(),
    });

    // Return subscription_id + key_id to frontend
    return new Response(
      JSON.stringify({
        subscription_id: subscription.id,
        id:              subscription.id,  // alias for compatibility
        key_id:          RAZORPAY_KEY_ID,
        status:          subscription.status,
        is_trial:        is_trial,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("create-razorpay-order error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
