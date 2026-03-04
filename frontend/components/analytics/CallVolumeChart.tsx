"use client"
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { format, parseISO } from "date-fns"

interface DataPoint {
  date: string
  count: number
}

export function CallVolumeChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="callGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6C63FF" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#6C63FF" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#9CA3AF" }}
          tickFormatter={(v) => format(parseISO(v), "MMM d")}
          interval="preserveStartEnd"
        />
        <YAxis hide />
        <Tooltip
          contentStyle={{
            background: "#fff",
            border: "1px solid #E8E8F0",
            borderRadius: 8,
            fontSize: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
          }}
          labelFormatter={(v) => format(parseISO(v as string), "MMMM d, yyyy")}
          formatter={(v: number) => [v, "Calls"]}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#6C63FF"
          strokeWidth={2}
          fill="url(#callGradient)"
          dot={false}
          activeDot={{ r: 4, fill: "#6C63FF", strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

