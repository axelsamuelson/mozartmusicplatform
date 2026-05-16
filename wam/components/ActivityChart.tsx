"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityMonth } from "@/lib/profile/aggregateRatings";
import { glassCard, sectionHeading } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export interface ActivityChartProps {
  data: ActivityMonth[];
  className?: string;
}

const tickStyle = { fill: "rgba(255,255,255,0.55)", fontSize: 11 };

export function ActivityChart({ data, className }: ActivityChartProps) {
  return (
    <Card
      className={cn(
        "gap-2 border-0 bg-transparent text-white shadow-none ring-0",
        glassCard,
        className,
      )}
    >
      <CardHeader className="space-y-1 px-0 pb-2 pt-0">
        <CardTitle className={sectionHeading}>Ratings per month</CardTitle>
        <p className="text-xs text-white/50">Last 12 months</p>
      </CardHeader>
      <CardContent className="h-64 px-0 pb-0 pt-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-white/10" />
            <XAxis
              dataKey="label"
              tick={tickStyle}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={56}
            />
            <YAxis allowDecimals={false} tick={tickStyle} width={32} />
            <Tooltip
              contentStyle={{
                backgroundColor: "oklch(0.08 0 0)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "12px",
                fontSize: "12px",
                color: "#fff",
              }}
              formatter={(value) => {
                const n = typeof value === "number" ? value : Number(value);
                return [Number.isFinite(n) ? n : 0, "Ratings"];
              }}
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as ActivityMonth | undefined;
                return p?.month ?? "";
              }}
            />
            <Bar dataKey="count" fill="var(--color-wam)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
