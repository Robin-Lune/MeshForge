"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NodeHistoryPoint } from "@/types";

function Chart({
  title,
  data,
  dataKey,
  color,
}: {
  title: string;
  data: NodeHistoryPoint[];
  dataKey: "snr" | "battery" | "packets";
  color: string;
}) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h4 className="mb-3 text-sm font-medium text-zinc-500">{title}</h4>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10 }}
            minTickGap={28}
            tickFormatter={(d: string) => d.slice(5)}
          />
          <YAxis tick={{ fontSize: 10 }} width={34} />
          <Tooltip labelStyle={{ color: "#111", fontWeight: 700 }} />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function NodeCharts({ data }: { data: NodeHistoryPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        Aucun historique sur les 30 derniers jours.
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Chart title="SNR (dB)" data={data} dataKey="snr" color="#3b82f6" />
      <Chart title="Batterie (%)" data={data} dataKey="battery" color="#22c55e" />
      <Chart title="Paquets / jour" data={data} dataKey="packets" color="#f97316" />
    </div>
  );
}
