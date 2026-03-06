"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Phone numbers are now managed in Settings → Integrations (Numbers & agents).
 * Redirect old /phone-numbers links to Settings.
 */
export default function PhoneNumbersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings");
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[200px] text-white/70">
      Redirecting to Settings…
    </div>
  );
}
