import { useEffect, useState } from "react";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);

export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith(".localhost");
}

/**
 * Returns whether the app is running on localhost (where the local Express API,
 * SQLite database, and Playwright/Facebook automation actually work).
 *
 * Returns `null` until mounted on the client. Detection is intentionally
 * client-only — `window` is not available during SSR, and rendering nothing on
 * the first pass avoids a hydration mismatch.
 */
export function useIsLocalHost(): boolean | null {
  const [local, setLocal] = useState<boolean | null>(null);
  useEffect(() => {
    setLocal(isLocalHost(window.location.hostname));
  }, []);
  return local;
}
