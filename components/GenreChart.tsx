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
import type { GenreCountRow } from "@/lib/profile/aggregateRatings";
import { glassCard, sectionHeading } from "@/lib/wamUi";
import { cn } from "@/lib/utils";

export interface GenreChartProps {
  data: GenreCountRow[];
  className?: string;
}

const tickStyle = { fill: "rgba(255,255,255,0.55)", fontSize: 11 };

export function GenreChart({ data, className }: GenreChartProps) {
  const chartData = [...data].reverse();

  return (
    <Card
      className={cn(
        "gap-2 border-0 bg-transparent text-white shadow-none ring-0",
        glassCard,
        className,
      )}
    >
      <CardHeader className="space-y-1 px-0 pb-2 pt-0">
        <CardTitle className={sectionHeading}>Top genres</CardTitle>
        <p className="text-xs text-white/50">From your genre tags</p>
      </CardHeader>
      <CardContent className="h-72 px-0 pb-0 pt-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-white/10" horizontal />
            <XAxis type="number" allowDecimals={false} tick={tickStyle} />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={tickStyle}
              interval={0}
            />
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
                return [Number.isFinite(n) ? n : 0, "Uses"];
              }}
            />
            <Bar dataKey="count" fill="#a78bfa" radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
