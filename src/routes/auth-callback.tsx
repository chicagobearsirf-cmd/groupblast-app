import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { brand } from "@/lib/brand";

export const Route = createFileRoute("/auth-callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const [status, setStatus] = useState<"processing" | "done" | "error">("processing");

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (!access_token || !refresh_token) {
      setStatus("error");
      return;
    }

    fetch("http://localhost:3001/api/auth/session-relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token, refresh_token }),
    })
      .then((res) => {
        if (res.ok) setStatus("done");
        else setStatus("error");
      })
      .catch(() => setStatus("error"));
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
              Go back to the <strong>{brand.name}</strong> app — it will update automatically.
            </p>
            <p className="mt-4 text-xs text-slate-400">You can close this tab.</p>
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
