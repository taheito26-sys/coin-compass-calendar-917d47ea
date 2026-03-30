import { useState, useRef, useCallback, useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";
import { importCSV, hashFile, applyLookup } from "@/lib/importers";
import type { ParseResult, Exchange } from "@/lib/importers";
import CoinAutocomplete from "@/components/CoinAutocomplete";
import ExchangeConnect from "@/components/ledger/ExchangeConnect";
import {
  isWorkerConfigured,
  lookupImportRows,
  checkFileImported,
  apiFetch,
} from "@/lib/api";
import { getAssetCatalog, resolveAssetId, resolveOrCreateAsset } from "@/lib/assetResolver";
import { useLedgerMutations, type WriteStatus } from "@/hooks/useLedgerMutations";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportCounts {
  parsed: number;
  accepted: number;
  rejected: number;
  persisted: number;
  skippedDuplicate: number;
  failed: number;
}

type Tab = "journal" | "add" | "import" | "connect";

// ─── Constants ───────────────────────────────────────────────────────────────

const EXCHANGE_LABELS: Record<string, string> = {
  binance: "Binance",
  bybit: "Bybit",
  okx: "OKX",
  gate: "Gate.io",
  mexc: "MEXC",
  kucoin: "KuCoin",
};

const TX_TYPES = [
  { value: "buy",          label: "Buy",          color: "var(--good)" },
  { value: "sell",         label: "Sell",         color: "var(--bad)" },
  { value: "transfer_in",  label: "Transfer In",  color: "var(--brand)" },
  { value: "transfer_out", label: "Transfer Out", color: "var(--warn, #eab308)" },
];

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  buy:          { label: "BUY",    color: "var(--good)",  icon: "↑" },
  sell:         { label: "SELL",   color: "var(--bad)",   icon: "↓" },
  transfer_in:  { label: "IN",     color: "var(--brand)", icon: "→" },
  transfer_out: { label: "OUT",    color: "var(--warn, #eab308)", icon: "←" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_META[type] ?? { label: type.toUpperCase(), color: "var(--muted)", icon: "·" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
      padding: "2px 7px", borderRadius: "var(--lt-radius-sm)",
      background: `${meta.color}18`, color: meta.color,
      border: `1px solid ${meta.color}30`,
    }}>
      {meta.icon} {meta.label}
    </span>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: "var(--panel2)", borderRadius: "var(--lt-radius)", padding: "12px 16px",
      border: "1px solid var(--line)", flex: 1, minWidth: 100,
    }}>
      <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent ?? "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function WriteStatusBanner({ status, onRetry }: { status: WriteStatus; onRetry: () => void }) {
  if (status === "ready") return null;

  const configs: Record<Exclude<WriteStatus, "ready">, { bg: string; border: string; color: string; icon: string; msg: string }> = {
    checking: {
      bg: "rgba(234,179,8,0.06)", border: "rgba(234,179,8,0.2)",
      color: "var(--warn, #eab308)", icon: "⏳",
      msg: "Checking backend availability…",
    },
    unavailable: {
      bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.25)",
      color: "var(--bad)", icon: "⚠",
      msg: "Backend unavailable — transactions cannot be saved, edited, or deleted right now.",
    },
    unconfigured: {
      bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.25)",
      color: "var(--bad)", icon: "🔌",
      msg: "Backend not configured (VITE_WORKER_API_URL missing). All write operations are disabled.",
    },
  };

  const cfg = configs[status];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderRadius: "var(--lt-radius)", fontSize: 13, color: cfg.color,
    }}>
      <span>{cfg.icon} {cfg.msg}</span>
      {status === "unavailable" && (
        <button className="btn secondary" onClick={onRetry}
          style={{ marginLeft: "auto", fontSize: 11, padding: "4px 10px" }}>Retry</button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LedgerPage() {
  const { state, rehydrateFromBackend, toast } = useCrypto();
  const {
    writeStatus,
    checkWriteStatus,
    createManualTransaction,
    updateLedgerTransaction,
    deleteLedgerTransaction,
    commitImportedTransactions,
    clearAllData,
  } = useLedgerMutations();

  const canWrite = writeStatus === "ready";
  const [clearing, setClearing] = useState(false);

  // Tab
  const [tab, setTab] = useState<Tab>("journal");

  // Filters State
  const [searchQ, setSearchQ] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterAsset, setFilterAsset] = useState("");
  const [filterVenue, setFilterVenue] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Manual entry fields
  const [txType, setTxType] = useState("buy");
  const [asset, setAsset] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [venue, setVenue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editType, setEditType] = useState("");
  const [editAsset, setEditAsset] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");

  // Import
  const [importStage, setImportStage] = useState<"upload" | "preview" | "committing" | "done" | "error">("upload");
  const [importResult, setImportResult] = useState<ParseResult | null>(null);
  const [importCounts, setImportCounts] = useState<ImportCounts | null>(null);
  const [importErrorMsg, setImportErrorMsg] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [isDeltaImport, setIsDeltaImport] = useState(false);
  const [deltaCount, setDeltaCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const importedFiles = state.importedFiles ?? [];

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const txs = state.txs;
    const uniqueAssets = new Set(txs.map(t => t.asset)).size;
    const buys = txs.filter(t => t.type === "buy").length;
    const sells = txs.filter(t => t.type === "sell").length;
    const totalBuyValue = txs.filter(t => t.type === "buy").reduce((s, t) => s + (t.qty * t.price), 0);
    const totalSellValue = txs.filter(t => t.type === "sell").reduce((s, t) => s + (t.qty * t.price), 0);
    return { total: txs.length, uniqueAssets, buys, sells, totalBuyValue, totalSellValue };
  }, [state.txs]);

  // ── Filtered txs for Journal ───────────────────────────────────────────────

  const filteredTxs = useMemo(() => {
    const q = searchQ.toLowerCase().trim();
    return state.txs.filter(t => {
      const ts = new Date(t.ts);
      if (fromDate && ts < new Date(fromDate)) return false;
      if (toDate && ts > new Date(toDate + "T23:59:59")) return false;
      if (filterType && t.type !== filterType) return false;
      if (filterAsset && t.asset.toUpperCase() !== filterAsset.toUpperCase()) return false;
      if (filterVenue && (t as any).venue !== filterVenue) return false;

      if (q) {
        const matchesNote = (t.note || "").toLowerCase().includes(q);
        const matchesVenue = ((t as any).venue || "").toLowerCase().includes(q);
        const matchesAsset = t.asset.toLowerCase().includes(q);
        if (!matchesNote && !matchesVenue && !matchesAsset) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [state.txs, searchQ, filterType, filterAsset, filterVenue, fromDate, toDate]);

  const uniqueAssets = useMemo(() => {
    const assets = new Set<string>();
    state.txs.forEach(t => assets.add(t.asset.toUpperCase()));
    return Array.from(assets).sort();
  }, [state.txs]);

  const uniqueVenues = useMemo(() => {
    const venues = new Set<string>();
    state.txs.forEach(t => { if ((t as any).venue) venues.add((t as any).venue); });
    return Array.from(venues).sort();
  }, [state.txs]);

  const clearFilters = () => {
    setSearchQ("");
    setFilterType("");
    setFilterAsset("");
    setFilterVenue("");
    setFromDate("");
    setToDate("");
  };

  const exportToCsv = () => {
    if (filteredTxs.length === 0) {
      toast("No transactions to export", "bad");
      return;
    }
    const header = "Date,Type,Asset,Quantity,Price,Total,Fee,Venue,Note\n";
    const rows = filteredTxs.map(t => {
      const date = new Date(t.ts).toISOString().split("T")[0];
      const total = t.qty * t.price;
      const note = (t.note || "").replace(/"/g, '""');
      const venueStr = ((t as any).venue || "").replace(/"/g, '""');
      return `${date},${t.type.toUpperCase()},${t.asset},${t.qty},${t.price},${total},${t.fee},"${venueStr}","${note}"`;
    }).join("\n");

    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Ledger exported ✓", "good");
  };

  // ── Save manual transaction (BACKEND-ONLY) ────────────────────────────────

  const save = async () => {
    const a = asset.trim();
    const q = parseFloat(qty);
    const p = parseFloat(price) || 0;
    const f = parseFloat(fee) || 0;

    if (!a || !(q > 0)) { toast("Asset and quantity are required", "bad"); return; }

    setSaving(true);
    const result = await createManualTransaction({
      asset: a,
      type: txType,
      qty: q,
      price: p,
      fee: f,
      base: state.base || "USD",
      venue: venue || undefined,
      note: note || undefined,
    });

    if (result.success) {
      toast("Transaction saved ✓", "good");
      setAsset(""); setQty(""); setPrice(""); setFee("0"); setVenue(""); setNote("");
    } else {
      toast(result.error || "Save failed", "bad");
    }
    setSaving(false);
  };

  // ── Edit handlers (BACKEND-ONLY) ─────────────────────────────────────────

  const startEdit = (t: any) => {
    setEditId(t.id);
    setEditType(t.type);
    setEditAsset(t.asset);
    setEditQty(String(t.qty));
    setEditPrice(String(t.price));
  };

  const cancelEdit = () => setEditId(null);

  const saveEdit = async () => {
    if (!editId) return;
    const nextQty = parseFloat(editQty);
    const nextPrice = parseFloat(editPrice);
    const updates: any = {
      type: editType || undefined,
      qty: Number.isFinite(nextQty) ? nextQty : undefined,
      unit_price: Number.isFinite(nextPrice) ? nextPrice : undefined,
    };

    const originalTx = state.txs.find(t => t.id === editId);
    if (originalTx && editAsset && editAsset.toUpperCase() !== originalTx.asset.toUpperCase()) {
      try {
        const { assetId } = await resolveOrCreateAsset(editAsset.toUpperCase());
        updates.asset_id = assetId;
      } catch (err: any) {
        toast(err?.message || "Failed to resolve asset", "bad");
        return;
      }
    }

    const result = await updateLedgerTransaction(editId, updates);
    if (result.success) toast("Transaction updated ✓", "good");
    else toast(result.error || "Update failed", "bad");
    setEditId(null);
  };

  const deleteTx = async (id: string) => {
    if (!confirm("Delete this transaction?")) return;
    const result = await deleteLedgerTransaction(id);
    if (result.success) toast("Transaction deleted ✓", "good");
    else toast(result.error || "Delete failed", "bad");
  };

  // ── Import handlers ───────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setImportError("");
    setImportLoading(true);
    setIsDeltaImport(false);
    setDeltaCount(0);
    try {
      const text = await file.text();
      const hash = await hashFile(text);
      const parsedBase = await importCSV(text, file.name);
      setFileName(file.name);
      setFileHash(hash);
      if (parsedBase.rows.length === 0) {
        setImportError(parsedBase.warnings[0] ?? "No rows found in file.");
        setImportLoading(false);
        return;
      }
      if (isWorkerConfigured()) {
        const isExactMatch = await checkFileImported(parsedBase.contentHash);
        if (isExactMatch) {
          setImportError("File already imported.");
          setImportLoading(false);
          return;
        }
      }
      let parsed = parsedBase;
      if (isWorkerConfigured()) {
        const fpHashes = parsedBase.rows.map(r => r.fingerprintHash).filter(Boolean);
        const lookup = await lookupImportRows({ fingerprint_hashes: fpHashes, native_ids: [] });
        parsed = { ...parsedBase, rows: applyLookup(parsedBase.rows, lookup) };
      }
      const already = parsed.rows.filter(r => r.status === "alreadyImported").length;
      setIsDeltaImport(already > 0);
      setDeltaCount(already);
      setImportResult(parsed);
      setImportStage("preview");
    } catch (e: any) {
      setImportError("Parse failed: " + (e?.message || String(e)));
    }
    setImportLoading(false);
  }, []);

  const commitImport = async () => {
    if (!importResult) return;
    setImportStage("committing");
    const counts: ImportCounts = { parsed: importResult.rows.length, accepted: 0, rejected: 0, persisted: 0, skippedDuplicate: 0, failed: 0 };
    try {
      const assets = await getAssetCatalog(true);
      const batch: any[] = [];
      for (const row of importResult.rows) {
        if (row.status === "alreadyImported" || row.status === "invalid") { counts.rejected++; continue; }
        let { assetId } = resolveAssetId(row.assetSymbol, assets);
        if (!assetId) {
          const res = await resolveOrCreateAsset(row.assetSymbol);
          assetId = res.assetId;
        }
        batch.push({
          asset_id: assetId, timestamp: new Date(row.timestamp).toISOString(), type: row.side,
          qty: row.qty, unit_price: row.price, fee_amount: row.feeAmount, fee_currency: row.feeAsset,
          venue: EXCHANGE_LABELS[row.sourceExchange] ?? row.sourceExchange, note: row.tradeId,
          source: "import", external_id: row.tradeId || row.fingerprintHash
        });
        counts.accepted++;
      }
      const result = await commitImportedTransactions({ batchPayload: batch, fileName, fileHash, contentHash: importResult.contentHash, exchange: importResult.exchange, exportType: importResult.exportType });
      counts.persisted = result.persisted;
      counts.skippedDuplicate = result.skippedDuplicates;
      counts.failed = result.failed;
      setImportCounts(counts);
      setImportStage("done");
      toast(`Imported ${counts.persisted} trades`, "good");
    } catch (err: any) {
      setImportErrorMsg(err?.message || "Import failed");
      setImportStage("error");
    }
  };

  const resetImport = () => {
    setImportStage("upload"); setImportResult(null); setImportCounts(null);
    setFileName(""); setFileHash(""); setImportError(""); setImportErrorMsg("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <WriteStatusBanner status={writeStatus} onRetry={checkWriteStatus} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <StatCard label="TOTAL TXS" value={stats.total} sub={`${stats.uniqueAssets} assets`} />
        <StatCard label="BUYS" value={stats.buys} sub={`$${(stats.totalBuyValue / 1000).toFixed(0)}K invested`} accent="var(--good)" />
        <StatCard label="SELLS" value={stats.sells} sub={`$${(stats.totalSellValue / 1000).toFixed(0)}K out`} accent="var(--bad)" />
        <StatCard label="IMPORTED FILES" value={importedFiles.length} sub="CSV imports" />
      </div>

      <div style={{ display: "flex", gap: 0, background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: "var(--lt-radius)", padding: 4, width: "fit-content" }}>
        {[
          { id: "journal" as Tab, label: "📋 Journal", badge: filteredTxs.length },
          { id: "add" as Tab, label: "✚ Add Transaction", badge: 0 },
          { id: "import" as Tab, label: "📥 Import CSV", badge: 0 },
          { id: "connect" as Tab, label: "🔗 Connect API", badge: 0 },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "7px 16px", borderRadius: "calc(var(--lt-radius) - 2px)", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
            background: tab === t.id ? "var(--brand)" : "transparent", color: tab === t.id ? "#fff" : "var(--muted)", transition: "var(--lt-tr)"
          }}>
            {t.label} 
          </button>
        ))}
      </div>

      {tab === "journal" && (
        <div className="panel">
          <div className="panel-head">
            <h2>Transaction Journal</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="pill">{filteredTxs.length} entries</span>
              {stats.total > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button 
                    className="btn secondary" 
                    disabled={!canWrite || clearing} 
                    onClick={async () => {
                      if (!confirm("Compact all historical trades? This will merge fragmented fills into single VWAP entries. This action cannot be easily undone.")) return;
                      setClearing(true);
                      try {
                        const res = await apiFetch("/compact-all", { method: "POST" });
                        const result = await res.json();
                        if (result.ok) {
                          toast(result.message || "History compacted ✓", "good");
                          await rehydrateFromBackend();
                        } else {
                          toast(result.error || "Compaction failed", "bad");
                        }
                      } catch (err: any) {
                        toast(err.message || "Request failed", "bad");
                      }
                      setClearing(false);
                    }} 
                    style={{ fontSize: 11, padding: "4px 10px", color: "var(--brand)" }}
                  >
                    🪄 Compact History
                  </button>
                  <button className="btn secondary" disabled={!canWrite || clearing} onClick={async () => {
                    if (!confirm("Clear ALL data?")) return;
                    setClearing(true);
                    if ((await clearAllData()).success) toast("Data cleared", "good");
                    setClearing(false);
                  }} style={{ fontSize: 11, padding: "4px 10px", color: "var(--bad)" }}>
                    🗑 Clear All
                  </button>
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", borderBottom: "1px solid var(--line)", background: "var(--panel2)33" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>SEARCH</label>
              <input className="inp" placeholder="Note, venue, asset..." value={searchQ} onChange={e => setSearchQ(e.target.value)} style={{ width: 140, padding: "6px 10px", fontSize: 12 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>TYPE</label>
              <select className="inp" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 100, padding: "6px 8px", fontSize: 12 }}>
                <option value="">All Types</option>
                {TX_TYPES.map(tt => <option key={tt.value} value={tt.value}>{tt.label}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>ASSET</label>
              <select className="inp" value={filterAsset} onChange={e => setFilterAsset(e.target.value)} style={{ width: 100, padding: "6px 8px", fontSize: 12 }}>
                <option value="">All Assets</option>
                {uniqueAssets.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>VENUE</label>
              <select className="inp" value={filterVenue} onChange={e => setFilterVenue(e.target.value)} style={{ width: 100, padding: "6px 8px", fontSize: 12 }}>
                <option value="">All Venues</option>
                {uniqueVenues.map(v => <option key={v} value={v}>{EXCHANGE_LABELS[v] || v}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              {(searchQ || filterType || filterAsset || filterVenue) && (
                <button className="btn secondary" onClick={clearFilters} style={{ padding: "6px 14px", fontSize: 12 }}>Clear</button>
              )}
              <button className="btn secondary" onClick={exportToCsv} style={{ padding: "6px 14px", fontSize: 12, color: "var(--brand)" }}>Export CSV</button>
            </div>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>DATE</th><th>TYPE</th><th>ASSET</th><th>QTY</th><th>PRICE</th><th>TOTAL</th><th>FEE</th><th>VENUE</th><th>NOTE</th><th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredTxs.map(t => (
                  <tr key={t.id}>
                    {editId === t.id ? (
                      <>
                        <td>{new Date(t.ts).toLocaleDateString()}</td>
                        <td><select className="inp" value={editType} onChange={e => setEditType(e.target.value)}>{TX_TYPES.map(tt => <option key={tt.value} value={tt.value}>{tt.label}</option>)}</select></td>
                        <td><CoinAutocomplete value={editAsset} onChange={setEditAsset} /></td>
                        <td><input className="inp" type="number" value={editQty} onChange={e => setEditQty(e.target.value)} /></td>
                        <td><input className="inp" type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} /></td>
                        <td colSpan={4}></td>
                        <td>
                          <button onClick={saveEdit} style={{ color: "var(--good)" }}>✓</button>
                          <button onClick={cancelEdit}>✕</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="mono muted">{new Date(t.ts).toLocaleString()}</td>
                        <td><TypeBadge type={t.type} /></td>
                        <td className="mono"><strong>{t.asset}</strong></td>
                        <td className="mono">{fmtQty(t.qty)}</td>
                        <td className="mono">${fmtPx(t.price)}</td>
                        <td className="mono">${fmtPx(t.qty * t.price)}</td>
                        <td className="mono muted">{t.fee > 0 ? fmtFiat(t.fee, state.base) : "—"}</td>
                        <td className="mono muted">{(t as any).venue || "—"}</td>
                        <td className="mono muted">{t.note || "—"}</td>
                        <td>
                          <button onClick={() => startEdit(t)}>✎</button>
                          <button onClick={() => deleteTx(t.id)} style={{ color: "var(--bad)" }}>🗑</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "add" && (
        <div className="panel">
          <div className="panel-head"><h2>Add Transaction</h2></div>
          <div className="panel-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-field"><label className="form-label">Type</label>
                <div style={{ display: "flex", gap: 4 }}>{TX_TYPES.map(tt => (
                  <button key={tt.value} onClick={() => setTxType(tt.value)} style={{ padding: "4px 10px", fontSize: 11, border: "1px solid var(--line)", borderRadius: 4, background: txType === tt.value ? "var(--brand)" : "transparent", color: txType === tt.value ? "#fff" : "inherit" }}>{tt.label}</button>
                ))}</div>
              </div>
              <div className="form-field"><label className="form-label">Asset</label><CoinAutocomplete value={asset} onChange={setAsset} /></div>
              <div className="form-field"><label className="form-label">Qty</label><input className="inp" type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
              <div className="form-field"><label className="form-label">Price</label><input className="inp" type="number" value={price} onChange={e => setPrice(e.target.value)} /></div>
              <div className="form-field"><label className="form-label">Fee</label><input className="inp" type="number" value={fee} onChange={e => setFee(e.target.value)} /></div>
              <div className="form-field"><label className="form-label">Venue</label><input className="inp" value={venue} onChange={e => setVenue(e.target.value)} /></div>
              <div className="form-field"><label className="form-label">Note</label><input className="inp" value={note} onChange={e => setNote(e.target.value)} /></div>
            </div>
            <button className="btn" onClick={save} disabled={saving || !asset || !qty} style={{ marginTop: 12 }}>{saving ? "Saving..." : "Save Transaction"}</button>
          </div>
        </div>
      )}

      {tab === "import" && (
        <div className="panel">
          <div className="panel-head"><h2>Import CSV</h2></div>
          <div className="panel-body">
            {importStage === "upload" && (
              <div onClick={() => fileRef.current?.click()} style={{ border: "2px dashed var(--line)", padding: 40, textAlign: "center", cursor: "pointer", background: "var(--panel2)" }}>
                <input ref={fileRef} type="file" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                <strong>Click to Upload CSV</strong>
              </div>
            )}
            {importStage === "preview" && importResult && (
              <div>
                <p>Found <strong>{importResult.rows.length}</strong> trades.</p>
                <button className="btn" onClick={commitImport}>Commit Trades</button>
                <button className="btn secondary" onClick={resetImport}>Cancel</button>
              </div>
            )}
            {importStage === "done" && (
              <div style={{ textAlign: "center" }}>
                <p>Import successful!</p>
                <button className="btn" onClick={resetImport}>Import Another</button>
              </div>
            )}
            {importError && <p style={{ color: "var(--bad)" }}>{importError}</p>}
          </div>
        </div>
      )}

      {tab === "connect" && <ExchangeConnect />}
    </div>
  );
}
