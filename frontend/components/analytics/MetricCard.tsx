"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import type { LucideIcon } from "lucide-react";
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
  iconColor?: string;
  trend?: Trend;
  format?: (v: number) => string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "#4DFFCE",
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
    <div className="metric-card">
      <div className="flex items-start justify-between mb-4">
        <span className="metric-label">{title}</span>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${iconColor}15` }}
        >
          <Icon size={18} style={{ color: iconColor }} />
        </div>
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        {isNumeric ? (
          <motion.span className="metric-value">{rounded}</motion.span>
        ) : (
          <span className="metric-value">{value}</span>
        )}
        {trend && (
          <span
            className={cn(
              "text-xs font-medium mb-1",
              trend.positive ? "text-[#4DFFCE]" : "text-red-400"
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-xs text-white/70 mt-2">{subtitle}</p>
      )}
    </div>
  );
}
