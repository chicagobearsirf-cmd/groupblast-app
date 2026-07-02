// Stripe webhook → user_plans. Deployed with verify_jwt=false (Stripe can't
// send a Supabase JWT); authenticity comes from the Stripe signature check.
//
// Events handled:
//   checkout.session.completed          → plan='active', store stripe ids
//   customer.subscription.updated       → 'active' while active/trialing/past_due,
//                                         'expired' on canceled/unpaid
//   customer.subscription.deleted       → plan='expired'
//
// Pilot rows (is_pilot=true) are never downgraded.

import Stripe from "npm:stripe@18";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-06-30.basil",
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

function subscriptionPlan(status: Stripe.Subscription.Status): "active" | "expired" | null {
  // past_due keeps access — Stripe retries the card for days; don't lock a
  // paying customer out over one failed charge.
  if (status === "active" || status === "trialing" || status === "past_due") return "active";
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    return "expired";
  }
  return null;
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "",
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error(`Signature verification failed: ${err}`);
    return new Response("invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id;
        if (!userId) {
          // Someone paid outside the app flow (no user id attached). Surface it
          // loudly — this needs manual mapping, not a silent drop.
          console.error(`checkout.session.completed without client_reference_id: ${session.id}`);
          break;
        }
        const { error } = await supabase
          .from("user_plans")
          .update({
            plan: "active",
            stripe_customer_id:
              typeof session.customer === "string" ? session.customer : session.customer?.id,
            stripe_subscription_id:
              typeof session.subscription === "string"
                ? session.subscription
                : session.subscription?.id,
          })
          .eq("user_id", userId);
        if (error) throw error;
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const plan =
          event.type === "customer.subscription.deleted"
            ? "expired"
            : subscriptionPlan(subscription.status);
        if (!plan) break;
        const { error } = await supabase
          .from("user_plans")
          .update({ plan })
          .eq("stripe_subscription_id", subscription.id)
          .eq("is_pilot", false);
        if (error) throw error;
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`Handler failed for ${event.type}: ${err}`);
    // Non-2xx makes Stripe retry with backoff — right call for transient DB errors.
    return new Response("handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
