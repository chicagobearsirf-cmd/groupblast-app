import { CheckCircle2, Info } from "lucide-react";
import { useIsLocalHost } from "@/hooks/use-environment";

/**
 * Slim full-width strip shown under the header on every page. It tells the user
 * whether they are on localhost (where automation works) or a hosted/preview
 * build (UI-only), which is the #1 source of confusion: localhost has the local
 * SQLite data + Playwright runner; a hosted preview does not.
 */
export function EnvironmentBanner() {
  // Hidden for launch — technical banner not needed for business users
  return null;
}
