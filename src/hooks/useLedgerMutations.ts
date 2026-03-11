/**
 * useLedgerMutations.ts
 *
 * Centralized backend-first mutation layer for all ledger operations.
 * Rules:
 * - Checks backend write readiness before any mutation
 * - Calls backend API only — never mutates local state as fallback
 * - After success, triggers canonical refresh from backend
 * - Returns structured success/error results for UI use
 */

import { useCallback, useState, useEffect, useRef } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import {
  ensureWriteReady,
  isWorkerConfigured,
  isWorkerAvailable,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  batchCreateTransactions,
  createImportedFile,
  clearAllTransactions,
  clearAllImportedFiles,
  type CreateTransactionInput,
  type BatchCreateResult,
} from "@/lib/api";
import { resolveOrCreateAsset } from "@/lib/assetResolver";

export interface MutationResult {
  success: boolean;
  error?: string;
}

export interface ImportMutationResult extends MutationResult {
  persisted: number;
  skippedDuplicates: number;
  failed: number;
}

export type WriteStatus = "checking" | "ready" | "unavailable" | "unconfigured";

export function useLedgerMutations() {
  const { rehydrateFromBackend, toast } = useCrypto();
  const [writeStatus, setWriteStatus] = useState<WriteStatus>("checking");
  const checkIntervalRef = useRef<ReturnType<typeof setInterval>>();

  // Check write readiness on mount and periodically
  const checkWriteStatus = useCallback(async () => {
    if (!isWorkerConfigured()) {
      setWriteStatus("unconfigured");
      return;
    }
    try {
      const available = await isWorkerAvailable();
      setWriteStatus(available ? "ready" : "unavailable");
    } catch {
      setWriteStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    checkWriteStatus();
    // Re-check every 15 seconds
    checkIntervalRef.current = setInterval(checkWriteStatus, 15000);
    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [checkWriteStatus]);

  /**
   * Create a manual transaction. Backend-only.
   */
  const createManualTransaction = useCallback(async (params: {
    asset: string;
    type: string;
    qty: number;
    price: number;
    fee: number;
    base: string;
    venue?: string;
    note?: string;
  }): Promise<MutationResult> => {
    try {
      await ensureWriteReady();

      const { assetId } = await resolveOrCreateAsset(params.asset);
      await createTransaction({
        asset_id: assetId,
        timestamp: new Date().toISOString(),
        type: params.type,
        qty: params.qty,
        unit_price: params.price,
        fee_amount: params.fee,
        fee_currency: params.base || "USD",
        venue: params.venue || undefined,
        note: params.note || undefined,
        source: "manual",
      });

      await rehydrateFromBackend();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Unknown error" };
    }
  }, [rehydrateFromBackend]);

  /**
   * Update an existing transaction. Backend-only.
   */
  const updateLedgerTransaction = useCallback(async (
    txId: string,
    updates: { type?: string; qty?: number; unit_price?: number; asset_id?: string },
  ): Promise<MutationResult> => {
    try {
      await ensureWriteReady();
      await updateTransaction(txId, updates);
      await rehydrateFromBackend();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Unknown error" };
    }
  }, [rehydrateFromBackend]);

  /**
   * Delete a transaction. Backend-only.
   */
  const deleteLedgerTransaction = useCallback(async (
    txId: string,
  ): Promise<MutationResult> => {
    try {
      await ensureWriteReady();
      await deleteTransaction(txId);
      await rehydrateFromBackend();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Unknown error" };
    }
  }, [rehydrateFromBackend]);

  /**
   * Commit imported transactions. Backend-only.
   * Returns detailed counts for UI display.
   */
  const commitImportedTransactions = useCallback(async (params: {
    batchPayload: CreateTransactionInput[];
    fileName: string;
    fileHash: string;
    exchange: string;
    exportType: string;
  }): Promise<ImportMutationResult> => {
    try {
      await ensureWriteReady();

      if (params.batchPayload.length === 0) {
        return { success: false, error: "No rows to import", persisted: 0, skippedDuplicates: 0, failed: 0 };
      }

      let totalCreated = 0;
      let totalSkipped = 0;
      let totalFailed = 0;

      // Batch in chunks of 500
      for (let i = 0; i < params.batchPayload.length; i += 500) {
        const result = await batchCreateTransactions(params.batchPayload.slice(i, i + 500));
        totalCreated += result.created;
        totalSkipped += result.skippedDuplicates;
        totalFailed += result.errors;
      }

      // Record imported file metadata (409 = duplicate = fine)
      try {
        await createImportedFile({
          file_name: params.fileName,
          file_hash: params.fileHash,
          exchange: params.exchange,
          export_type: params.exportType,
          row_count: totalCreated,
        });
      } catch (err: any) {
        if (!err?.message?.includes("409")) {
          console.warn("[import] file record:", err?.message);
        }
      }

      // Canonical refresh
      await rehydrateFromBackend();

      return {
        success: totalCreated > 0 || totalSkipped > 0,
        persisted: totalCreated,
        skippedDuplicates: totalSkipped,
        failed: totalFailed,
        error: totalFailed > 0 && totalCreated === 0 ? "All rows failed" : undefined,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || "Unknown error",
        persisted: 0,
        skippedDuplicates: 0,
        failed: 0,
      };
    }
  }, [rehydrateFromBackend]);

  return {
    writeStatus,
    checkWriteStatus,
    createManualTransaction,
    updateLedgerTransaction,
    deleteLedgerTransaction,
    commitImportedTransactions,
  };
}
