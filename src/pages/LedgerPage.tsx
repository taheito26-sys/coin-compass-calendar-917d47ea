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
  { value: "transfer_out", label: "Transfer Out", color: "var(--muted)" },
  { value: "reward",       label: "Reward",       color: "#f59e0b" },
  { value: "adjustment",   label: "Adjustment",   color: "#8b5cf6" },
];

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  buy:          { label: "BUY",    color: "var(--good)",  icon: "↑" },
  sell:         { label: "SELL",   color: "var(--bad)",   icon: "↓" },
  transfer_in:  { label: "IN",     color: "var(--brand)", icon: "→" },
  transfer_out: { label: "OUT",    color: "var(--muted)", icon: "←" },
  reward:       { label: "REWARD", color: "#f59e0b",      icon: "★" },
  adjustment:   { label: "ADJ",    color: "#8b5cf6",      icon: "~" },
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

  // Manual entry
  const [txType, setTxType] = useState("buy");
  const [asset, setAsset] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [venue, setVenue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Journal search/filter
  const [searchQ, setSearchQ] = useState("");
  const [filterType, setFilterType] = useState("");

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
    let txs = [...state.txs].sort((a, b) => b.ts - a.ts).slice(0, 500);
    if (filterType) txs = txs.filter(t => t.type === filterType);
    if (searchQ) {
      const q = searchQ.toLowerCase();
      txs = txs.filter(t => t.asset.toLowerCase().includes(q) || (t.note || "").toLowerCase().includes(q));
    }
    return txs;
  }, [state.txs, filterType, searchQ]);

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

    const updates: { type?: string; qty?: number; unit_price?: number; asset_id?: string } = {
      type: editType || undefined,
      qty: Number.isFinite(nextQty) ? nextQty : undefined,
      unit_price: Number.isFinite(nextPrice) ? nextPrice : undefined,
    };

    // If asset symbol changed, resolve new asset_id
    const originalTx = state.txs.find(t => t.id === editId);
    const trimmedAsset = editAsset.trim().toUpperCase();
    if (originalTx && trimmedAsset && trimmedAsset !== originalTx.asset.toUpperCase()) {
      try {
        const { assetId } = await resolveOrCreateAsset(trimmedAsset);
        updates.asset_id = assetId;
      } catch (err: any) {
        toast(err?.message || "Failed to resolve asset", "bad");
        return;
      }
    }

    const result = await updateLedgerTransaction(editId, updates);

    if (result.success) {
      toast("Transaction updated ✓", "good");
    } else {
      toast(result.error || "Update failed", "bad");
    }
    setEditId(null);
  };

  // ── Delete handler (BACKEND-ONLY) ────────────────────────────────────────

  const deleteTx = async (id: string) => {
    if (!confirm("Delete this transaction? This will recalculate your portfolio.")) return;

    const result = await deleteLedgerTransaction(id);
    if (result.success) {
      toast("Transaction deleted ✓", "good");
    } else {
      toast(result.error || "Delete failed", "bad");
    }
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

      // Backend-aware delta check via fingerprints
      let parsed = parsedBase;
      if (isWorkerConfigured()) {
        try {
          const fpHashes = parsedBase.rows.map((r) => r.fingerprintHash).filter(Boolean);
          const nativeIds = parsedBase.rows.map((r) => r.nativeId).filter(Boolean) as string[];
          const lookup = await lookupImportRows({ fingerprint_hashes: fpHashes, native_ids: nativeIds });
          parsed = { ...parsedBase, rows: applyLookup(parsedBase.rows, lookup) };
        } catch {
          // Delta lookup failed — still allow preview, commit will check backend
        }
      }

      const already = parsed.rows.filter((r) => r.status === "alreadyImported").length;
      const invalid = parsed.rows.filter((r) => r.status === "invalid").length;
      const acceptedNew = parsed.rows.filter((r) => r.status === "new" || r.status === "warning").length;

      setIsDeltaImport(already > 0);
      setDeltaCount(already);

      if (acceptedNew === 0) {
        setImportError(
          already > 0
            ? `No new transactions found. All rows were already imported (${already} already imported${invalid ? `, ${invalid} invalid` : ""}).`
            : "No importable rows found.",
        );
        setImportLoading(false);
        return;
      }

      setImportResult(parsed);
      setImportStage("preview");
    } catch (e: any) {
      setImportError("Parse failed: " + (e?.message ?? String(e)));
    }

    setImportLoading(false);
  }, []);

  // ── Commit import (BACKEND-ONLY) ──────────────────────────────────────────

  const commitImport = async () => {
    if (!importResult || importResult.rows.length === 0) return;

    setImportStage("committing");
    setImportErrorMsg("");

    const counts: ImportCounts = { parsed: importResult.rows.length, accepted: 0, rejected: 0, persisted: 0, skippedDuplicate: 0, failed: 0 };

    try {
      const assets = await getAssetCatalog(true);
      const batchPayload: any[] = [];
      const autoCreated: string[] = [];

      for (const row of importResult.rows) {
        // Skip already-imported rows
        if (row.status === "alreadyImported" || row.status === "invalid") {
          counts.rejected++;
          continue;
        }

        let { assetId, symbol } = resolveAssetId(row.assetSymbol, assets);
        if (!assetId) {
          try {
            const result = await resolveOrCreateAsset(row.assetSymbol);
            assetId = result.assetId;
            symbol = result.symbol;
            autoCreated.push(symbol);
          } catch {
            counts.rejected++;
            continue;
          }
        }
        const nativeId = row.tradeId || row.orderId || row.txHash || "";
        counts.accepted++;
        batchPayload.push({
          asset_id: assetId,
          timestamp: new Date(row.timestamp).toISOString(),
          type: row.side,
          qty: row.qty,
          unit_price: row.price,
          fee_amount: row.feeAmount,
          fee_currency: row.feeAsset || "USD",
          external_id: nativeId || undefined,
          venue: EXCHANGE_LABELS[row.sourceExchange] ?? row.sourceExchange,
          note: `Import: ${nativeId}`,
          source: "import",
        });
      }

      if (batchPayload.length === 0) {
        setImportErrorMsg("No rows accepted.");
        setImportStage("error");
        setImportCounts(counts);
        return;
      }

      const result = await commitImportedTransactions({
        batchPayload,
        fileName,
        fileHash,
        exchange: importResult.exchange,
        exportType: importResult.exportType,
      });

      counts.persisted = result.persisted;
      counts.skippedDuplicate = result.skippedDuplicates;
      counts.failed = result.failed;
      setImportCounts(counts);

      if (!result.success) {
        setImportErrorMsg(result.error || "Import failed — backend error");
        setImportStage("error");
        toast("Import failed — no rows were committed", "bad");
      } else if (counts.failed > 0 && counts.persisted === 0) {
        setImportErrorMsg("All rows failed. Check the backend logs.");
        setImportStage("error");
      } else {
        setImportStage("done");
        const createdText = autoCreated.length > 0 ? ` · ${autoCreated.length} new assets created` : "";
        toast(`Imported ${counts.persisted} trades (${counts.skippedDuplicate} dupes skipped)${createdText}`,
          counts.failed > 0 ? "bad" : "good");
      }
    } catch (err: any) {
      setImportErrorMsg(`Backend error: ${err?.message ?? "Unknown"}`);
      setImportStage("error");
      setImportCounts(counts);
      toast("Import failed — backend error", "bad");
    }
  };

  const resetImport = () => {
    setImportStage("upload");
    setImportResult(null);
    setImportCounts(null);
    setImportErrorMsg("");
    setFileName("");
    setFileHash("");
    setImportError("");
    setIsDeltaImport(false);
    setDeltaCount(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Backend write status banner */}
      <WriteStatusBanner status={writeStatus} onRetry={checkWriteStatus} />

      {/* Sync error banner */}
      {state.syncStatus === "error" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
          background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)",
          borderRadius: "var(--lt-radius)", fontSize: 13, color: "var(--bad)",
        }}>
          <span>⚠ Backend sync error: {state.syncError ?? "Unknown"}. Data may be stale.</span>
          <button className="btn secondary" onClick={rehydrateFromBackend}
            style={{ marginLeft: "auto", fontSize: 11, padding: "4px 10px" }}>Retry Sync</button>
        </div>
      )}

      {/* Stats Row */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <StatCard label="TOTAL TXS" value={stats.total} sub={`${stats.uniqueAssets} assets`} />
        <StatCard label="BUYS" value={stats.buys} sub={`$${(stats.totalBuyValue / 1000).toFixed(0)}K invested`} accent="var(--good)" />
        <StatCard label="SELLS" value={stats.sells} sub={`$${(stats.totalSellValue / 1000).toFixed(0)}K out`} accent="var(--bad)" />
        <StatCard label="IMPORTED FILES" value={importedFiles.length} sub="CSV imports" />
      </div>

      {/* Tab Bar */}
      <div style={{
        display: "flex", gap: 0, background: "var(--panel2)",
        border: "1px solid var(--line)", borderRadius: "var(--lt-radius)", padding: 4,
        width: "fit-content",
      }}>
        {([
          { id: "journal" as Tab, label: "📋 Journal",         badge: stats.total },
          { id: "add"     as Tab, label: "✚ Add Transaction",  badge: 0 },
          { id: "import"  as Tab, label: "📥 Import CSV",       badge: 0 },
          { id: "connect" as Tab, label: "🔗 Connect API",      badge: 0 },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "7px 16px", borderRadius: "calc(var(--lt-radius) - 2px)",
              border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
              display: "flex", alignItems: "center", gap: 6, transition: "var(--lt-tr)",
              background: tab === t.id ? "var(--brand)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--muted)",
            }}>
            {t.label}
            {t.badge > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 900,
                background: tab === t.id ? "rgba(255,255,255,0.25)" : "var(--brand3)",
                color: tab === t.id ? "#fff" : "var(--brand)",
                borderRadius: 999, padding: "1px 6px",
              }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════ TAB: JOURNAL ═══════════ */}
      {tab === "journal" && (
        <div className="panel">
          <div className="panel-head">
            <h2>Transaction Journal</h2>
            <span className="pill">{filteredTxs.length} entries</span>
          </div>

          {/* Filters */}
          <div style={{ padding: "10px 16px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid var(--line)" }}>
            <input
              className="inp"
              placeholder="Search asset, note…"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              style={{ width: 180, padding: "5px 10px", fontSize: 12 }}
            />
            <select
              className="inp"
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              style={{ width: 140, padding: "5px 8px", fontSize: 12 }}
            >
              <option value="">All Types</option>
              {TX_TYPES.map(tt => <option key={tt.value} value={tt.value}>{tt.label}</option>)}
            </select>
            {(searchQ || filterType) && (
              <button className="btn secondary" onClick={() => { setSearchQ(""); setFilterType(""); }}
                style={{ padding: "5px 10px", fontSize: 11 }}>Clear</button>
            )}
          </div>

          {/* Table */}
          <div className="panel-body" style={{ padding: 0 }}>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>TYPE</th>
                    <th>ASSET</th>
                    <th>QTY</th>
                    <th>UNIT PRICE</th>
                    <th>TOTAL</th>
                    <th>FEE</th>
                    <th>VENUE</th>
                    <th>NOTE</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxs.length === 0 ? (
                    <tr><td colSpan={10} className="muted" style={{ textAlign: "center", padding: 32 }}>
                      No transactions yet. Add one or import a CSV.
                    </td></tr>
                  ) : filteredTxs.map(t => (
                    <tr key={t.id}>
                      {editId === t.id ? (
                        <>
                          <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                            {new Date(t.ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" })}
                          </td>
                          <td>
                            <select className="inp" value={editType} onChange={e => setEditType(e.target.value)}
                              style={{ width: 90, padding: "2px 4px", fontSize: 11 }}>
                              {TX_TYPES.map(tt => <option key={tt.value} value={tt.value}>{tt.label}</option>)}
                            </select>
                          </td>
                          <td>
                            <input className="inp" value={editAsset} onChange={e => setEditAsset(e.target.value.toUpperCase())}
                              style={{ width: 80, padding: "2px 4px", fontSize: 11, fontWeight: 800, fontFamily: "var(--font-mono, monospace)" }} />
                          </td>
                          <td>
                            <input className="inp" type="number" value={editQty} onChange={e => setEditQty(e.target.value)}
                              style={{ width: 90, padding: "2px 4px", fontSize: 11 }} />
                          </td>
                          <td>
                            <input className="inp" type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                              style={{ width: 80, padding: "2px 4px", fontSize: 11 }} />
                          </td>
                          <td className="mono muted">—</td>
                          <td className="mono muted">—</td>
                          <td className="mono muted">—</td>
                          <td className="mono muted">—</td>
                          <td>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={saveEdit} disabled={!canWrite}
                                style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "4px 8px", cursor: canWrite ? "pointer" : "not-allowed", color: "var(--good)", fontSize: 12, opacity: canWrite ? 1 : 0.5 }}>✓</button>
                              <button onClick={cancelEdit}
                                style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "4px 8px", cursor: "pointer", color: "var(--muted)", fontSize: 12 }}>✕</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                            {new Date(t.ts).toLocaleString(undefined, { month: "short", day: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td><TypeBadge type={t.type} /></td>
                          <td className="mono" style={{ fontWeight: 900 }}>{t.asset}</td>
                          <td className="mono">{fmtQty(t.qty)}</td>
                          <td className="mono">{(t.type === "buy" || t.type === "sell") ? "$" + fmtPx(t.price) : "—"}</td>
                          <td className="mono">{(t.qty * t.price) > 0 ? "$" + fmtPx(t.qty * t.price) : "—"}</td>
                          <td className="mono muted">{t.fee > 0 ? fmtFiat(t.fee, state.base) : "—"}</td>
                          <td className="mono muted">{(t as any).venue ?? "—"}</td>
                          <td className="mono muted" style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.note ?? "—"}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={() => startEdit(t)} disabled={!canWrite}
                                style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "4px 8px", cursor: canWrite ? "pointer" : "not-allowed", color: "var(--text)", fontSize: 13, opacity: canWrite ? 1 : 0.5 }}>✎</button>
                              <button onClick={() => deleteTx(t.id)} disabled={!canWrite}
                                style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "4px 8px", cursor: canWrite ? "pointer" : "not-allowed", color: "var(--bad)", fontSize: 13, opacity: canWrite ? 1 : 0.5 }}>🗑</button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Imported files footer */}
          {importedFiles.length > 0 && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--line)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>IMPORTED FILES:</span>
              {importedFiles.map((f: any, i: number) => (
                <span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--muted)" }}>
                  {EXCHANGE_LABELS[f.exchange] ?? f.exchange} · {f.rowCount} rows
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TAB: ADD TRANSACTION ═══════════ */}
      {tab === "add" && (
        <div className="panel">
          <div className="panel-head">
            <h2>Add Transaction</h2>
            {saving && <span className="pill">Saving…</span>}
            {!canWrite && <span className="pill" style={{ background: "rgba(220,38,38,0.15)", color: "var(--bad)" }}>Backend unavailable</span>}
          </div>
          <div className="panel-body">
            {/* Transaction type pills */}
            <div className="form-field" style={{ marginBottom: 12 }}>
              <label className="form-label">Transaction Type</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {TX_TYPES.map(tt => (
                  <button key={tt.value} onClick={() => setTxType(tt.value)} style={{
                    padding: "7px 16px", borderRadius: "var(--lt-radius-sm)", border: "1px solid",
                    borderColor: txType === tt.value ? tt.color : "var(--line)",
                    background: txType === tt.value ? `${tt.color}18` : "transparent",
                    color: txType === tt.value ? tt.color : "var(--muted)",
                    cursor: "pointer", fontSize: 12, fontWeight: txType === tt.value ? 800 : 500,
                    transition: "var(--lt-tr)",
                  }}>{tt.label}</button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div className="form-field">
                <label className="form-label">Asset</label>
                <CoinAutocomplete value={asset} onChange={setAsset} />
              </div>
              <div className="form-field">
                <label className="form-label">Quantity</label>
                <input className="inp" type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-field">
                <label className="form-label">Unit Price ({state.base || "USD"})</label>
                <input className="inp" type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-field">
                <label className="form-label">Fee</label>
                <input className="inp" type="number" min="0" value={fee} onChange={e => setFee(e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-field">
                <label className="form-label">Venue</label>
                <input className="inp" value={venue} onChange={e => setVenue(e.target.value)} placeholder="Binance, Coinbase…" />
              </div>
              <div className="form-field">
                <label className="form-label">Note</label>
                <input className="inp" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            {/* Live preview */}
            {asset && parseFloat(qty) > 0 && (
              <div style={{
                marginTop: 12, padding: "10px 14px",
                background: "var(--panel2)", border: "1px solid var(--line)",
                borderRadius: "var(--lt-radius-sm)", fontSize: 12,
                display: "flex", gap: 16, flexWrap: "wrap",
              }}>
                <span className="muted">Preview:</span>
                <span><strong>{txType.toUpperCase()}</strong> {parseFloat(qty) || 0} <strong>{asset.toUpperCase()}</strong></span>
                {parseFloat(price) > 0 && (
                  <span>@ ${fmtPx(parseFloat(price))} = <strong>${fmtPx(parseFloat(qty) * parseFloat(price))}</strong></span>
                )}
                {parseFloat(fee) > 0 && <span className="muted">Fee: ${fmtPx(parseFloat(fee))}</span>}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={save} disabled={saving || !asset || !qty || !canWrite}
                style={{ opacity: canWrite ? 1 : 0.5 }}>
                {saving ? "Saving…" : canWrite ? "Save Transaction" : "Backend Unavailable"}
              </button>
              <button className="btn secondary" onClick={() => { setAsset(""); setQty(""); setPrice(""); setFee("0"); setVenue(""); setNote(""); }}>
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ TAB: CSV IMPORT ═══════════ */}
      {tab === "import" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="panel">
            <div className="panel-head">
              <h2>Import CSV</h2>
              <span className="pill">Spot Trades · Binance · Bybit · OKX · Gate.io · MEXC · KuCoin</span>
            </div>
            <div className="panel-body">

              {/* STAGE: UPLOAD */}
              {importStage === "upload" && (
                <div>
                  {!canWrite && (
                    <div style={{
                      marginBottom: 12, padding: "10px 14px",
                      background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)",
                      borderRadius: "var(--lt-radius-sm)", fontSize: 12, color: "var(--bad)",
                    }}>
                      ⚠ Backend unavailable — CSV import is disabled. Transactions cannot be saved.
                    </div>
                  )}
                  <div
                    style={{
                      border: "2px dashed var(--line)", borderRadius: "var(--lt-radius)",
                      padding: "40px 24px", textAlign: "center", cursor: canWrite ? "pointer" : "not-allowed",
                      transition: "var(--lt-tr)", background: "var(--panel2)",
                      opacity: canWrite ? 1 : 0.5,
                    }}
                    onDragOver={e => { if (canWrite) e.preventDefault(); }}
                    onDrop={e => { e.preventDefault(); if (canWrite) { const f = e.dataTransfer.files[0]; if (f) handleFile(f); } }}
                    onClick={() => canWrite && fileRef.current?.click()}
                  >
                    <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }}
                      onChange={e => { const f = e.target.files?.[0]; if (f && canWrite) handleFile(f); }} />
                    {importLoading ? (
                      <div className="muted">Parsing…</div>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" width="32" height="32" style={{ color: "var(--muted)", margin: "0 auto 8px" }}>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Drop CSV or click to browse</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>Supports Binance, Bybit, OKX, Gate.io spot trade exports</div>
                      </>
                    )}
                  </div>
                  {importError && (
                    <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: "var(--lt-radius-sm)", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "var(--bad)", fontSize: 12 }}>
                      ⚠ {importError}
                    </div>
                  )}
                </div>
              )}

              {/* STAGE: PREVIEW */}
              {importStage === "preview" && importResult && (
                <div>
                  {isDeltaImport && (
                    <div style={{
                      marginBottom: 12, padding: "10px 14px",
                      background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)",
                      borderRadius: "var(--lt-radius-sm)", fontSize: 12, color: "var(--warn)",
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span style={{ fontSize: 16 }}>⚡</span>
                      <span>
                        <strong>Delta import:</strong> This file was previously imported.{" "}
                        <strong>{deltaCount}</strong> row{deltaCount !== 1 ? "s" : ""} already in your tracker —
                        only the <strong>{importResult.rowCount}</strong> new row{importResult.rowCount !== 1 ? "s" : ""} will be added.
                      </span>
                    </div>
                  )}
                  <div style={{ marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <StatCard label={isDeltaImport ? "NEW ROWS" : "ROWS PARSED"} value={importResult.rowCount} accent="var(--good)" />
                    {isDeltaImport && <StatCard label="ALREADY EXIST" value={deltaCount} accent="var(--muted)" />}
                    <StatCard label="SKIPPED" value={importResult.skippedCount} accent={importResult.skippedCount > 0 ? "var(--bad)" : "var(--muted)"} />
                    <StatCard label="EXCHANGE" value={EXCHANGE_LABELS[importResult.exchange] ?? importResult.exchange} />
                    <StatCard label="TYPE" value={importResult.exportType} />
                  </div>
                  {importResult.dateRange && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                      Date range: {new Date(importResult.dateRange[0]).toLocaleDateString()} → {new Date(importResult.dateRange[1]).toLocaleDateString()}
                    </div>
                  )}
                  {importResult.warnings.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      {importResult.warnings.map((w, i) => (
                        <div key={i} style={{ padding: "6px 10px", borderRadius: "var(--lt-radius-sm)", background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.25)", color: "var(--warn)", fontSize: 12, marginBottom: 4 }}>
                          ⚠ {w}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
                    File: <strong style={{ color: "var(--text)" }}>{fileName}</strong>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={commitImport} disabled={!canWrite}
                      style={{ opacity: canWrite ? 1 : 0.5 }}>
                      {!canWrite ? "Backend Unavailable" : isDeltaImport ? `Import ${importResult.rowCount} New Trade${importResult.rowCount !== 1 ? "s" : ""} →` : `Commit ${importResult.rowCount} Trades →`}
                    </button>
                    <button className="btn secondary" onClick={resetImport}>Cancel</button>
                  </div>
                </div>
              )}

              {/* STAGE: COMMITTING */}
              {importStage === "committing" && (
                <div style={{ textAlign: "center", padding: "32px 24px" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Persisting to backend…</div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>Do not close this page.</div>
                </div>
              )}

              {/* STAGE: DONE */}
              {importStage === "done" && importCounts && (
                <div>
                  <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>✅</div>
                  <div style={{ marginBottom: 16, display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <StatCard label="PERSISTED" value={importCounts.persisted} accent="var(--good)" />
                    <StatCard label="DUPES SKIPPED" value={importCounts.skippedDuplicate} accent="var(--muted)" />
                    <StatCard label="REJECTED" value={importCounts.rejected} accent={importCounts.rejected > 0 ? "var(--bad)" : "var(--muted)"} />
                    <StatCard label="FAILED" value={importCounts.failed} accent={importCounts.failed > 0 ? "var(--bad)" : "var(--muted)"} />
                  </div>
                  {importErrorMsg && (
                    <div style={{ padding: "8px 12px", borderRadius: "var(--lt-radius-sm)", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "var(--bad)", fontSize: 12, marginBottom: 12 }}>
                      ⚠ {importErrorMsg}
                    </div>
                  )}
                  <button className="btn" onClick={resetImport}>Import Another File</button>
                </div>
              )}

              {/* STAGE: ERROR */}
              {importStage === "error" && (
                <div>
                  <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>❌</div>
                  <div style={{ padding: "8px 12px", borderRadius: "var(--lt-radius-sm)", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "var(--bad)", fontSize: 12, marginBottom: 16 }}>
                    {importErrorMsg || "Import failed — no rows were committed to the backend."}
                  </div>
                  <button className="btn secondary" onClick={resetImport}>Try Again</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ TAB: CONNECT API ═══════════ */}
      {tab === "connect" && <ExchangeConnect />}
    </div>
  );
}
