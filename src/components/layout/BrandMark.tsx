import { useState } from "react";
import { brand, getBrandInitials } from "@/lib/brand";
import { cn } from "@/lib/utils";

// Renders the whitelabel logo. Falls back to an accent-colored initials badge
// when no logo URL is set OR the image fails to load (e.g. the file hasn't been
// dropped into public/ yet) — so the header never shows a broken-image icon.
export function BrandMark({
  size = 28,
  showName = false,
  className,
}: {
  size?: number;
  showName?: boolean;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const useImage = Boolean(brand.logoUrl) && !imgFailed;
  const accent = brand.accent ?? "#2563EB";

  return (
    <span className={cn("flex items-center gap-2", className)}>
      {useImage ? (
        <img
          src={brand.logoUrl!}
          alt={brand.name}
          width={size}
          height={size}
          className="shrink-0 object-contain"
          style={{ width: size, height: size }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span
          className="flex shrink-0 items-center justify-center rounded-md font-bold text-white"
          style={{ width: size, height: size, backgroundColor: accent, fontSize: size * 0.4 }}
        >
          {getBrandInitials(brand.name)}
        </span>
      )}
      {showName ? <span className="truncate font-semibold">{brand.name}</span> : null}
    </span>
  );
}
