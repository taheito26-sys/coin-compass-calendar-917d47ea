/**
 * api.ts — Supabase-backed data layer
 * Replaces all Cloudflare Worker API calls with direct Supabase client operations.
 * RLS enforces ownership — no manual user_id filtering needed on reads.
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Compatibility flags ───────────────────────────────────
// These exist so callers that used to check Worker status still compile.

export function isWorkerConfigured(): boolean {
  return true; // Always "configured" — Supabase is always available
}

export async function isWorkerAvailable(): Promise<boolean> {
  return true;
}

export async function ensureWriteReady(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Not authenticated. Please sign in to save data.");
  }
}

// Deprecated — no-op for Supabase
export function setAuthTokenProvider(_provider: () => Promise<string | null>) {}

// ─── Types ─────────────────────────────────────────────────

export interface ApiAsset {
  id: string;
  symbol: string;
  name: string;
  category: string;
  coingecko_id: string | null;
  binance_symbol: string | null;
  precision_qty: number;
  precision_price: number;
}

export interface ApiTransaction {
  id: string;
  user_id: string;
  asset_id: string;
  timestamp: string;
  type: string;
  qty: number;
  unit_price: number;
  fee_amount: number;
  fee_currency: string;
  venue: string | null;
  note: string | null;
  tags: string | null;
  source: string;
  external_id: string | null;
  fingerprint_hash?: string;
}

export interface DetailedImportCounts {
  parsed: number;
  accepted: number;
  rejected: number;
  persisted: number;
  skippedDuplicate: number;
  failed: number;
}

export interface ApiPriceEntry {
  price: number;
  change_1h: number | null;
  change_24h: number | null;
  change_7d: number | null;
  market_cap: number | null;
  volume_24h: number | null;
  ts: number;
}

export interface ApiPricesResponse {
  prices: Record<string, ApiPriceEntry> | null;
  ts?: number;
  stale?: boolean;
}

// ─── Asset operations ──────────────────────────────────────

export async function fetchAssets(): Promise<ApiAsset[]> {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .order("symbol");
  if (error) throw new Error(`fetchAssets: ${error.message}`);
  return (data || []).map((a) => ({
    id: a.id,
    symbol: a.symbol,
    name: a.name,
    category: a.category || "other",
    coingecko_id: a.coingecko_id,
    binance_symbol: a.binance_symbol,
    precision_qty: a.precision_qty ?? 8,
    precision_price: a.precision_price ?? 8,
  }));
}

export async function createAsset(input: {
  symbol: string;
  name?: string;
  coingecko_id?: string;
  binance_symbol?: string;
}): Promise<{ asset: ApiAsset; created: boolean }> {
  // Check if exists first
  const { data: existing } = await supabase
    .from("assets")
    .select("*")
    .eq("symbol", input.symbol.toUpperCase())
    .maybeSingle();

  if (existing) {
    return {
      asset: {
        id: existing.id,
        symbol: existing.symbol,
        name: existing.name,
        category: existing.category || "other",
        coingecko_id: existing.coingecko_id,
        binance_symbol: existing.binance_symbol,
        precision_qty: existing.precision_qty ?? 8,
        precision_price: existing.precision_price ?? 8,
      },
      created: false,
    };
  }

  const { data, error } = await supabase
    .from("assets")
    .insert({
      symbol: input.symbol.toUpperCase(),
      name: input.name || input.symbol.toUpperCase(),
      coingecko_id: input.coingecko_id || null,
      binance_symbol: input.binance_symbol || null,
    })
    .select()
    .single();

  if (error) throw new Error(`createAsset: ${error.message}`);
  return {
    asset: {
      id: data.id,
      symbol: data.symbol,
      name: data.name,
      category: data.category || "other",
      coingecko_id: data.coingecko_id,
      binance_symbol: data.binance_symbol,
      precision_qty: data.precision_qty ?? 8,
      precision_price: data.precision_price ?? 8,
    },
    created: true,
  };
}

// ─── Transaction operations ────────────────────────────────

export async function fetchTransactions(): Promise<ApiTransaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("timestamp", { ascending: true });
  if (error) throw new Error(`fetchTransactions: ${error.message}`);
  return (data || []).map((tx) => ({
    id: tx.id,
    user_id: tx.user_id,
    asset_id: tx.asset_id,
    timestamp: tx.timestamp,
    type: tx.type,
    qty: Number(tx.qty),
    unit_price: Number(tx.unit_price),
    fee_amount: Number(tx.fee_amount),
    fee_currency: tx.fee_currency || "USD",
    venue: tx.venue,
    note: tx.note,
    tags: tx.tags ? JSON.stringify(tx.tags) : null,
    source: tx.source || "manual",
    external_id: tx.external_id,
  }));
}

export interface CreateTransactionInput {
  asset_id: string;
  timestamp: string;
  type: string;
  qty: number;
  unit_price: number;
  fee_amount?: number;
  fee_currency?: string;
  venue?: string;
  note?: string;
  tags?: string[];
  source?: string;
  external_id?: string;
  fingerprint_hash?: string;
}

export async function createTransaction(input: CreateTransactionInput): Promise<ApiTransaction> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      asset_id: input.asset_id,
      timestamp: input.timestamp,
      type: input.type,
      qty: input.qty,
      unit_price: input.unit_price,
      fee_amount: input.fee_amount ?? 0,
      fee_currency: input.fee_currency ?? "USD",
      venue: input.venue ?? null,
      note: input.note ?? null,
      tags: input.tags ?? null,
      source: input.source ?? "manual",
      external_id: input.external_id ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`createTransaction: ${error.message}`);
  return {
    id: data.id,
    user_id: data.user_id,
    asset_id: data.asset_id,
    timestamp: data.timestamp,
    type: data.type,
    qty: Number(data.qty),
    unit_price: Number(data.unit_price),
    fee_amount: Number(data.fee_amount),
    fee_currency: data.fee_currency || "USD",
    venue: data.venue,
    note: data.note,
    tags: data.tags ? JSON.stringify(data.tags) : null,
    source: data.source || "manual",
    external_id: data.external_id,
  };
}

export async function updateTransaction(
  transactionId: string,
  updates: Partial<CreateTransactionInput>,
): Promise<ApiTransaction> {
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.type !== undefined) updateData.type = updates.type;
  if (updates.qty !== undefined) updateData.qty = updates.qty;
  if (updates.unit_price !== undefined) updateData.unit_price = updates.unit_price;
  if (updates.asset_id !== undefined) updateData.asset_id = updates.asset_id;
  if (updates.fee_amount !== undefined) updateData.fee_amount = updates.fee_amount;
  if (updates.fee_currency !== undefined) updateData.fee_currency = updates.fee_currency;
  if (updates.venue !== undefined) updateData.venue = updates.venue;
  if (updates.note !== undefined) updateData.note = updates.note;
  if (updates.timestamp !== undefined) updateData.timestamp = updates.timestamp;

  const { data, error } = await supabase
    .from("transactions")
    .update(updateData)
    .eq("id", transactionId)
    .select()
    .single();

  if (error) throw new Error(`updateTransaction: ${error.message}`);
  return {
    id: data.id,
    user_id: data.user_id,
    asset_id: data.asset_id,
    timestamp: data.timestamp,
    type: data.type,
    qty: Number(data.qty),
    unit_price: Number(data.unit_price),
    fee_amount: Number(data.fee_amount),
    fee_currency: data.fee_currency || "USD",
    venue: data.venue,
    note: data.note,
    tags: data.tags ? JSON.stringify(data.tags) : null,
    source: data.source || "manual",
    external_id: data.external_id,
  };
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  // Pre-emptively clear fingerprints linked to this transaction to avoid dangling references
  // if ON DELETE CASCADE is not available or not yet applied in migrations
  await supabase
    .from("import_row_fingerprints")
    .delete()
    .eq("transaction_id", transactionId);

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId);
  if (error) throw new Error(`deleteTransaction: ${error.message}`);
}

export interface BatchCreateResult {
  created: number;
  skippedDuplicates: number;
  errors: number;
  errorDetails: Array<{ index: number; reason: string }>;
  transactions: ApiTransaction[];
  firstError?: string;
}

export async function batchCreateTransactions(
  transactions: CreateTransactionInput[],
): Promise<BatchCreateResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  let created = 0;
  let skippedDuplicates = 0;
  let errors = 0;
  const errorDetails: Array<{ index: number; reason: string }> = [];
  const createdTxs: ApiTransaction[] = [];
  let firstError: string | undefined;

  for (let i = 0; i < transactions.length; i++) {
    const input = transactions[i];
    try {
      const { data, error } = await supabase
        .from("transactions")
        .insert({
          user_id: user.id,
          asset_id: input.asset_id,
          timestamp: input.timestamp,
          type: input.type,
          qty: input.qty,
          unit_price: input.unit_price,
          fee_amount: input.fee_amount ?? 0,
          fee_currency: input.fee_currency ?? "USD",
          venue: input.venue ?? null,
          note: input.note ?? null,
          tags: input.tags ?? null,
          source: input.source ?? "import",
          external_id: input.external_id ?? null,
          fingerprint_hash: input.fingerprint_hash ?? null,
        })
        .select()
        .single();

      if (error) {
        // Code 23505 is the Postgres standard for unique_violation
        const isDupe = error.code === "23505" || 
                       error.message.toLowerCase().includes("duplicate") || 
                       error.message.toLowerCase().includes("unique") ||
                       error.message.toLowerCase().includes("already exists");

        if (isDupe) {
          skippedDuplicates++;
          // Still record the fingerprint audit log if it's missing (failsafe)
          if (input.fingerprint_hash) {
            await supabase.from("import_row_fingerprints").upsert({
              user_id: user.id,
              fingerprint_hash: input.fingerprint_hash,
              native_id: input.external_id || null,
              source_exchange: input.venue || null,
            }, { onConflict: "user_id,fingerprint_hash" });
          }
        } else {
          errors++;
          errorDetails.push({ index: i, reason: `${error.code ? `[${error.code}] ` : ""}${error.message}` });
          if (!firstError) {
            firstError = error.message;
          }
        }
      } else if (data) {
        created++;
        createdTxs.push({
          id: data.id,
          user_id: data.user_id,
          asset_id: data.asset_id,
          timestamp: data.timestamp,
          type: data.type,
          qty: Number(data.qty),
          unit_price: Number(data.unit_price),
          fee_amount: Number(data.fee_amount),
          fee_currency: data.fee_currency || "USD",
          venue: data.venue,
          note: data.note,
          tags: data.tags ? JSON.stringify(data.tags) : null,
          source: data.source || "import",
          external_id: data.external_id,
          fingerprint_hash: data.fingerprint_hash,
        });

        // Record fingerprint audit log
        if (input.fingerprint_hash) {
          await supabase.from("import_row_fingerprints").upsert({
            user_id: user.id,
            fingerprint_hash: input.fingerprint_hash,
            native_id: input.external_id || null,
            transaction_id: data.id,
          }, { onConflict: "user_id,fingerprint_hash" });
        }
      }
    } catch (err: any) {
      errors++;
      errorDetails.push({ index: i, reason: err?.message || "Unknown" });
      if (!firstError) {
        firstError = err?.message;
      }
    }
  }

  return {
    created,
    skippedDuplicates,
    errors,
    errorDetails,
    transactions: createdTxs,
    firstError,
  };
}

// ─── Price operations ──────────────────────────────────────

export async function fetchPrices(): Promise<{ prices: Record<string, ApiPriceEntry>; ts: number; stale: boolean }> {
  const { data, error } = await supabase
    .from("price_cache")
    .select("*");

  if (error) throw new Error(`fetchPrices: ${error.message}`);

  const prices: Record<string, ApiPriceEntry> = {};
  let latestTs = 0;

  for (const row of data || []) {
    prices[row.asset_id] = {
      price: Number(row.price),
      change_1h: row.price_change_1h != null ? Number(row.price_change_1h) : null,
      change_24h: row.price_change_24h != null ? Number(row.price_change_24h) : null,
      change_7d: row.price_change_7d != null ? Number(row.price_change_7d) : null,
      market_cap: row.market_cap != null ? Number(row.market_cap) : null,
      volume_24h: row.volume_24h != null ? Number(row.volume_24h) : null,
      ts: row.timestamp ? new Date(row.timestamp).getTime() : Date.now(),
    };
    const rowTs = row.timestamp ? new Date(row.timestamp).getTime() : 0;
    if (rowTs > latestTs) latestTs = rowTs;
  }

  const ageMs = latestTs > 0 ? Date.now() - latestTs : Infinity;
  return { prices, ts: latestTs || Date.now(), stale: ageMs > 600_000 };
}

// ─── Tracking preferences ──────────────────────────────────

export async function fetchTrackingPreference(assetId?: string): Promise<{ tracking_mode: string } | null> {
  let query = supabase.from("tracking_preferences").select("*");
  if (assetId) {
    query = query.eq("asset_id", assetId);
  }
  const { data } = await query.maybeSingle();
  return data ? { tracking_mode: data.tracking_mode } : null;
}

export async function setTrackingPreference(trackingMode: string, assetId?: string): Promise<any> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("tracking_preferences")
    .upsert({
      user_id: user.id,
      asset_id: assetId ?? null,
      tracking_mode: trackingMode,
    }, { onConflict: "user_id,asset_id" })
    .select()
    .single();

  if (error) throw new Error(`setTrackingPreference: ${error.message}`);
  return data;
}

// ─── Imported files ────────────────────────────────────────

export async function fetchImportedFiles(): Promise<any[]> {
  const { data, error } = await supabase
    .from("imported_files")
    .select("*")
    .order("imported_at", { ascending: false });
  if (error) throw new Error(`fetchImportedFiles: ${error.message}`);
  return data || [];
}

export interface CreateImportedFileInput {
  file_name: string;
  file_hash: string;
  exchange: string;
  export_type: string;
  row_count: number;
}

export async function createImportedFile(input: CreateImportedFileInput): Promise<any> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("imported_files")
    .insert({
      user_id: user.id,
      file_name: input.file_name,
      file_hash: input.file_hash,
      exchange: input.exchange,
      export_type: input.export_type,
      row_count: input.row_count,
    })
    .select()
    .single();

  if (error) throw new Error(`createImportedFile: ${error.message}`);
  return data;
}

// ─── Import audit / fingerprint lookup (v2) ─────────────────

export type ImportLookupResponse = {
  existingFingerprints: Record<string, { native_id: string | null; canonical_json: string | null }>;
  existingByNativeId: Record<string, { fingerprint_hash: string; canonical_json: string | null }>;
};

export async function lookupImportRows(input: { fingerprint_hashes: string[]; native_ids: string[] }): Promise<ImportLookupResponse> {
  const result: ImportLookupResponse = {
    existingFingerprints: {},
    existingByNativeId: {},
  };

  if (input.fingerprint_hashes.length > 0) {
    const { data } = await supabase
      .from("import_row_fingerprints")
      .select("fingerprint_hash, native_id, canonical_json")
      .in("fingerprint_hash", input.fingerprint_hashes);

    for (const row of data || []) {
      result.existingFingerprints[row.fingerprint_hash] = {
        native_id: row.native_id,
        canonical_json: row.canonical_json,
      };
    }
  }

  if (input.native_ids.length > 0) {
    const { data } = await supabase
      .from("import_row_fingerprints")
      .select("native_id, fingerprint_hash, canonical_json")
      .in("native_id", input.native_ids);

    for (const row of data || []) {
      if (row.native_id) {
        result.existingByNativeId[row.native_id] = {
          fingerprint_hash: row.fingerprint_hash,
          canonical_json: row.canonical_json,
        };
      }
    }
  }

  return result;
}

/** Check if this specific file content was already successfully imported. */
export async function checkFileImported(contentHash: string): Promise<boolean> {
  if (!contentHash) return false;
  const { data } = await supabase
    .from("import_batches")
    .select("id")
    .eq("content_hash", contentHash)
    .maybeSingle();
  return !!data;
}

export async function recordImportBatch(input: any): Promise<{ ok: boolean; batch_id: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      user_id: user.id,
      file_name: input.file_name,
      file_hash: input.file_hash,
      content_hash: input.content_hash,
      source_exchange: input.source_exchange,
      source_export_type: input.source_export_type,
      parsed_count: input.parsed_count ?? 0,
      accepted_new_count: input.accepted_new_count ?? 0,
      already_imported_count: input.already_imported_count ?? 0,
      warning_count: input.warning_count ?? 0,
      invalid_count: input.invalid_count ?? 0,
      conflict_count: input.conflict_count ?? 0,
      persisted_count: input.persisted_count ?? 0,
      failed_count: input.failed_count ?? 0,
    })
    .select()
    .single();

  if (error) throw new Error(`recordImportBatch: ${error.message}`);
  return { ok: true, batch_id: data.id };
}

// ─── User preferences ─────────────────────────────────────

export async function fetchUserPreferences(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("key, value");

  if (error) throw new Error(`fetchUserPreferences: ${error.message}`);
  const prefs: Record<string, string> = {};
  for (const row of data || []) {
    prefs[row.key] = row.value;
  }
  return prefs;
}

export async function saveUserPreferences(prefs: Record<string, string>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const rows = Object.entries(prefs).map(([key, value]) => ({
    user_id: user.id,
    key,
    value,
  }));

  for (const row of rows) {
    const { error } = await supabase
      .from("user_preferences")
      .upsert(row, { onConflict: "user_id,key" });
    if (error) console.warn(`saveUserPreferences(${row.key}):`, error.message);
  }
}

// ─── Clear all data ───────────────────────────────────────

export async function clearAllTransactions(): Promise<{ deleted: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", user.id)
    .select("id");

  if (error) throw new Error(`clearAllTransactions: ${error.message}`);
  
  // Handled by CASCADE if Postgres triggers work, but we ensure here for safety
  await supabase
    .from("import_row_fingerprints")
    .delete()
    .eq("user_id", user.id);

  return { deleted: data?.length ?? 0 };
}

export async function clearAllImportedFiles(): Promise<{ deleted: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("imported_files")
    .delete()
    .eq("user_id", user.id)
    .select("id");

  if (error) throw new Error(`clearAllImportedFiles: ${error.message}`);
  
  // Clear related import status tracking
  await supabase
    .from("import_batches")
    .delete()
    .eq("user_id", user.id);

  return { deleted: data?.length ?? 0 };
}
