import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { Button } from "@/components/ui/button";
import { usePlanStatus } from "@/hooks/use-plan-status";

const contactEmail = "guysadwise@gmail.com";

function TrialBanner({ daysRemaining }: { daysRemaining: number }) {
  const label = daysRemaining === 1 ? "1 day remaining" : `${daysRemaining} days remaining`;
  return (
    <div className="border-b bg-[#1e3a5f] px-4 py-2 text-center text-sm font-medium text-white">
      Trial: {label}
    </div>
  );
}

function TrialEndedScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 text-[#0f172a]">
      <div className="w-full max-w-lg text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1e3a5f]">
          Trial ended
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Your 10-day free trial has ended
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          Subscribe to keep using GroupBlast, or contact us if you believe your account should have
          access.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild className="bg-[#1e3a5f] text-white hover:bg-[#172f4f]">
            <a href={`mailto:${contactEmail}?subject=GroupBlast subscription`}>
              Contact us to subscribe
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          </Button>
        </div>
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
      {plan.status === "trial" ? <TrialBanner daysRemaining={plan.daysRemaining} /> : null}
      {children}
    </>
  );
}
