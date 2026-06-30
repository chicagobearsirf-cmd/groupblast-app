import { AlertTriangle, Cloud, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getAppModeInfo } from "@/lib/app-mode";

/**
 * Surfaces the current app mode and warns when cloud/hybrid mode is selected but
 * Supabase isn't configured. Shown on Team / Rep Setup pages.
 */
export function CloudConfigWarning() {
  const { mode, cloudConfigured } = getAppModeInfo();

  if (mode === "local") {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Local mode</AlertTitle>
        <AlertDescription>
          You're running in <strong>local mode</strong>. Rep accounts, teams, and shared cloud data
          require <code>cloud</code> or <code>hybrid</code> mode with Supabase configured. The team
          features below are a foundation/preview. See <code>docs/CLOUD_ARCHITECTURE.md</code>.
        </AlertDescription>
      </Alert>
    );
  }

  if (!cloudConfigured) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Cloud mode is not configured</AlertTitle>
        <AlertDescription>
          <code>{mode}</code> mode is selected but Supabase isn't configured. Set{" "}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your{" "}
          <code>.env</code> (see <code>.env.example</code>), then reload.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <Cloud className="h-4 w-4" />
      <AlertTitle>Cloud mode active</AlertTitle>
      <AlertDescription>
        Connected to Supabase in <code>{mode}</code> mode.
      </AlertDescription>
    </Alert>
  );
}
