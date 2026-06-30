import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApiError } from "@/lib/api";

/**
 * Renders a failed API call with the detail users need to self-diagnose:
 * the HTTP status, the exact method + endpoint, the backend error message,
 * and a suggested next action — instead of a bare "request failed".
 */
export function ApiErrorAlert({ error, title }: { error: unknown; title?: string }) {
  if (!error) return null;
  const isApi = error instanceof ApiError;
  const message = error instanceof Error ? error.message : String(error);
  const status = isApi ? error.status : undefined;
  const method = isApi ? error.method : undefined;
  const endpoint = isApi ? error.endpoint : undefined;
  const suggestion = isApi ? error.suggestion : undefined;

  return (
    <Alert variant="destructive">
      <AlertTitle>
        {title ?? "Request failed"}
        {status ? ` · HTTP ${status}` : ""}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-1.5">
        <span>{message}</span>
        {endpoint ? (
          <span className="font-mono text-xs opacity-80">
            {method ?? ""} {endpoint}
          </span>
        ) : null}
        {suggestion ? (
          <span className="text-xs">
            <span className="font-medium">Next step:</span> {suggestion}
          </span>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
