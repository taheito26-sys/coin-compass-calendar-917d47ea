/**
 * ImpersonatedCryptoProvider — renders a CryptoProvider-compatible context
 * that loads a specific user's data (transactions, preferences, imported files)
 * so that downstream page components render identically to what that user sees.
 *
 * Admin-only: relies on admin RLS policies to read other users' data.
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { CryptoState, loadState, defaultState, saveState } from "@/lib/cryptoState";
import {
  fetchImportedFiles,
  fetchTransactions,
  fetchUserPreferences,
} from "@/lib/api";
import { getAssetCatalog, resolveAssetSymbol } from "@/lib/assetResolver";
import type { ApiTransaction } from "@/lib/api";

// We re-use the same context shape as CryptoProvider so all downstream hooks work
interface CryptoCtx {
  state: CryptoState;
  setState: (updater: (prev: CryptoState) => CryptoState) => void;
  refresh: (force?: boolean) => Promise<void>;
  rehydrateFromBackend: () => Promise<void>;
  toast: (msg: string, type?: string) => void;
  toastMsg: { msg: string; type: string } | null;
}

// Import the real context from cryptoContext — we need to provide to the SAME context
// so useCrypto() picks it up
import { useCrypto } from "@/lib/cryptoContext";

// We need the actual context object. Since it's not exported, we'll create our own provider
// that wraps children and injects into the same context.
// Actually, useCrypto uses useContext(Ctx) where Ctx is module-private.
// So we need to re-export a wrapper. Let's use a different approach:
// We'll create a component that overrides the crypto context by providing a NEW context provider
// using React's context override pattern.

// The cleanest way: we replicate the context creation here and provide it.
// But useCrypto() reads from the original Ctx. So we need to patch at the source.

// SOLUTION: Export the context from cryptoContext.tsx and use it here.
// For now, let's take a simpler approach: we'll modify cryptoContext to export Ctx.

// ALTERNATIVE: Create a wrapper component that uses the existing CryptoProvider's setState
// to inject the target user's data. This is hacky but works.

// BEST APPROACH: Export the Ctx from cryptoContext and provide it here.

// We'll do that. First, let's define the mapping function here (same as in cryptoContext):
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

export { mapTransactions };
