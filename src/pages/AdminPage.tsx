import { useState, useEffect, useMemo } from "react";
import { useAdmin, fetchAllUsers, fetchUserTransactions, type AdminUser } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { fetchPrices, type ApiPriceEntry } from "@/lib/api";
import { fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";

interface UserTx {
  id: string;
  asset_id: string;
  type: string;
  qty: number;
  unit_price: number;
  fee_amount: number;
  timestamp: string;
  venue: string | null;
  note: string | null;
  source: string | null;
  assets?: { symbol: string; name: string; category: string | null } | null;
}

interface Position {
  symbol: string;
  name: string;
  qty: number;
  cost: number;
  avg: number;
  price: number | null;
  mv: number | null;
  pnlAbs: number | null;
  pnlPct: number | null;
}

type AdminTab = "dashboard" | "portfolio" | "ledger" | "calendar";

function buildPositions(txs: UserTx[], prices: Record<string, ApiPriceEntry>): Position[] {
  const posMap = new Map<string, { symbol: string; name: string; qty: number; cost: number; assetId: string }>();

  for (const tx of txs) {
    const sym = tx.assets?.symbol || "???";
    const name = tx.assets?.name || sym;
    const key = tx.asset_id;
    const cur = posMap.get(key) || { symbol: sym, name, qty: 0, cost: 0, assetId: key };
    const total = tx.qty * tx.unit_price;

    switch (tx.type) {
      case "buy": case "transfer_in": case "reward":
        cur.qty += tx.qty;
        cur.cost += total + tx.fee_amount;
        break;
      case "sell": case "transfer_out":
        if (cur.qty > 0) {
          const avg = cur.cost / cur.qty;
          const sold = Math.min(tx.qty, cur.qty);
          cur.qty -= sold;
          cur.cost -= avg * sold;
        }
        break;
      case "fee":
        cur.cost += tx.fee_amount;
        break;
    }

    if (cur.qty < 1e-8) { cur.qty = 0; cur.cost = 0; }
    posMap.set(key, cur);
  }

  const result: Position[] = [];
  for (const [assetId, p] of posMap) {
    if (p.qty <= 0) continue;
    const pr = prices[assetId];
    const price = pr?.price ?? null;
    const mv = price !== null ? price * p.qty : null;
    const pnlAbs = mv !== null ? mv - p.cost : null;
    const pnlPct = p.cost > 0 && pnlAbs !== null ? (pnlAbs / p.cost) * 100 : null;
    result.push({ symbol: p.symbol, name: p.name, qty: p.qty, cost: p.cost, avg: p.qty > 0 ? p.cost / p.qty : 0, price, mv, pnlAbs, pnlPct });
  }
  result.sort((a, b) => (b.mv ?? 0) - (a.mv ?? 0));
  return result;
}

function PnlPill({ val }: { val: number | null }) {
  if (val === null) return <span style={{ color: "#666" }}>—</span>;
  const color = val >= 0 ? "#22c55e" : "#ef4444";
  return <span style={{ color, fontWeight: 600 }}>{val >= 0 ? "+" : ""}{val.toFixed(2)}%</span>;
}

export default function AdminPage() {
  const { isAdmin, loading: roleLoading } = useAdmin();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [txs, setTxs] = useState<UserTx[]>([]);
  const [prices, setPrices] = useState<Record<string, ApiPriceEntry>>({});
  const [loading, setLoading] = useState(false);
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});

  // Load users list
  useEffect(() => {
    if (!isAdmin) return;
    fetchAllUsers().then(setUsers).catch(console.error);
  }, [isAdmin]);

  // Load prices once
  useEffect(() => {
    fetchPrices().then((d) => setPrices(d.prices)).catch(console.error);
  }, []);

  // Discover user emails from user_preferences (they sometimes store display info)
  // or just show truncated user IDs
  useEffect(() => {
    if (!isAdmin || users.length === 0) return;
    // Try to get emails from an edge function or just show IDs
    const map: Record<string, string> = {};
    users.forEach((u, i) => {
      map[u.id] = `User ${i + 1} (${u.id.slice(0, 8)}…)`;
    });
    setUserEmails(map);
  }, [isAdmin, users]);

  // Load selected user data
  useEffect(() => {
    if (!selectedUser) return;
    setLoading(true);
    fetchUserTransactions(selectedUser)
      .then((data) => setTxs(data as UserTx[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedUser]);

  const positions = useMemo(() => buildPositions(txs, prices), [txs, prices]);
  const totalMV = positions.reduce((s, p) => s + (p.mv ?? 0), 0);
  const totalCost = positions.reduce((s, p) => s + p.cost, 0);
  const totalPnl = totalMV - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  // Calendar data
  const calendarData = useMemo(() => {
    if (tab !== "calendar") return {};
    const byDate: Record<string, { buys: number; sells: number; txCount: number; volume: number }> = {};
    for (const tx of txs) {
      const day = tx.timestamp.slice(0, 10);
      const cur = byDate[day] || { buys: 0, sells: 0, txCount: 0, volume: 0 };
      cur.txCount++;
      const vol = tx.qty * tx.unit_price;
      cur.volume += vol;
      if (tx.type === "buy") cur.buys += vol;
      if (tx.type === "sell") cur.sells += vol;
      byDate[day] = cur;
    }
    return byDate;
  }, [txs, tab]);

  if (roleLoading) {
    return <div style={{ padding: 40, color: "#888" }}>Checking permissions…</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ color: "#fff", marginBottom: 8 }}>Access Denied</h2>
        <p style={{ color: "#888" }}>You don't have admin privileges.</p>
      </div>
    );
  }

  const tabs: { id: AdminTab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "portfolio", label: "Portfolio" },
    { id: "ledger", label: "Ledger" },
    { id: "calendar", label: "Calendar" },
  ];

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>🛡️ Admin Panel</div>
        <span style={{ fontSize: 11, background: "rgba(141,27,61,0.3)", color: "#e88", padding: "2px 8px", borderRadius: 6 }}>Super Admin</span>
      </div>

      {/* User selector */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ color: "#888", fontSize: 13 }}>Viewing as:</label>
        <select
          value={selectedUser || ""}
          onChange={(e) => setSelectedUser(e.target.value || null)}
          style={{
            background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 8,
            padding: "8px 12px", fontSize: 13, minWidth: 280,
          }}
        >
          <option value="">— Select a user —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {userEmails[u.id] || u.id}
            </option>
          ))}
        </select>
        <span style={{ color: "#555", fontSize: 11 }}>{users.length} users found</span>
      </div>

      {!selectedUser ? (
        <div style={{ padding: 60, textAlign: "center", color: "#555", border: "1px dashed #333", borderRadius: 12 }}>
          Select a user above to view their data
        </div>
      ) : loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Loading user data…</div>
      ) : (
        <>
          {/* Tab bar */}
          <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #222", paddingBottom: 4 }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: "8px 16px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer",
                  background: tab === t.id ? "rgba(141,27,61,0.3)" : "transparent",
                  color: tab === t.id ? "#fff" : "#888", fontWeight: tab === t.id ? 700 : 400, fontSize: 13,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Dashboard */}
          {tab === "dashboard" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
                <KpiCard label="Total Value" value={fmtFiat(totalMV)} />
                <KpiCard label="Total Cost" value={fmtFiat(totalCost)} />
                <KpiCard label="P&L" value={fmtFiat(totalPnl)} accent={totalPnl >= 0 ? "#22c55e" : "#ef4444"} />
                <KpiCard label="P&L %" value={`${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}%`} accent={totalPnlPct >= 0 ? "#22c55e" : "#ef4444"} />
                <KpiCard label="Assets" value={String(positions.length)} />
                <KpiCard label="Transactions" value={String(txs.length)} />
              </div>

              {/* Allocation */}
              <h3 style={{ color: "#ccc", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Allocation</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                {positions.slice(0, 10).map((p) => {
                  const pct = totalMV > 0 ? ((p.mv ?? 0) / totalMV * 100) : 0;
                  return (
                    <div key={p.symbol} style={{ background: "#111", border: "1px solid #222", borderRadius: 8, padding: "8px 12px", minWidth: 100 }}>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: 13 }}>{p.symbol}</div>
                      <div style={{ color: "#888", fontSize: 11 }}>{pct.toFixed(1)}% · {fmtFiat(p.mv ?? 0)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Portfolio */}
          {tab === "portfolio" && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #222" }}>
                    {["Asset", "Qty", "Avg Cost", "Price", "Cost", "Value", "P&L", "P&L %"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "#888", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.symbol} style={{ borderBottom: "1px solid #151515" }}>
                      <td style={{ padding: "8px 10px", color: "#fff", fontWeight: 600 }}>
                        {p.symbol}<br /><span style={{ color: "#666", fontSize: 11, fontWeight: 400 }}>{p.name}</span>
                      </td>
                      <td style={{ padding: "8px 10px", color: "#ccc" }}>{fmtQty(p.qty)}</td>
                      <td style={{ padding: "8px 10px", color: "#ccc" }}>{fmtPx(p.avg)}</td>
                      <td style={{ padding: "8px 10px", color: "#ccc" }}>{p.price !== null ? fmtPx(p.price) : "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#ccc" }}>{fmtFiat(p.cost)}</td>
                      <td style={{ padding: "8px 10px", color: "#fff", fontWeight: 600 }}>{p.mv !== null ? fmtFiat(p.mv) : "—"}</td>
                      <td style={{ padding: "8px 10px" }}>
                        {p.pnlAbs !== null ? (
                          <span style={{ color: p.pnlAbs >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                            {p.pnlAbs >= 0 ? "+" : ""}{fmtFiat(p.pnlAbs)}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "8px 10px" }}><PnlPill val={p.pnlPct} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid #333" }}>
                    <td style={{ padding: "10px", color: "#fff", fontWeight: 800 }} colSpan={4}>Total</td>
                    <td style={{ padding: "10px", color: "#ccc", fontWeight: 700 }}>{fmtFiat(totalCost)}</td>
                    <td style={{ padding: "10px", color: "#fff", fontWeight: 800 }}>{fmtFiat(totalMV)}</td>
                    <td style={{ padding: "10px", color: totalPnl >= 0 ? "#22c55e" : "#ef4444", fontWeight: 800 }}>
                      {totalPnl >= 0 ? "+" : ""}{fmtFiat(totalPnl)}
                    </td>
                    <td style={{ padding: "10px" }}><PnlPill val={totalPnlPct} /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Ledger */}
          {tab === "ledger" && (
            <div style={{ overflowX: "auto" }}>
              <div style={{ marginBottom: 12, color: "#888", fontSize: 12 }}>{txs.length} transactions</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #222" }}>
                    {["Date", "Type", "Asset", "Qty", "Price", "Total", "Fee", "Venue", "Source"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "#888", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txs.slice().reverse().slice(0, 200).map((tx) => (
                    <tr key={tx.id} style={{ borderBottom: "1px solid #111" }}>
                      <td style={{ padding: "6px 8px", color: "#aaa" }}>{new Date(tx.timestamp).toLocaleDateString()}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <span style={{
                          padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                          background: tx.type === "buy" ? "rgba(34,197,94,0.15)" : tx.type === "sell" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)",
                          color: tx.type === "buy" ? "#22c55e" : tx.type === "sell" ? "#ef4444" : "#888",
                        }}>
                          {tx.type}
                        </span>
                      </td>
                      <td style={{ padding: "6px 8px", color: "#fff", fontWeight: 600 }}>{tx.assets?.symbol || "?"}</td>
                      <td style={{ padding: "6px 8px", color: "#ccc" }}>{fmtQty(tx.qty)}</td>
                      <td style={{ padding: "6px 8px", color: "#ccc" }}>{fmtPx(tx.unit_price)}</td>
                      <td style={{ padding: "6px 8px", color: "#ccc" }}>{fmtFiat(tx.qty * tx.unit_price)}</td>
                      <td style={{ padding: "6px 8px", color: "#666" }}>{tx.fee_amount > 0 ? fmtFiat(tx.fee_amount) : "—"}</td>
                      <td style={{ padding: "6px 8px", color: "#666" }}>{tx.venue || "—"}</td>
                      <td style={{ padding: "6px 8px", color: "#555", fontSize: 10 }}>{tx.source || "manual"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Calendar */}
          {tab === "calendar" && (
            <div>
              <h3 style={{ color: "#ccc", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Transaction Activity by Date</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                {Object.entries(calendarData)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .slice(0, 60)
                  .map(([date, d]) => {
                    const net = d.buys - d.sells;
                    return (
                      <div key={date} style={{
                        background: "#111", border: "1px solid #222", borderRadius: 8, padding: "8px 10px",
                        borderLeft: `3px solid ${net >= 0 ? "#22c55e" : "#ef4444"}`,
                      }}>
                        <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{date}</div>
                        <div style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{d.txCount} txs</div>
                        <div style={{ fontSize: 10, color: "#666" }}>Vol: {fmtFiat(d.volume)}</div>
                      </div>
                    );
                  })}
              </div>
              {Object.keys(calendarData).length === 0 && (
                <div style={{ padding: 40, textAlign: "center", color: "#555" }}>No transactions for this user</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: "#111", border: "1px solid #222", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent || "#fff" }}>{value}</div>
    </div>
  );
}
