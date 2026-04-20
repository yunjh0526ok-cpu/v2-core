"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { TREND_SERIES } from "@/lib/mock";

export default function TrendMini() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={TREND_SERIES}
        margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff7a1a" stopOpacity={0.65} />
            <stop offset="100%" stopColor="#ff7a1a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="month"
          stroke="#8192bf"
          tickLine={false}
          axisLine={false}
          fontSize={10}
        />
        <YAxis
          stroke="#8192bf"
          tickLine={false}
          axisLine={false}
          fontSize={10}
          domain={[60, 90]}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(7,12,27,0.92)",
            border: "1px solid rgba(255,162,76,0.4)",
            borderRadius: 12,
            color: "#fff",
            fontSize: 12,
          }}
          labelStyle={{ color: "#ffa24c" }}
        />
        <Area
          type="monotone"
          dataKey="score"
          stroke="#ffa24c"
          strokeWidth={2}
          fill="url(#trendFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
