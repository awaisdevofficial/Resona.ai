"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/components/lib-utils";

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

  const plan = "Pro";

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/sign-in");
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={handleLogout}
        className="w-full flex items-center justify-center rounded-xl p-2.5 text-white/70 hover:bg-white/10 hover:text-white transition-colors mt-2"
        title="Log out"
      >
        <LogOut size={18} />
      </button>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-white/[0.06]">
      <div className="flex items-center gap-3 px-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4DFFCE]/30 to-[#2DD4A0]/20 flex items-center justify-center border border-[#4DFFCE]/30">
          <span className="text-xs font-medium text-[#4DFFCE]">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {displayName}
          </p>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#4DFFCE]/20 text-[#4DFFCE]">
            {plan}
          </span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          title="Log out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}
