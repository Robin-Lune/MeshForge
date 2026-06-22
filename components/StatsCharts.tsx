"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StatBucket } from "@/types";

const TOP_N = 10;

// Limite l'affichage au top N et agrège la traîne en "autres" : firmware et
// hw_model ont une longue traîne, sinon le graphe est interminable.
function topWithRest(data: StatBucket[]): StatBucket[] {
  if (data.length <= TOP_N) return data;
  const rest = data.slice(TOP_N).reduce((sum, b) => sum + b.count, 0);
  return [...data.slice(0, TOP_N), { label: "autres", count: rest }];
}

export function BarBreakdown({
  title,
  data,
}: {
  title: string;
  data: StatBucket[];
}) {
  const rows = topWithRest(data);
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h3 className="mb-3 text-sm font-medium text-zinc-500">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-400">aucune donnée</p>
      ) : (
        <ResponsiveContainer
          width="100%"
          height={Math.max(rows.length * 28, 80)}
        >
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ left: 0, right: 16 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={130}
              tick={{ fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              labelStyle={{ color: "#111", fontWeight: 500 }}
            />
            <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
