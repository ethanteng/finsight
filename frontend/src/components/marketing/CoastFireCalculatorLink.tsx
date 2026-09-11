"use client";

import Link from "next/link";
import { pushCoastFireCalculatorClick } from "@/lib/dataLayer";

export function CoastFireCalculatorLink({
  className,
  location,
  label = "Check my Coast FIRE number",
  csOverrideId,
}: {
  className?: string;
  location: string;
  label?: string;
  csOverrideId: string;
}) {
  return (
    <Link
      className={className}
      href="/coast-fire-calculator"
      data-cs-override-id={csOverrideId}
      onClick={() => pushCoastFireCalculatorClick(location)}
    >
      {label}
    </Link>
  );
}
