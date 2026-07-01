import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { brand } from "@/lib/brand";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/auth-callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const [status, setStatus] = useState<"processing" | "done" | "error">("processing");
  const navigate = useNavigate();

useEffect(() => {
  const attemptRelay = async () => {
    const client = getSupabaseClient();
    if (!client) {
      setStatus("error");
      return;
    }
    
    // Wait for Supabase to process the magic link hash
    await new Promise(r => setTimeout(r, 500));
    
    // Read the session from Supabase (it already processed the hash)
    const { data: { session } } = await client.auth.getSession();
    
    if (!session?.access_token || !session?.refresh_token) {
      setStatus("error");
      return;
    }

    // POST tokens to the relay for Electron to pick up
    try {
      const res = await fetch("http://localhost:3001/api/auth/session-relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          access_token: session.access_token, 
          refresh_token: session.refresh_token 
        }),
      });
      if (res.ok) {
        setStatus("done");
        // If the Electron window itself navigated here, redirect home after a
        // short pause so the user sees the success message before landing on dashboard.
        setTimeout(() => void navigate({ to: "/" }), 1500);
      } else setStatus("error");
    } catch {
      setStatus("error");
    }
  };
  
  attemptRelay();
}, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 text-[#0f172a]">
      <div className="w-full max-w-md text-center">
        {status === "processing" ? (
          <>
            <h1 className="text-2xl font-bold">Signing you in…</h1>
            <p className="mt-2 text-sm text-slate-500">One moment.</p>
          </>
        ) : status === "done" ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold">You're logged in!</h1>
            <p className="mt-2 text-sm text-slate-500">
              You can <strong>close this tab</strong> and switch back to the{" "}
              <strong>{brand.name}</strong> app — it's already signing you in.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-500">
              The login link may have expired. Go back to {brand.name} and request a new one.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
