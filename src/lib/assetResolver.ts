import type { ApiAsset } from "@/lib/api";
import { fetchAssets, createAsset } from "@/lib/api";
import { extractBaseFromPair, matchAssetBySymbol, normalizeSymbol } from "@/lib/symbolAliases";

const ASSET_CACHE_MS = 60_000;
let assetCache: ApiAsset[] = [];
let assetCacheTs = 0;

export async function getAssetCatalog(force = false): Promise<ApiAsset[]> {
  if (!force && assetCache.length > 0 && Date.now() - assetCacheTs < ASSET_CACHE_MS) {
    return assetCache;
  }

  const assets = await fetchAssets();
  assetCache = assets;
  assetCacheTs = Date.now();
  return assets;
}

export function resolveAssetSymbol(rawSymbol: string): string {
  const trimmed = rawSymbol.trim();
  const base = extractBaseFromPair(trimmed);
  return normalizeSymbol(base);
}

export function resolveAssetId(rawSymbol: string, assets: ApiAsset[]): { assetId: string | null; symbol: string } {
  const symbol = resolveAssetSymbol(rawSymbol);
  const assetId = matchAssetBySymbol(symbol, assets);
  return { assetId, symbol };
}

export async function resolveOrCreateAsset(rawSymbol: string): Promise<{ assetId: string; symbol: string }> {
  const symbol = resolveAssetSymbol(rawSymbol);
  const assets = await getAssetCatalog();
  const existingId = matchAssetBySymbol(symbol, assets);

  if (existingId) {
    return { assetId: existingId, symbol };
  }

  const { asset } = await createAsset({ symbol, name: symbol });
  assetCacheTs = 0; // Invalidate cache
  return { assetId: asset.id, symbol };
}
