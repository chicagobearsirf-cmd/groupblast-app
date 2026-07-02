import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlanStatus } from "@/hooks/use-plan-status";

const contactEmail = "guysadwise@gmail.com";
const MONTHLY_PRICE = 97;

// Stripe Payment Link (created in the Stripe dashboard). client_reference_id
// carries the Supabase user id so the stripe-webhook edge function can flip
// user_plans.plan without any manual mapping. Empty env → mailto fallback.
const stripePaymentLink = import.meta.env.VITE_STRIPE_PAYMENT_LINK as string | undefined;

function buildCheckoutUrl(userId: string, email?: string | null, promoCode?: string | null) {
  if (!stripePaymentLink) return null;
  const url = new URL(stripePaymentLink);
  url.searchParams.set("client_reference_id", userId);
  if (email) url.searchParams.set("prefilled_email", email);
  if (promoCode) url.searchParams.set("prefilled_promo_code", promoCode);
  return url.toString();
}

function priceAfterDiscount(discountPercent: number) {
  return (MONTHLY_PRICE * (1 - discountPercent / 100)).toFixed(2);
}

function TrialBanner({
  daysRemaining,
  promoCode,
}: {
  daysRemaining: number;
  promoCode: string | null;
}) {
  const { user } = useAuth();
  const checkoutUrl = user ? buildCheckoutUrl(user.id, user.email, promoCode) : null;

  // Final day: switch to an urgent banner with a direct subscribe CTA so the
  // hard gate the next day is never a surprise.
  if (daysRemaining <= 1) {
    return (
      <div className="border-b bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950">
        Your free trial ends today — {""}
        {checkoutUrl ? (
          <a href={checkoutUrl} target="_blank" rel="noreferrer" className="underline">
            subscribe now to keep posting
          </a>
        ) : (
          <a
            href={`mailto:${contactEmail}?subject=${encodeURIComponent("GroupBlast subscription")}`}
            className="underline"
          >
            email us to keep posting
          </a>
        )}
      </div>
    );
  }
  const label = `${daysRemaining} days remaining`;
  return (
    <div className="border-b bg-[#1e3a5f] px-4 py-2 text-center text-sm font-medium text-white">
      Trial: {label}
    </div>
  );
}

function TrialEndedScreen() {
  const { user } = useAuth();
  const plan = usePlanStatus();
  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const hasDiscount = plan.discountPercent > 0;
  const price = hasDiscount ? priceAfterDiscount(plan.discountPercent) : MONTHLY_PRICE.toFixed(2);

  const handleApplyCode = async () => {
    if (!code.trim()) return;
    setApplying(true);
    setFeedback(null);
    const result = await plan.applyPromoCode(code);
    setApplying(false);
    if (result.ok) {
      setFeedback(`${result.discountPercent}% discount applied.`);
    } else {
      setFeedback("That code isn't valid.");
    }
  };

  const subject = hasDiscount
    ? `GroupBlast subscription (code ${plan.promoCode})`
    : "GroupBlast subscription";

  const checkoutUrl = user ? buildCheckoutUrl(user.id, user.email, plan.promoCode) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 text-[#0f172a]">
      <div className="w-full max-w-lg text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1e3a5f]">
          Trial ended
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Your 4-day free trial has ended
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          Subscribe to keep using GroupBlast — ${price}/month
          {hasDiscount ? (
            <span className="text-slate-400"> (discount applied, normally ${MONTHLY_PRICE})</span>
          ) : null}
          . Contact us if you believe your account should have access.
        </p>

        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="text-sm text-slate-500">Military or first responder? Enter your discount code:</p>
          <div className="flex w-full max-w-xs gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Discount code"
              disabled={applying || hasDiscount}
            />
            <Button variant="outline" onClick={handleApplyCode} disabled={applying || hasDiscount}>
              Apply
            </Button>
          </div>
          {feedback ? <p className="text-sm text-slate-500">{feedback}</p> : null}
        </div>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {checkoutUrl ? (
            <Button asChild className="bg-[#1e3a5f] text-white hover:bg-[#172f4f]">
              <a href={checkoutUrl} target="_blank" rel="noreferrer">
                Subscribe — ${price}/month
              </a>
            </Button>
          ) : (
            <Button asChild className="bg-[#1e3a5f] text-white hover:bg-[#172f4f]">
              <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(subject)}`}>
                Contact us to subscribe
              </a>
            </Button>
          )}
          <Button asChild variant="outline">
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          </Button>
        </div>
        {checkoutUrl ? (
          <p className="mt-4 text-sm text-slate-500">
            Checkout opens in your browser. When you're done, come back to this window — access
            unlocks automatically.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function TrialGate({ children }: { children: ReactNode }) {
  const { mode } = useAuth();
  const plan = usePlanStatus();

  if (mode === "local") return <>{children}</>;

  if (plan.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking trial status…
        </div>
      </div>
    );
  }

  if (!plan.hasAccess) return <TrialEndedScreen />;

  return (
    <>
      {plan.status === "trial" ? (
        <TrialBanner daysRemaining={plan.daysRemaining} promoCode={plan.promoCode} />
      ) : null}
      {children}
    </>
  );
}
