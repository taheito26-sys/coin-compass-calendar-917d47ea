import { useState, useEffect, useCallback, useRef } from "react";
import { useAdmin, fetchAllUsers, type AdminUser } from "@/hooks/useAdmin";
import { CryptoCtxRaw } from "@/lib/cryptoContext";
import { CryptoState, defaultState, loadState, saveState } from "@/lib/cryptoState";
import {
  fetchTransactions,
  fetchImportedFiles,
  fetchUserPreferences,
} from "@/lib/api";
import { getAssetCatalog, resolveAssetSymbol } from "@/lib/assetResolver";
import type { ApiTransaction } from "@/lib/api";

import DashboardPage from "@/pages/DashboardPage";
import PortfolioPage from "@/pages/PortfolioPage";
import LedgerPage from "@/pages/LedgerPage";
import CalendarPage from "@/pages/CalendarPage";

type AdminTab = "dashboard" | "portfolio" | "ledger" | "calendar";

function mapTransactions(
  transactions: ApiTransaction[],
  assetById: Map<string, { symbol: string; binance_symbol: string | null }>,
) {
  return transactions
    .map((tx) => {
      const asset = assetById.get(tx.asset_id);
      const symbol = resolveAssetSymbol(asset?.symbol || asset?.binance_symbol || "");
      if (!symbol) return null;
      const ts = Date.parse(tx.timestamp);
      if (!Number.isFinite(ts)) return null;
      const qty = Number(tx.qty || 0);
      const price = Number(tx.unit_price || 0);
      const fee = Number(tx.fee_amount || 0);
      return {
        id: tx.id, assetId: tx.asset_id, ts, type: tx.type, asset: symbol,
        qty, price, total: qty * price, fee, feeAsset: tx.fee_currency || "USD",
        accountId: "acc_main", note: tx.note || "", venue: tx.venue || "", lots: "",
      };
    })
    .filter((tx): tx is NonNullable<typeof tx> => tx !== null);
}

/** Provides user-specific crypto context to child page components */
function ImpersonatedProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [state, setStateRaw] = useState<CryptoState>(() => ({
    ...defaultState(),
    syncStatus: "loading",
  }));
  const [toastMsg, setToast] = useState<{ msg: string; type: string } | null>(null);

  const toast = useCallback((msg: string, type = "") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const setState = useCallback((arg: CryptoState | ((prev: CryptoState) => CryptoState)) => {
    setStateRaw((prev) => (typeof arg === "function" ? arg(prev) : arg));
  }, []);

  const rehydrate = useCallback(async () => {
    setStateRaw((prev) => ({ ...prev, syncStatus: "loading" as const }));
    try {
      const [assets, transactions, importedFiles, userPrefs] = await Promise.all([
        getAssetCatalog(true),
        fetchTransactions(userId),
        fetchImportedFiles(userId).catch(() => []),
        fetchUserPreferences(userId).catch(() => ({} as Record<string, string>)),
      ]);

      const assetById = new Map(assets.map((a) => [a.id, a]));
      const canonicalTxs = mapTransactions(transactions, assetById);

      const canonicalImported = importedFiles.map((file: any) => ({
        name: file.file_name, hash: file.file_hash,
        importedAt: file.imported_at ? Date.parse(file.imported_at) : Date.now(),
        exchange: file.exchange, exportType: file.export_type,
        rowCount: Number(file.row_count || 0),
      }));

      const prefUpdates: Partial<CryptoState> = {};
      if (userPrefs.base) prefUpdates.base = userPrefs.base;
      if (userPrefs.method) prefUpdates.method = userPrefs.method;
      if (userPrefs.layout) prefUpdates.layout = userPrefs.layout;
      if (userPrefs.theme) prefUpdates.theme = userPrefs.theme;
      if (userPrefs.watch) { try { prefUpdates.watch = JSON.parse(userPrefs.watch); } catch {} }
      if (userPrefs.dashboardLayout) { try { prefUpdates.dashboardLayout = JSON.parse(userPrefs.dashboardLayout); } catch {} }
      if (userPrefs.minImportValue) prefUpdates.minImportValue = parseFloat(userPrefs.minImportValue) || 100;

      setStateRaw((prev) => ({
        ...prev, ...prefUpdates,
        txs: canonicalTxs, importedFiles: canonicalImported,
        syncStatus: "synced" as const, syncError: undefined,
      }));
    } catch (err) {
      console.error("[admin-impersonation] Hydration failed:", err);
      setStateRaw((prev) => ({
        ...prev, syncStatus: "error" as const,
        syncError: err instanceof Error ? err.message : "Failed to load user data",
      }));
    }
  }, [userId]);

  // Hydrate on mount and when userId changes
  useEffect(() => {
    rehydrate();
  }, [rehydrate]);

  const ctxValue = {
    state,
    setState,
    refresh: async () => {},
    rehydrateFromBackend: rehydrate,
    toast,
    toastMsg,
  };

  return (
    <CryptoCtxRaw.Provider value={ctxValue}>
      {children}
    </CryptoCtxRaw.Provider>
  );
}

export default function AdminPage() {
  const { isAdmin, loading: roleLoading } = useAdmin();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>("dashboard");

  useEffect(() => {
    if (!isAdmin) return;
    fetchAllUsers().then(setUsers).catch(console.error);
  }, [isAdmin]);

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

  const tabs: { id: AdminTab; label: string; icon: string }[] = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "portfolio", label: "Portfolio", icon: "💼" },
    { id: "ledger", label: "Ledger", icon: "📒" },
    { id: "calendar", label: "Calendar", icon: "📅" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Admin header bar */}
      <div style={{
        padding: "12px 20px", background: "rgba(141,27,61,0.08)",
        borderBottom: "1px solid rgba(141,27,61,0.2)",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>🛡️</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>Admin Panel</span>
          <span style={{
            fontSize: 10, background: "rgba(141,27,61,0.35)", color: "#f8a", padding: "2px 8px",
            borderRadius: 6, fontWeight: 700, textTransform: "uppercase",
          }}>Super Admin</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <label style={{ color: "#888", fontSize: 12 }}>Viewing as:</label>
          <select
            value={selectedUser || ""}
            onChange={(e) => setSelectedUser(e.target.value || null)}
            style={{
              background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 8,
              padding: "6px 12px", fontSize: 12, minWidth: 260, cursor: "pointer",
            }}
          >
            <option value="">— Select a user —</option>
            {users.map((u, i) => (
              <option key={u.id} value={u.id}>
                User {i + 1} ({u.id.slice(0, 8)}…)
              </option>
            ))}
          </select>
          <span style={{ color: "#555", fontSize: 11 }}>{users.length} users</span>
        </div>
      </div>

      {!selectedUser ? (
        <div style={{
          flex: 1, display: "grid", placeItems: "center", color: "#555",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>👤</div>
            <div style={{ fontSize: 14 }}>Select a user above to view their data</div>
            <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>
              You will see their exact Dashboard, Portfolio, Ledger & Calendar
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div style={{
            display: "flex", gap: 2, padding: "8px 20px 0",
            borderBottom: "1px solid #1a1a1a",
          }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: "8px 16px", border: "none", cursor: "pointer",
                  borderBottom: tab === t.id ? "2px solid #8D1B3D" : "2px solid transparent",
                  background: "transparent",
                  color: tab === t.id ? "#fff" : "#666",
                  fontWeight: tab === t.id ? 700 : 400,
                  fontSize: 13, display: "flex", alignItems: "center", gap: 6,
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 14 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* Render actual page inside impersonated context */}
          <div className="scroll" style={{ flex: 1, overflow: "auto" }}>
            <ImpersonatedProvider userId={selectedUser} key={selectedUser}>
              {tab === "dashboard" && <DashboardPage />}
              {tab === "portfolio" && <PortfolioPage />}
              {tab === "ledger" && <LedgerPage />}
              {tab === "calendar" && <CalendarPage />}
            </ImpersonatedProvider>
          </div>
        </>
      )}
    </div>
  );
}
