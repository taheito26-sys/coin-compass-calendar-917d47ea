import { useMemo } from "react";

export default function NewlyListed() {
  const listings = useMemo(() => [
    { pair: "OPN/USDT", price: 0.1994, change: 5.67, color: "var(--brand)" },
    { pair: "BSB/USDT", price: 0.2610, change: 13.85, color: "#ec4899" },
    { pair: "MANTRA/USDT", price: 0.01131, change: -2.25, color: "var(--bad)" },
    { pair: "XAI/USDT", price: 0.8842, change: 2.15, color: "#f97316" },
  ], []);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Newly Listed Assets</h2>
        <button className="btn tiny secondary" style={{ fontSize: 10 }}>View All Listing →</button>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <table style={{ width: "100%", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--muted)", fontWeight: 700, fontSize: 10, letterSpacing: "0.05em" }}>PAIR</th>
              <th style={{ padding: "12px 16px", textAlign: "right", color: "var(--muted)", fontWeight: 700, fontSize: 10, letterSpacing: "0.05em" }}>PRICE</th>
              <th style={{ padding: "12px 16px", textAlign: "right", color: "var(--muted)", fontWeight: 700, fontSize: 10, letterSpacing: "0.05em" }}>24H CHANGE</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l, i) => (
              <tr key={i} style={{ borderBottom: i < listings.length - 1 ? "1px solid var(--line)" : "none" }}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ 
                      width: 24, height: 24, borderRadius: "50%", background: l.color + "33", 
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "1px solid " + l.color + "66"
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 900, color: l.color }}>{l.pair.charAt(0)}</span>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 13, color: "var(--text)" }}>{l.pair}</span>
                  </div>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 900, color: "var(--text)" }}>
                  ${l.price.toFixed(4)}
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <div style={{ 
                    display: "inline-flex", alignItems: "center", gap: 4, 
                    fontWeight: 900, fontSize: 13, color: l.change >= 0 ? "var(--good)" : "var(--bad)",
                    fontFamily: "monospace"
                  }}>
                    {l.change >= 0 ? "▲" : "▼"} {Math.abs(l.change).toFixed(2)}%
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
