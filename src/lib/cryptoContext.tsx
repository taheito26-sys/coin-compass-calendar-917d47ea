import React, { createContext, useContext, useState, useCallback, useEffect, useRef, forwardRef } from "react";
import { useAuth } from "@/lib/supabaseAuth";
import { CryptoState, loadState, saveState, defaultState, refreshPrices, clearBusinessCache } from "./cryptoState";
import {
  fetchImportedFiles,
  fetchTransactions,
  fetchUserPreferences,
  saveUserPreferences,
} from "@/lib/api";
import { getAssetCatalog, resolveAssetSymbol } from "@/lib/assetResolver";
import type { ApiTransaction } from "@/lib/api";

interface CryptoCtx {
  state: CryptoState;
  setState: (updater: (prev: CryptoState) => CryptoState) => void;
  refresh: (force?: boolean) => Promise<void>;
  rehydrateFromBackend: () => Promise<void>;
  toast: (msg: string, type?: string) => void;
  toastMsg: { msg: string; type: string } | null;
}

const fallbackCtx: CryptoCtx = {
  state: defaultState(),
  setState: () => {},
  refresh: async () => {},
  rehydrateFromBackend: async () => {},
  toast: () => {},
  toastMsg: null,
};

const Ctx = createContext<CryptoCtx>(fallbackCtx);
export { Ctx as CryptoCtxRaw };
export const useCrypto = () => useContext(Ctx);

/** Map backend ApiTransaction[] to CryptoTx[] using asset catalog */
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
        id: tx.id,
        assetId: tx.asset_id,
        ts,
        type: tx.type,
        asset: symbol,
        qty,
        price,
        total: qty * price,
        fee,
        feeAsset: tx.fee_currency || "USD",
        accountId: "acc_main",
        note: tx.note || "",
        venue: tx.venue || "",
        lots: "",
      };
    })
    .filter((tx): tx is NonNullable<typeof tx> => tx !== null);
}

export const CryptoProvider = forwardRef<HTMLDivElement, { children: React.ReactNode }>(function CryptoProvider({ children }, _ref) {
  const [state, setStateRaw] = useState<CryptoState>(loadState);
  const [toastMsg, setToast] = useState<{ msg: string; type: string } | null>(null);
  const lastHydratedUserRef = useRef<string | null>(null);

  const { isSignedIn, userId } = useAuth();

  const setState = (arg: CryptoState | ((prev: CryptoState) => CryptoState)) => {
    setStateRaw((prev) => {
      const next = typeof arg === "function" ? arg(prev) : arg;
      
      // If method changed, trigger background recalculation
      if (next.method !== prev.method && next.syncStatus === "synced") {
        console.log(`[crypto-context] Method changed from ${prev.method} to ${next.method}. Recalculating...`);
        import("@/lib/api").then(api => {
          api.recalculateAllLots(next.method).then(() => {
            rehydrateFromBackend();
          });
        });
      }

      saveState(next);
      return next;
    });
  };

  const refresh = useCallback(async (force = false) => {
    try {
      const updated = await refreshPrices(state, force);
      setState(() => updated);
      setToast({ msg: "Prices updated", type: "good" });
    } catch (e: any) {
      setToast({ msg: "Price refresh failed: " + (e.message || e), type: "bad" });
    }
  }, [state, setState]);

  const toast = useCallback((msg: string, type = "") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const rehydrateFromBackend = useCallback(async () => {
    if (!isSignedIn) return;

    setStateRaw((prev) => ({ ...prev, syncStatus: "loading" as const }));

    try {
      const [assets, transactions, importedFiles, userPrefs] = await Promise.all([
        getAssetCatalog(true),
        fetchTransactions(),
        fetchImportedFiles().catch(() => []),
        fetchUserPreferences().catch(() => ({} as Record<string, string>)),
      ]);

      const assetById = new Map(assets.map((a) => [a.id, a]));
      const canonicalTxs = mapTransactions(transactions, assetById);

      const canonicalImported = importedFiles.map((file: any) => ({
        name: file.file_name,
        hash: file.file_hash,
        importedAt: file.imported_at ? Date.parse(file.imported_at) : Date.now(),
        exchange: file.exchange,
        exportType: file.export_type,
        rowCount: Number(file.row_count || 0),
      }));

      const prefUpdates: Partial<CryptoState> = {};
      if (userPrefs.base) prefUpdates.base = userPrefs.base;
      if (userPrefs.method) prefUpdates.method = userPrefs.method;
      if (userPrefs.layout) prefUpdates.layout = userPrefs.layout;
      if (userPrefs.theme) prefUpdates.theme = userPrefs.theme;
      if (userPrefs.minImportValue) {
        prefUpdates.minImportValue = parseFloat(userPrefs.minImportValue) || 100;
      }

      setStateRaw((prev) => {
        // Guard against a "successful" read that comes back suspiciously
        // empty (e.g. a transient RLS/consistency hiccup right after a
        // write) blowing away data we already have cached locally.
        const txs = canonicalTxs.length > 0 || prev.txs.length === 0 ? canonicalTxs : prev.txs;
        const importedFilesNext = canonicalImported.length > 0 || prev.importedFiles.length === 0
          ? canonicalImported : prev.importedFiles;
        const next = {
          ...prev,
          ...prefUpdates,
          txs,
          importedFiles: importedFilesNext,
          syncStatus: "synced" as const,
          syncError: undefined,
        };
        saveState(next);
        return next;
      });
    } catch (err) {
      console.error("[crypto-context] Rehydration failed:", err);
      setStateRaw((prev) => ({
        ...prev,
        syncStatus: "error" as const,
        syncError: err instanceof Error ? err.message : "Backend unreachable",
      }));
    }
  }, [isSignedIn]);

  // Hydration effect — runs on auth identity change
  useEffect(() => {
    if (!isSignedIn || !userId) {
      if (lastHydratedUserRef.current !== null) {
        lastHydratedUserRef.current = null;
        clearBusinessCache();
        setStateRaw((prev) => ({
          ...prev,
          txs: [],
          importedFiles: [],
          syncStatus: "idle" as const,
          syncError: undefined,
        }));
      }
      return;
    }

    if (lastHydratedUserRef.current === userId) return;
    lastHydratedUserRef.current = userId;

    let cancelled = false;

    (async () => {
      setStateRaw((prev) => ({ ...prev, syncStatus: "loading" as const }));

      try {
        const [assets, transactions, importedFiles, userPrefs] = await Promise.all([
          getAssetCatalog(true),
          fetchTransactions(),
          fetchImportedFiles().catch(() => []),
          fetchUserPreferences().catch(() => ({} as Record<string, string>)),
        ]);

        if (cancelled) return;

        const assetById = new Map(assets.map((a) => [a.id, a]));
        const canonicalTxs = mapTransactions(transactions, assetById);

        const canonicalImported = importedFiles.map((file: any) => ({
          name: file.file_name,
          hash: file.file_hash,
          importedAt: file.imported_at ? Date.parse(file.imported_at) : Date.now(),
          exchange: file.exchange,
          exportType: file.export_type,
          rowCount: Number(file.row_count || 0),
        }));

        const prefUpdates: Partial<CryptoState> = {};
        if (userPrefs.base) prefUpdates.base = userPrefs.base;
        if (userPrefs.method) prefUpdates.method = userPrefs.method;
        if (userPrefs.layout) prefUpdates.layout = userPrefs.layout;
        if (userPrefs.theme) prefUpdates.theme = userPrefs.theme;
        
        if (userPrefs.watch) {
          try { prefUpdates.watch = JSON.parse(userPrefs.watch); } catch { /* ignore */ }
        }
        if (userPrefs.dashboardLayout) {
          try { prefUpdates.dashboardLayout = JSON.parse(userPrefs.dashboardLayout); } catch { /* ignore */ }
        }
        if (userPrefs.autoSyncEnabled) {
          prefUpdates.autoSyncEnabled = userPrefs.autoSyncEnabled === "true";
        }
        if (userPrefs.autoSyncInterval) {
          prefUpdates.autoSyncInterval = parseInt(userPrefs.autoSyncInterval) || 30;
        }
        if (userPrefs.minImportValue) {
          prefUpdates.minImportValue = parseFloat(userPrefs.minImportValue) || 100;
        }

        if (!cancelled) {
          setStateRaw((prev) => {
            // Guard against a "successful" read that comes back suspiciously
            // empty (e.g. a transient RLS/consistency hiccup right after a
            // write, or right after sign-in) blowing away data we already
            // have cached locally from this same account.
            const txs = canonicalTxs.length > 0 || prev.txs.length === 0 ? canonicalTxs : prev.txs;
            const importedFilesNext = canonicalImported.length > 0 || prev.importedFiles.length === 0
              ? canonicalImported : prev.importedFiles;
            const next = {
              ...prev,
              ...prefUpdates,
              txs,
              importedFiles: importedFilesNext,
              syncStatus: "synced" as const,
              syncError: undefined,
            };
            saveState(next);
            return next;
          });
        }
      } catch (err) {
        console.error("[crypto-context] Backend hydration failed:", err);
        if (!cancelled) {
          setStateRaw((prev) => ({
            ...prev,
            syncStatus: "error" as const,
            syncError: err instanceof Error ? err.message : "Backend unreachable",
          }));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [isSignedIn, userId]);

  // Sync preferences to backend when they change
  const prevPrefsRef = useRef<string>("");
  useEffect(() => {
    if (!isSignedIn) return;
    if (state.syncStatus !== "synced") return;

    const currentPrefs = JSON.stringify({
      base: state.base,
      method: state.method,
      watch: state.watch,
      layout: state.layout,
      theme: state.theme,
      dashboardLayout: state.dashboardLayout,
      autoSyncEnabled: state.autoSyncEnabled,
      autoSyncInterval: state.autoSyncInterval,
      minImportValue: state.minImportValue,
    });

    if (prevPrefsRef.current === currentPrefs) return;
    if (prevPrefsRef.current === "") {
      prevPrefsRef.current = currentPrefs;
      return;
    }

    prevPrefsRef.current = currentPrefs;

    const timer = setTimeout(() => {
      saveUserPreferences({
        base: state.base,
        method: state.method,
        watch: JSON.stringify(state.watch),
        layout: state.layout,
        theme: state.theme,
        dashboardLayout: JSON.stringify(state.dashboardLayout),
        autoSyncEnabled: String(state.autoSyncEnabled),
        autoSyncInterval: String(state.autoSyncInterval),
        minImportValue: String(state.minImportValue),
      }).catch((err) => {
        console.warn("[crypto-context] Failed to sync preferences:", err);
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [state.base, state.method, state.layout, state.theme, state.syncStatus, isSignedIn]);

  // Apply layout/theme to body
  useEffect(() => {
    document.body.setAttribute("data-layout", state.layout);
    document.body.setAttribute("data-theme", state.theme);
    const layoutFonts: Record<string, string> = {
      flux: "'Inter', sans-serif",
      cipher: "'JetBrains Mono', monospace",
      vector: "'Plus Jakarta Sans', sans-serif",
      aurora: "'Plus Jakarta Sans', sans-serif",
      carbon: "'JetBrains Mono', monospace",
      prism: "'Space Grotesk', sans-serif",
      noir: "'Inter', sans-serif",
      pulse: "'DM Sans', 'Inter', sans-serif",
    };
    document.documentElement.style.setProperty("--app-font", layoutFonts[state.layout] || "'Inter', sans-serif");
  }, [state.layout, state.theme]);

  return (
    <Ctx.Provider value={{ state, setState, refresh, rehydrateFromBackend, toast, toastMsg }}>
      {children}
    </Ctx.Provider>
  );
});

CryptoProvider.displayName = "CryptoProvider";
