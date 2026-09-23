import { useLivePrices } from "@/hooks/useLivePrices";
import { useIntradayHistory } from "@/hooks/useIntradayHistory";
import { IntradayAreaChart } from "./IntradayAreaChart";
import { fmtPx } from "@/lib/cryptoState";

export default function TodaysMovement({ symbols }: { symbols: string[] }) {
  const { getPrice } = useLivePrices();
  const history = useIntradayHistory(symbols);

  if (symbols.length === 0) {
    return <div className="muted" style={{ padding: 20, textAlign: "center" }}>No positions to display.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {symbols.map(sym => {
        const live = getPrice(sym);
        const points = history.get(sym) ?? [];
        const change24h = live?.price_change_percentage_24h_in_currency ?? null;
        // Prefer the intraday series' own open→now move; fall back to the 24h stat.
        const dayChangePct = points.length >= 2
          ? ((points[points.length - 1] - points[0]) / (points[0] || 1)) * 100
          : change24h;
        const positive = (dayChangePct ?? 0) >= 0;

        return (
          <div
            key={sym}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto auto",
              alignItems: "center",
              gap: 10,
              padding: "6px 4px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <span style={{ fontWeight: 800, fontSize: 12 }}>{sym}</span>
            <span style={{ fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
              {live?.current_price != null ? fmtPx(live.current_price) : "—"}
            </span>
            <IntradayAreaChart data={points} positive={positive} />
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                minWidth: 56,
                textAlign: "right",
                color: positive ? "var(--good, #16a34a)" : "var(--bad, #dc2626)",
              }}
            >
              {dayChangePct != null ? `${dayChangePct >= 0 ? "+" : ""}${dayChangePct.toFixed(2)}%` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
