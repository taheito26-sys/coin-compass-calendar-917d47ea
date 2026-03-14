import { useState } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";
import { useLedgerMutations } from "@/hooks/useLedgerMutations";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";

type TxType = "buy" | "sell";

export default function UserPage() {
  const { state, toast } = useCrypto();
  const { createManualTransaction, writeStatus } = useLedgerMutations();
  const portfolio = useUnifiedPortfolio();

  const [txType, setTxType] = useState<TxType>("buy");
  const [asset, setAsset] = useState("BTC");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("");
  const [exchange, setExchange] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const q = parseFloat(qty), p = parseFloat(price);
    if (!asset.trim() || !(q > 0) || !(p > 0)) { toast("Fill asset, qty, price", "bad"); return; }
    if (writeStatus !== "ready") { toast("Backend not available", "bad"); return; }

    setSaving(true);
    const result = await createManualTransaction({
      asset: asset.toUpperCase().trim(),
      type: txType,
      qty: q,
      price: p,
      fee: parseFloat(fee) || 0,
      base: state.base || "USD",
      venue: exchange || undefined,
      note: note || undefined,
    });
    setSaving(false);

    if (result.success) {
      setQty(""); setPrice(""); setFee(""); setNote("");
      toast(`${txType === "buy" ? "Buy" : "Sell"} logged ✓`, "good");
    } else {
      toast(result.error || "Failed to save", "bad");
    }
  };

  // Recent transactions from canonical state
  const recentTxs = state.txs.slice().sort((a, b) => b.ts - a.ts).slice(0, 50);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 10, alignItems: "start" }}>
        <div>
          {/* Portfolio positions from unified source */}
          <div className="panel">
            <div className="panel-head"><h2>Portfolio Summary</h2><span className="pill">{portfolio.assetCount} assets</span></div>
            <div className="panel-body">
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Asset</th><th>Qty</th><th>Avg Cost</th><th>Price</th><th>Cost Basis</th><th>Market Value</th><th>P&L</th></tr></thead>
                  <tbody>
                    {portfolio.positions.length ? portfolio.positions.map(p => (
                      <tr key={p.sym}>
                        <td className="mono" style={{ fontWeight: 900 }}>{p.sym}</td>
                        <td className="mono">{fmtQty(p.qty)}</td>
                        <td className="mono">{fmtPx(p.avg)}</td>
                        <td className="mono">{p.price !== null ? fmtPx(p.price) : "—"}</td>
                        <td className="mono">{fmtFiat(p.cost, state.base)}</td>
                        <td className="mono">{p.mv !== null ? fmtFiat(p.mv, state.base) : "—"}</td>
                        <td className={`mono ${p.unreal === null ? "" : p.unreal >= 0 ? "good" : "bad"}`} style={{ fontWeight: 900 }}>
                          {p.unreal !== null ? (p.unreal >= 0 ? "+" : "") + fmtFiat(p.unreal, state.base) : "—"}
                        </td>
                      </tr>
                    )) : <tr><td colSpan={7} className="muted">No positions yet. Log your first trade →</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Recent transactions */}
          <div className="panel" style={{ marginTop: 10 }}>
            <div className="panel-head"><h2>Recent Transactions</h2><span className="pill">{state.txs.length}</span></div>
            <div className="panel-body">
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Date</th><th>Type</th><th>Asset</th><th>Qty</th><th>Price</th><th>Total</th><th>Venue</th></tr></thead>
                  <tbody>
                    {recentTxs.map(tx => (
                      <tr key={tx.id}>
                        <td className="mono">{new Date(tx.ts).toLocaleDateString()}</td>
                        <td>
                          <span className="pill" style={{
                            background: tx.type === "buy" ? "var(--good)" : tx.type === "sell" ? "var(--bad)" : "var(--muted)",
                            color: "#fff", fontSize: 10, padding: "2px 6px"
                          }}>{tx.type.toUpperCase()}</span>
                        </td>
                        <td className="mono" style={{ fontWeight: 900 }}>{tx.asset}</td>
                        <td className="mono">{fmtQty(tx.qty)}</td>
                        <td className="mono">{fmtPx(tx.price)}</td>
                        <td className="mono">{fmtFiat(tx.qty * tx.price, state.base)}</td>
                        <td className="mono muted">{tx.accountId || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Log Buy/Sell form */}
        <div className="panel">
          <div className="panel-head"><h2>Log Trade</h2></div>
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Buy/Sell toggle */}
            <div style={{ display: "flex", gap: 4 }}>
              <button
                className={`btn ${txType === "buy" ? "" : "btn-muted"}`}
                style={{
                  flex: 1,
                  background: txType === "buy" ? "var(--good)" : undefined,
                  color: txType === "buy" ? "#fff" : undefined,
                  opacity: txType === "buy" ? 1 : 0.5,
                }}
                onClick={() => setTxType("buy")}
              >Buy</button>
              <button
                className={`btn ${txType === "sell" ? "" : "btn-muted"}`}
                style={{
                  flex: 1,
                  background: txType === "sell" ? "var(--bad)" : undefined,
                  color: txType === "sell" ? "#fff" : undefined,
                  opacity: txType === "sell" ? 1 : 0.5,
                }}
                onClick={() => setTxType("sell")}
              >Sell</button>
            </div>

            <div className="form-field"><label className="form-label">Asset</label><input className="inp" value={asset} onChange={e => setAsset(e.target.value)} placeholder="BTC" /></div>
            <div className="form-field"><label className="form-label">Quantity</label><input className="inp" type="number" step="0.00000001" value={qty} onChange={e => setQty(e.target.value)} placeholder="0.0" /></div>
            <div className="form-field"><label className="form-label">{txType === "buy" ? "Buy" : "Sell"} Price ({state.base})</label><input className="inp" type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></div>
            <div className="form-field"><label className="form-label">Fee ({state.base})</label><input className="inp" type="number" step="0.01" value={fee} onChange={e => setFee(e.target.value)} placeholder="0.00" /></div>
            <div className="form-field"><label className="form-label">Exchange</label><input className="inp" value={exchange} onChange={e => setExchange(e.target.value)} placeholder="Binance, Kraken..." /></div>
            <div className="form-field"><label className="form-label">Note</label><input className="inp" value={note} onChange={e => setNote(e.target.value)} placeholder="DCA, take profit..." /></div>

            {qty && price && <div className="cardLite" style={{ fontSize: 11 }}>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>Preview</div>
              <div>Total: <strong>{fmtFiat(parseFloat(qty || "0") * parseFloat(price || "0"), state.base)}</strong></div>
              {fee && parseFloat(fee) > 0 && <div>Fee: <strong>{fmtFiat(parseFloat(fee), state.base)}</strong></div>}
            </div>}

            <button
              className="btn"
              onClick={submit}
              disabled={saving || writeStatus !== "ready"}
              style={{
                background: txType === "buy" ? "var(--good)" : "var(--bad)",
                color: "#fff",
              }}
            >
              {saving ? "Saving..." : `+ Log ${txType === "buy" ? "Buy" : "Sell"}`}
            </button>

            {writeStatus !== "ready" && writeStatus !== "checking" && (
              <div style={{ fontSize: 11, color: "var(--bad)", textAlign: "center" }}>
                Backend {writeStatus === "unconfigured" ? "not configured" : "unavailable"}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
