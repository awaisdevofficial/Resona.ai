"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/components/lib-utils";

interface Trend {
  value: string;
  positive: boolean;
}

interface Props {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  trend?: Trend;
  format?: (v: number) => string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconBg,
  iconColor,
  trend,
  format,
}: Props) {
  const isNumeric = typeof value === "number";
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) =>
    format ? format(Math.round(v)) : Math.round(v).toLocaleString()
  );

  useEffect(() => {
    if (isNumeric) {
      animate(count, value as number, { duration: 0.8, ease: "easeOut" });
    }
  }, [count, isNumeric, value]);

  return (
    <div className="bg-surface rounded-card border border-border shadow-card p-6 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <p className="text-label uppercase tracking-wider text-text-muted">
          {title}
        </p>
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
            iconBg
          )}
        >
          <Icon size={18} className={iconColor} strokeWidth={2} />
        </div>
      </div>
      <div className="mt-4">
        {isNumeric ? (
          <motion.p className="text-stat-number text-text-primary tracking-tight">
            {rounded}
          </motion.p>
        ) : (
          <p className="text-stat-number text-text-primary tracking-tight">
            {value}
          </p>
        )}
      </div>
      {(subtitle || trend) && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {subtitle && (
            <p className="text-body text-text-muted">{subtitle}</p>
          )}
          {trend && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-badge",
                trend.positive
                  ? "text-success bg-emerald-50"
                  : "text-error bg-red-50"
              )}
            >
              {trend.positive ? (
                <TrendingUp size={11} />
              ) : (
                <TrendingDown size={11} />
              )}
              {trend.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
