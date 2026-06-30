import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Mail, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/auth-context";
import { brand } from "@/lib/brand";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { mode, cloudUnavailable, signInWithMagicLink } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (mode === "local") {
    void navigate({ to: "/" });
    return null;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithMagicLink(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send login link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold">{brand.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{brand.tagline}</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            {sent ? (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="rounded-full bg-green-100 p-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  </div>
                </div>
                <div className="text-center">
                  <h2 className="font-semibold">Check your email</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    We sent a login link to <strong>{email}</strong>. Click it to log in.
                  </p>
                  <p className="mt-4 text-xs text-muted-foreground">
                    You'll stay logged in on this device.
                  </p>
                </div>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={submit}>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    disabled={busy}
                  />
                </div>
                {error ? (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <Button type="submit" disabled={busy || cloudUnavailable} className="w-full">
                  <Mail className="mr-2 h-4 w-4" />
                  {busy ? "Sending…" : "Send login link"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  No password needed. We'll email you a link.
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
