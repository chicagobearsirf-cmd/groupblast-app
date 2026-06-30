// Whitelabel brand config. Every whitelabeled copy sets these in its own `.env`
// (or .env.local) — no code changes needed. Defaults preserve the original name
// so an un-configured copy still looks finished.
//
//   VITE_BRAND_NAME="AdWise Poster"
//   VITE_BRAND_SHORT_NAME="AdWise"
//   VITE_BRAND_TAGLINE="Post to your groups, the smart way"
//   VITE_BRAND_LOGO_URL="/brand-logo.png"   (optional; falls back to initials badge)
//   VITE_BRAND_ACCENT="#d4af37"             (optional; reserved for future theming)

export type Brand = {
  /** Full product name shown in the header and page title. */
  name: string;
  /** Compact name for the sidebar label and tight spaces. */
  shortName: string;
  /** One-line description shown under the name on the welcome step. */
  tagline: string;
  /** Optional logo URL. When absent, the UI shows an initials badge. */
  logoUrl: string | null;
  /** Optional accent color (hex). Reserved for future theming hooks. */
  accent: string | null;
};

function str(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length ? trimmed : null;
}

export function getBrand(): Brand {
  const env = import.meta.env as Record<string, string | undefined>;
  const name = str(env.VITE_BRAND_NAME) ?? "Command Center";
  return {
    name,
    shortName: str(env.VITE_BRAND_SHORT_NAME) ?? name,
    tagline: str(env.VITE_BRAND_TAGLINE) ?? "Facebook Group Automation",
    logoUrl: str(env.VITE_BRAND_LOGO_URL),
    accent: str(env.VITE_BRAND_ACCENT),
  };
}

/** Up-to-two-letter badge derived from the brand name (e.g. "AdWise Poster" -> "AP"). */
export function getBrandInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return "·";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export const brand = getBrand();
