// Worker API base URL — STRICT: require explicit configuration
// No dangerous fallback to a hardcoded production URL

function resolveWorkerBase(raw: string | undefined): string {
  const candidate = (raw || "").trim();
  if (!candidate) return ""; // No fallback — must be explicitly configured

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return candidate.replace(/\/$/, "");
    }
  } catch {
    // Invalid URL
  }

  return "";
}

const WORKER_BASE = resolveWorkerBase(import.meta.env.VITE_WORKER_API_URL);

let tokenProvider: null | (() => Promise<string | null>) = null;

// Cache for health check results (5 second TTL)
let _healthCache: { available: boolean; ts: number } | null = null;
const HEALTH_TTL = 5000;

/**
 * Whether the Worker URL environment variable is configured.
 * This does NOT mean the worker is reachable.
 */
export function isWorkerConfigured(): boolean {
  return Boolean(WORKER_BASE);
}

/**
 * Check if the Worker is actually reachable (health endpoint).
 * Caches result for 5 seconds to avoid spamming.
 */
export async function isWorkerAvailable(): Promise<boolean> {
  if (!WORKER_BASE) return false;

  // Use cache if fresh
  if (_healthCache && Date.now() - _healthCache.ts < HEALTH_TTL) {
    return _healthCache.available;
  }

  try {
    const response = await fetch(`${WORKER_BASE}/api/status`, {
      signal: AbortSignal.timeout(5000),
    });
    const available = response.ok;
    _healthCache = { available, ts: Date.now() };
    return available;
  } catch {
    _healthCache = { available: false, ts: Date.now() };
    return false;
  }
}

/**
 * Ensure the backend is ready for write operations.
 * Throws with a user-friendly message if not.
 */
export async function ensureWriteReady(): Promise<void> {
  if (!WORKER_BASE) {
    throw new Error(
      "Backend not configured. Set VITE_WORKER_API_URL to enable data persistence."
    );
  }

  const token = await getAuthToken();
  if (!token) {
    throw new Error("Not authenticated. Please sign in to save data.");
  }

  const available = await isWorkerAvailable();
  if (!available) {
    throw new Error(
      "Backend unavailable. Your data was NOT saved. Please try again later."
    );
  }
}

export function setAuthTokenProvider(provider: () => Promise<string | null>) {
  tokenProvider = provider;
}

async function getAuthToken(): Promise<string | null> {
  if (tokenProvider) return tokenProvider();

  if (typeof window !== "undefined") {
    const maybeClerk = (window as Window & {
      Clerk?: { session?: { getToken?: () => Promise<string | null> } };
    }).Clerk;
    if (maybeClerk?.session?.getToken) {
      try {
        return await maybeClerk.session.getToken();
      } catch {
        return null;
      }
    }
  }

  return null;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  if (!WORKER_BASE) {
    throw new Error("Backend not configured (missing VITE_WORKER_API_URL)");
  }

  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const url = `${WORKER_BASE}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...((options?.headers as Record<string, string>) || {}),
      },
      signal: options?.signal ?? AbortSignal.timeout(15000),
    });
  } catch (err: any) {
    throw new Error(
      `Network error calling Worker API (${url}). Check Worker URL, deployment, and CORS ALLOWED_ORIGINS. Root: ${err?.message || "Failed to fetch"}`,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => `HTTP ${response.status}`);
    const hint = response.status === 404
      ? " (route missing — check VITE_WORKER_API_URL points to the correct backend + latest deploy)"
      : "";
    throw new Error(`Worker API ${response.status} for ${url}: ${text}${hint}`);
  }

  return response.json() as Promise<T>;
}

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
  const response = await apiFetch<{ assets: ApiAsset[] }>("/api/assets");
  return response.assets;
}

/** Auto-create a missing asset. Returns existing if symbol already exists. */
export async function createAsset(input: {
  symbol: string;
  name?: string;
  coingecko_id?: string;
  binance_symbol?: string;
}): Promise<{ asset: ApiAsset; created: boolean }> {
  return apiFetch<{ asset: ApiAsset; created: boolean }>("/api/assets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ─── Transaction operations ────────────────────────────────

export async function fetchTransactions(): Promise<ApiTransaction[]> {
  const response = await apiFetch<{ transactions: ApiTransaction[] }>("/api/transactions");
  return response.transactions;
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
}

export async function createTransaction(input: CreateTransactionInput): Promise<ApiTransaction> {
  const response = await apiFetch<{ transaction: ApiTransaction }>("/api/transactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.transaction;
}

export async function updateTransaction(
  transactionId: string,
  updates: Partial<CreateTransactionInput>,
): Promise<ApiTransaction> {
  const response = await apiFetch<{ transaction: ApiTransaction }>(`/api/transactions/${transactionId}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
  return response.transaction;
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/transactions/${transactionId}`, {
    method: "DELETE",
  });
}

export interface BatchCreateResult {
  created: number;
  skippedDuplicates: number;
  errors: number;
  errorDetails: Array<{ index: number; reason: string }>;
  transactions: ApiTransaction[];
}

export async function batchCreateTransactions(
  transactions: CreateTransactionInput[],
): Promise<BatchCreateResult> {
  const response = await apiFetch<BatchCreateResult>("/api/transactions/batch", {
    method: "POST",
    body: JSON.stringify({ transactions }),
    signal: AbortSignal.timeout(60000),
  });
  return response;
}

// ─── Price operations ──────────────────────────────────────

export async function fetchPrices(): Promise<{ prices: Record<string, ApiPriceEntry>; ts: number; stale: boolean }> {
  const response = await apiFetch<ApiPricesResponse>("/api/prices");
  return {
    prices: response.prices ?? {},
    ts: response.ts ?? Date.now(),
    stale: response.stale ?? false,
  };
}

// ─── Tracking preferences ──────────────────────────────────

export async function fetchTrackingPreference(assetId?: string): Promise<{ tracking_mode: string } | null> {
  const query = assetId ? `?asset_id=${encodeURIComponent(assetId)}` : "";
  const response = await apiFetch<{ preference: { tracking_mode: string } | null }>(`/api/tracking-preferences${query}`);
  return response.preference;
}

export async function setTrackingPreference(trackingMode: string, assetId?: string): Promise<any> {
  const response = await apiFetch<{ preference: any }>("/api/tracking-preferences", {
    method: "PUT",
    body: JSON.stringify({
      tracking_mode: trackingMode,
      asset_id: assetId ?? null,
    }),
  });
  return response.preference;
}

// ─── Imported files ────────────────────────────────────────

export async function fetchImportedFiles(): Promise<any[]> {
  const response = await apiFetch<{ files: any[] }>("/api/imported-files");
  return response.files;
}

export interface CreateImportedFileInput {
  file_name: string;
  file_hash: string;
  exchange: string;
  export_type: string;
  row_count: number;
}

export async function createImportedFile(input: CreateImportedFileInput): Promise<any> {
  const response = await apiFetch<{ file: any }>("/api/imported-files", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.file;
}

// ─── Import audit / fingerprint lookup (v2) ─────────────────

export type ImportLookupResponse = {
  existingFingerprints: Record<string, { native_id: string | null; canonical_json: string | null }>;
  existingByNativeId: Record<string, { fingerprint_hash: string; canonical_json: string | null }>;
};

export async function lookupImportRows(input: { fingerprint_hashes: string[]; native_ids: string[] }): Promise<ImportLookupResponse> {
  return apiFetch<ImportLookupResponse>("/api/import/lookup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function recordImportBatch(input: any): Promise<{ ok: boolean; batch_id: string }> {
  return apiFetch<{ ok: boolean; batch_id: string }>("/api/import/record", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ─── User preferences ─────────────────────────────────────

export async function fetchUserPreferences(): Promise<Record<string, string>> {
  const response = await apiFetch<{ preferences: Record<string, string> }>("/api/preferences");
  return response.preferences;
}

export async function saveUserPreferences(prefs: Record<string, string>): Promise<void> {
  await apiFetch<{ ok: boolean }>("/api/preferences", {
    method: "PUT",
    body: JSON.stringify(prefs),
  });
}

// ─── Clear all data ───────────────────────────────────────

export async function clearAllTransactions(): Promise<{ deleted: number }> {
  return apiFetch<{ ok: boolean; deleted: number }>("/api/transactions/all", {
    method: "DELETE",
  });
}

export async function clearAllImportedFiles(): Promise<{ deleted: number }> {
  return apiFetch<{ ok: boolean; deleted: number }>("/api/imported-files/all", {
    method: "DELETE",
  });
}
