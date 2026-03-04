"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/components/lib-utils";

const planColors: Record<string, string> = {
  free: "text-text-muted bg-white/5",
  starter: "text-info bg-info/10",
  pro: "text-brand bg-brand/10",
  enterprise: "text-warning bg-warning/10",
};

interface UserFooterProps {
  collapsed?: boolean;
}

export function UserFooter({ collapsed }: UserFooterProps) {
  const router = useRouter();
  const { session } = useAuth();
  const user = session?.user;
  if (!user) return null;

  const displayName =
    (user.user_metadata as { name?: string })?.name || user.email || "User";

  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const plan = "pro";

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/sign-in");
  }

  return (
    <div className={cn("space-y-2", collapsed ? "px-0" : "px-3 py-3 mt-1")}>
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg hover:bg-white/5 transition-colors cursor-default py-2",
          collapsed && "justify-center px-2"
        )}
      >
        <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
          <span className="text-[11px] font-semibold text-brand">
            {initials}
          </span>
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-white truncate">
              {displayName}
            </p>
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md inline-block mt-0.5",
                planColors[plan]
              )}
            >
              {plan}
            </span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className={cn(
          "w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg",
          "text-[11px] font-medium text-[#A0A0B8] border border-white/10",
          "hover:bg-white/5 hover:text-white transition-all duration-150 cursor-pointer active:scale-95",
          collapsed && "px-2"
        )}
      >
        <LogOut size={12} />
        {!collapsed && "Log out"}
      </button>
    </div>
  );
}
