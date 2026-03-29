/**
 * Tax P&L Reports Page — FIFO/LIFO/HIFO with CSV export
 * + Export Transactions
 */
import { useMemo, useState } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { useLivePrices } from "@/hooks/useLivePrices";
import { fmtFiat, fmtQty, fmtPx, type CryptoTx } from "@/lib/cryptoState";
import { normalizeSymbol } from "@/lib/symbolAliases";

type AccountingMethod = "FIFO" | "LIFO" | "HIFO";

interface TaxLot {
  buyTs: number;
  sellTs: number;
  asset: string;
  qty: number;
  costBasis: number;
  proceeds: number;
  pnl: number;
  holdingDays: number;
  shortTerm: boolean;
}

function computeTaxLots(txs: CryptoTx[], method: AccountingMethod, year: number): TaxLot[] {
  const sorted = [...txs].sort((a, b) => a.ts - b.ts);
  const lotsMap = new Map<string, { ts: number; qty: number; qtyRem: number; unitCost: number }[]>();
  const taxLots: TaxLot[] = [];

  for (const tx of sorted) {
    const sym = normalizeSymbol(tx.asset);
    if (!sym) continue;

    if (!lotsMap.has(sym)) lotsMap.set(sym, []);
    const lots = lotsMap.get(sym)!;
    const type = tx.type?.toLowerCase();
    const q = Math.abs(tx.qty || 0);
    if (q <= 0) continue;

    if (type === "buy") {
      const fee = tx.fee || 0;
      const totalCost = (q * (tx.price || 0)) + fee;
      lots.push({ ts: tx.ts, qty: q, qtyRem: q, unitCost: totalCost / q });
    } else if (type === "sell") {
      // Sort lots based on method
      let sortedLots = [...lots].filter(l => l.qtyRem > 0);
      if (method === "LIFO") {
        sortedLots.sort((a, b) => b.ts - a.ts);
      } else if (method === "HIFO") {
        sortedLots.sort((a, b) => b.unitCost - a.unitCost);
      }
      // else FIFO: already sorted by ts

      let rem = q;
      const salePrice = tx.price || 0;
      const saleFee = tx.fee || 0;
      const txYear = new Date(tx.ts).getFullYear();

      for (const lot of sortedLots) {
        if (rem <= 0) break;
        // Find this lot in the original array to mutate qtyRem
        const origLot = lots.find(l => l === lot || (l.ts === lot.ts && l.unitCost === lot.unitCost && l.qtyRem > 0));
        if (!origLot || origLot.qtyRem <= 0) continue;

        const take = Math.min(origLot.qtyRem, rem);
        const costBasis = take * origLot.unitCost;
        const proceeds = take * salePrice - (saleFee * (take / q));
        const holdingDays = Math.floor((tx.ts - origLot.ts) / 86400_000);

        if (txYear === year || year === 0) {
          taxLots.push({
            buyTs: origLot.ts,
            sellTs: tx.ts,
            asset: sym,
            qty: take,
            costBasis,
            proceeds,
            pnl: proceeds - costBasis,
            holdingDays,
            shortTerm: holdingDays < 365,
          });
        }

        origLot.qtyRem -= take;
        rem -= take;
      }
    }
  }

  return taxLots;
}

function downloadCsv(data: string, filename: string) {
  const blob = new Blob([data], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { state } = useCrypto();
  const { getPrice } = useLivePrices();
  const [method, setMethod] = useState<AccountingMethod>("FIFO");
  const [year, setYear] = useState(new Date().getFullYear());
  const [tab, setTab] = useState<"tax" | "export">("tax");

  const years = useMemo(() => {
    const yrs = new Set<number>();
    for (const tx of state.txs) {
      yrs.add(new Date(tx.ts).getFullYear());
    }
    return [0, ...Array.from(yrs).sort((a, b) => b - a)];
  }, [state.txs]);

  const taxLots = useMemo(() => computeTaxLots(state.txs, method, year), [state.txs, method, year]);

  const summary = useMemo(() => {
    const shortTerm = taxLots.filter(l => l.shortTerm);
    const longTerm = taxLots.filter(l => !l.shortTerm);
    return {
      totalPnl: taxLots.reduce((s, l) => s + l.pnl, 0),
      shortTermPnl: shortTerm.reduce((s, l) => s + l.pnl, 0),
      longTermPnl: longTerm.reduce((s, l) => s + l.pnl, 0),
      totalProceeds: taxLots.reduce((s, l) => s + l.proceeds, 0),
      totalCost: taxLots.reduce((s, l) => s + l.costBasis, 0),
      tradeCount: taxLots.length,
      shortCount: shortTerm.length,
      longCount: longTerm.length,
    };
  }, [taxLots]);

  const exportTaxCsv = () => {
    const header = "Asset,Buy Date,Sell Date,Quantity,Cost Basis,Proceeds,P&L,Holding Days,Term\n";
    const rows = taxLots.map(l =>
      `${l.asset},${new Date(l.buyTs).toISOString().split("T")[0]},${new Date(l.sellTs).toISOString().split("T")[0]},${l.qty},${l.costBasis.toFixed(2)},${l.proceeds.toFixed(2)},${l.pnl.toFixed(2)},${l.holdingDays},${l.shortTerm ? "Short" : "Long"}`
    ).join("\n");
    downloadCsv(header + rows, `tax-report-${method}-${year || "all"}.csv`);
  };

  const exportTransactionsCsv = () => {
    const header = "Date,Type,Asset,Quantity,Price,Total,Fee,Note\n";
    const rows = state.txs
      .sort((a, b) => a.ts - b.ts)
      .map(tx =>
        `${new Date(tx.ts).toISOString().split("T")[0]},${tx.type},${tx.asset},${tx.qty},${tx.price},${tx.total},${tx.fee},"${(tx.note || "").replace(/"/g, '""')}"`
      ).join("\n");
    downloadCsv(header + rows, `transactions-export-${new Date().toISOString().split("T")[0]}.csv`);
  };

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setTab("tax")}
          style={{
            padding: "6px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)",
            background: tab === "tax" ? "var(--brand)" : "var(--panel2)",
            color: tab === "tax" ? "#fff" : "var(--muted)",
          }}
        >📊 Tax P&L Report</button>
        <button
          onClick={() => setTab("export")}
          style={{
            padding: "6px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)",
            background: tab === "export" ? "var(--brand)" : "var(--panel2)",
            color: tab === "export" ? "#fff" : "var(--muted)",
          }}
        >📥 Export Data</button>
      </div>

      {tab === "tax" && (
        <>
          {/* Controls */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <label style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>Method</label>
              <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                {(["FIFO", "LIFO", "HIFO"] as AccountingMethod[]).map(m => (
                  <button
                    key={m} onClick={() => setMethod(m)}
                    style={{
                      fontSize: 10, padding: "4px 10px", cursor: "pointer", fontWeight: 700,
                      border: "1px solid var(--line)", borderRadius: 4,
                      background: method === m ? "var(--brand)" : "var(--panel2)",
                      color: method === m ? "#fff" : "var(--muted)",
                    }}
                  >{m}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>Tax Year</label>
              <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                {years.map(y => (
                  <button
                    key={y} onClick={() => setYear(y)}
                    style={{
                      fontSize: 10, padding: "4px 10px", cursor: "pointer", fontWeight: 700,
                      border: "1px solid var(--line)", borderRadius: 4,
                      background: year === y ? "var(--brand)" : "var(--panel2)",
                      color: year === y ? "#fff" : "var(--muted)",
                    }}
                  >{y === 0 ? "All" : y}</button>
                ))}
              </div>
            </div>
            <button onClick={exportTaxCsv} style={{
              fontSize: 11, padding: "6px 14px", cursor: "pointer", fontWeight: 700,
              border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)",
              background: "var(--good)", color: "#fff", marginLeft: "auto",
            }}>📥 Export CSV</button>
          </div>

          {/* Summary KPIs */}
          <div className="kpis kpis-5" style={{ marginBottom: 16 }}>
            <div className="kpi-card">
              <div className="kpi-lbl">TOTAL P&L</div>
              <div className={`kpi-val ${summary.totalPnl >= 0 ? "good" : "bad"}`}>
                {summary.totalPnl >= 0 ? "+" : ""}{fmtFiat(summary.totalPnl)}
              </div>
              <div className="kpi-sub">{summary.tradeCount} disposals</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">SHORT-TERM</div>
              <div className={`kpi-val ${summary.shortTermPnl >= 0 ? "good" : "bad"}`}>
                {summary.shortTermPnl >= 0 ? "+" : ""}{fmtFiat(summary.shortTermPnl)}
              </div>
              <div className="kpi-sub">{summary.shortCount} trades (&lt;1yr)</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">LONG-TERM</div>
              <div className={`kpi-val ${summary.longTermPnl >= 0 ? "good" : "bad"}`}>
                {summary.longTermPnl >= 0 ? "+" : ""}{fmtFiat(summary.longTermPnl)}
              </div>
              <div className="kpi-sub">{summary.longCount} trades (&gt;1yr)</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">PROCEEDS</div>
              <div className="kpi-val">{fmtFiat(summary.totalProceeds)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">COST BASIS</div>
              <div className="kpi-val">{fmtFiat(summary.totalCost)}</div>
            </div>
          </div>

          {/* Tax lots table */}
          <div className="panel">
            <div className="panel-head"><h2>Disposal Details ({method})</h2></div>
            <div className="panel-body" style={{ padding: 0, overflow: "auto" }}>
              {taxLots.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Asset</th><th>Buy Date</th><th>Sell Date</th>
                      <th>Qty</th><th>Cost Basis</th><th>Proceeds</th>
                      <th>P&L</th><th>Days</th><th>Term</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxLots.slice(0, 100).map((l, i) => (
                      <tr key={i}>
                        <td className="mono" style={{ fontWeight: 900 }}>{l.asset}</td>
                        <td className="mono" style={{ fontSize: 10 }}>{new Date(l.buyTs).toLocaleDateString()}</td>
                        <td className="mono" style={{ fontSize: 10 }}>{new Date(l.sellTs).toLocaleDateString()}</td>
                        <td className="mono">{fmtQty(l.qty)}</td>
                        <td className="mono">{fmtFiat(l.costBasis)}</td>
                        <td className="mono">{fmtFiat(l.proceeds)}</td>
                        <td className={`mono ${l.pnl >= 0 ? "good" : "bad"}`} style={{ fontWeight: 700 }}>
                          {l.pnl >= 0 ? "+" : ""}{fmtFiat(l.pnl)}
                        </td>
                        <td className="mono">{l.holdingDays}</td>
                        <td><span className="pill" style={{ fontSize: 8 }}>{l.shortTerm ? "SHORT" : "LONG"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="muted" style={{ padding: 20, textAlign: "center" }}>
                  No sell transactions found for {year || "any year"}.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === "export" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="panel" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Export Transactions</h3>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
              Download all {state.txs.length} transactions as a CSV file.
            </p>
            <button onClick={exportTransactionsCsv} className="btn" style={{ fontSize: 12 }}>
              📥 Download Transactions CSV
            </button>
          </div>
          <div className="panel" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Export Tax Report</h3>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
              Generate a tax-ready P&L report using {method} method.
            </p>
            <button onClick={exportTaxCsv} className="btn" style={{ fontSize: 12 }}>
              📥 Download Tax Report CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
