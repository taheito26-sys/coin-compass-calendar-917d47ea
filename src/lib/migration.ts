/**
 * migration.ts — Legacy localStorage migration (now uses Supabase)
 */
import type { CryptoTx, ImportedFile } from "./cryptoState";
import { hasLegacyData, markMigrationComplete } from "./cryptoState";
import {
  batchCreateTransactions,
  createImportedFile,
  type CreateTransactionInput,
} from "@/lib/api";
import { getAssetCatalog, resolveAssetId, resolveAssetSymbol } from "@/lib/assetResolver";

export interface MigrationResult {
  migrated: boolean;
  txsMigrated: number;
  txsSkippedDuplicate: number;
  txsFailed: number;
  filesMigrated: number;
  errors: string[];
}

export async function runMigration(): Promise<MigrationResult | null> {
  const legacy = hasLegacyData();
  if (!legacy) return null;

  const result: MigrationResult = {
    migrated: false, txsMigrated: 0, txsSkippedDuplicate: 0,
    txsFailed: 0, filesMigrated: 0, errors: [],
  };

  try {
    const assets = await getAssetCatalog(true);
    const txInputs: CreateTransactionInput[] = [];

    for (const tx of legacy.txs) {
      const symbol = resolveAssetSymbol(tx.asset || "");
      if (!symbol) { result.txsFailed++; continue; }
      const { assetId } = resolveAssetId(symbol, assets);
      if (!assetId) { result.txsFailed++; continue; }
      const ts = Number(tx.ts);
      if (!Number.isFinite(ts) || ts <= 0) { result.txsFailed++; continue; }

      txInputs.push({
        asset_id: assetId,
        timestamp: new Date(ts).toISOString(),
        type: tx.type || "buy",
        qty: Math.abs(Number(tx.qty) || 0),
        unit_price: Number(tx.price) || 0,
        fee_amount: Number(tx.fee) || 0,
        fee_currency: tx.feeAsset || "USD",
        note: tx.note || "Migrated from local storage",
        source: "migration",
        external_id: `migration:${tx.id || `${ts}:${symbol}:${tx.type}:${tx.qty}:${tx.price}`}`,
      });
    }

    if (txInputs.length > 0) {
      for (let i = 0; i < txInputs.length; i += 500) {
        try {
          const batchResult = await batchCreateTransactions(txInputs.slice(i, i + 500));
          result.txsMigrated += batchResult.created;
          result.txsSkippedDuplicate += batchResult.skippedDuplicates;
          result.txsFailed += batchResult.errors;
        } catch (err: any) {
          result.txsFailed += Math.min(500, txInputs.length - i);
        }
      }
    }

    for (const file of legacy.importedFiles) {
      try {
        await createImportedFile({
          file_name: file.name, file_hash: file.hash,
          exchange: file.exchange, export_type: file.exportType, row_count: file.rowCount,
        });
        result.filesMigrated++;
      } catch { result.filesMigrated++; }
    }

    markMigrationComplete();
    result.migrated = true;
    return result;
  } catch (err: any) {
    result.errors.push(`Migration error: ${err.message}`);
    return result;
  }
}
