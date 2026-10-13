// The Bet — Stripe webhook. Marks a profile Pro after a completed checkout.
// Configure the endpoint in Stripe (Dashboard > Developers > Webhooks, or `stripe listen` while testing).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

serve(async (req) => {
  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature") || "";
    const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2023-10-16" });
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
    } catch {
      return new Response("Invalid signature", { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      // One-time payment must actually be paid (not just opened).
      if (s.payment_status === "paid") await markPro(s);
    } else if (event.type === "checkout.session.async_payment_succeeded") {
      await markPro(event.data.object as Stripe.Checkout.Session);
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(String(e && (e as Error).message || e), { status: 500 });
  }
});

async function markPro(s: Stripe.Checkout.Session) {
  const uid = s.client_reference_id || s.metadata?.user_id;
  if (!uid) return;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error } = await supabase.from("profiles").update({ pro: true }).eq("id", uid);
  if (error) throw new Error("profile update failed: " + error.message);
}
