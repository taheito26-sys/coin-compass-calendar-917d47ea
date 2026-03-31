import React, { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { fetchHistoricalNetWorth } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

export function NetWorthChart() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const history = await fetchHistoricalNetWorth();
        const formatted = history.map((h) => ({
          date: h.date,
          value: Number(h.total_market_value),
          cost: Number(h.total_cost_basis),
        }));
        setData(formatted);
      } catch (err) {
        console.error("Failed to load net worth history", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <div className="h-64 flex items-center justify-center">Loading...</div>;
  if (data.length === 0) return <div className="h-64 flex items-center justify-center text-muted">No historical data yet.</div>;

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--brand)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
          <XAxis 
            dataKey="date" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            minTickGap={30}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickFormatter={(val) => `$${val > 1000 ? (val / 1000).toFixed(1) + 'k' : val}`}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: 'var(--panel)', borderColor: 'var(--line)', borderRadius: '8px' }}
            formatter={(val: number) => [formatCurrency(val), "Net Worth"]}
          />
          <Area 
            type="monotone" 
            dataKey="value" 
            stroke="var(--brand)" 
            fillOpacity={1} 
            fill="url(#colorValue)" 
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
