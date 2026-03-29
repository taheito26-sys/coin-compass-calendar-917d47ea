import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/supabaseAuth";
import {
  fetchAssets,
  fetchPrices,
  fetchTransactions,
  type ApiAsset,
  type ApiPriceEntry,
  type ApiTransaction,
} from "@/lib/api";

export interface Position {
  assetId: string;
  symbol: string;
  name: string;
  category: string;
  qty: number;
  cost: number;
  avg: number;
  price: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  priceChange7d: number | null;
  marketCap: number | null;
  volume24h: number | null;
  mv: number | null;
  pnlAbs: number | null;
  pnlPct: number | null;
}

export interface PortfolioData {
  positions: Position[];
  totalMV: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number;
  assetCount: number;
  txCount: number;
  priceAge: string;
  loading: boolean;
  error: string | null;
  authenticated: boolean;
  workerOnline: boolean;
  refresh: () => Promise<void>;
}

function buildPositions(
  assets: ApiAsset[],
  txs: ApiTransaction[],
  prices: Record<string, ApiPriceEntry>,
): Position[] {
  const assetMap = new Map<string, ApiAsset>();
  for (const asset of assets) assetMap.set(asset.id, asset);

  const positionMap = new Map<string, { qty: number; cost: number }>();

  for (const tx of txs) {
    const current = positionMap.get(tx.asset_id) || { qty: 0, cost: 0 };
    const txTotal = tx.qty * tx.unit_price;

    switch (tx.type) {
      case "buy":
      case "transfer_in":
      case "reward":
        current.qty += tx.qty;
        current.cost += txTotal + tx.fee_amount;
        break;
      case "sell":
      case "transfer_out":
        if (current.qty > 0) {
          const avgCost = current.cost / current.qty;
          const soldQty = Math.min(tx.qty, current.qty);
          current.qty -= soldQty;
          current.cost -= avgCost * soldQty;
        }
        break;
      case "fee":
        current.cost += tx.fee_amount;
        break;
      default:
        break;
    }

    if (current.qty < 0.00000001) {
      current.qty = 0;
      current.cost = 0;
    }

    positionMap.set(tx.asset_id, current);
  }

  const result: Position[] = [];

  for (const [assetId, position] of positionMap) {
    if (position.qty <= 0) continue;

    const asset = assetMap.get(assetId);
    if (!asset) continue;

    const priceData = prices[assetId];
    const price = priceData?.price ?? null;
    const mv = price !== null ? price * position.qty : null;
    const pnlAbs = mv !== null ? mv - position.cost : null;
    const pnlPct = position.cost > 0 && pnlAbs !== null ? (pnlAbs / position.cost) * 100 : null;

    result.push({
      assetId,
      symbol: asset.symbol,
      name: asset.name,
      category: asset.category || "other",
      qty: position.qty,
      cost: position.cost,
      avg: position.qty > 0 ? position.cost / position.qty : 0,
      price,
      priceChange1h: priceData?.change_1h ?? null,
      priceChange24h: priceData?.change_24h ?? null,
      priceChange7d: priceData?.change_7d ?? null,
      marketCap: priceData?.market_cap ?? null,
      volume24h: priceData?.volume_24h ?? null,
      mv,
      pnlAbs,
      pnlPct,
    });
  }

  result.sort((a, b) => (b.mv ?? 0) - (a.mv ?? 0));
  return result;
}

const PRICE_POLL_MS = 120000;

export function usePortfolio(): PortfolioData {
  const { isLoaded, isSignedIn } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [txCount, setTxCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceTs, setPriceTs] = useState(0);

  const assetsRef = useRef<ApiAsset[]>([]);
  const txsRef = useRef<ApiTransaction[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!isSignedIn) {
        assetsRef.current = [];
        txsRef.current = [];
        setPositions([]);
        setTxCount(0);
        setPriceTs(0);
        setLoading(false);
        return;
      }

      const [assets, txs, priceData] = await Promise.all([
        fetchAssets(),
        fetchTransactions(),
        fetchPrices(),
      ]);

      assetsRef.current = assets;
      txsRef.current = txs;
      setTxCount(txs.length);
      setPriceTs(priceData.ts);
      setPositions(buildPositions(assets, txs, priceData.prices));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load portfolio";
      console.error("Portfolio load error:", err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  const refreshPricesOnly = useCallback(async () => {
    if (!isSignedIn || assetsRef.current.length === 0) return;
    try {
      const priceData = await fetchPrices();
      setPriceTs(priceData.ts);
      setPositions(buildPositions(assetsRef.current, txsRef.current, priceData.prices));
    } catch (err) {
      console.warn("Price refresh failed:", err instanceof Error ? err.message : err);
    }
  }, [isSignedIn]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isSignedIn) return undefined;
    const timer = window.setInterval(() => void refreshPricesOnly(), PRICE_POLL_MS);
    return () => clearInterval(timer);
  }, [isSignedIn, refreshPricesOnly]);

  const derived = useMemo(() => {
    const totalMV = positions.reduce((sum, p) => sum + (p.mv ?? 0), 0);
    const totalCost = positions.reduce((sum, p) => sum + p.cost, 0);
    const totalPnl = totalMV - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    let priceAge = "-";
    if (priceTs > 0) {
      const ageMs = Date.now() - priceTs;
      priceAge = ageMs < 60000 ? `${Math.round(ageMs / 1000)}s` : `${Math.round(ageMs / 60000)}m`;
    }

    return { totalMV, totalCost, totalPnl, totalPnlPct, priceAge };
  }, [positions, priceTs]);

  return {
    positions,
    ...derived,
    assetCount: positions.length,
    txCount,
    priceAge: derived.priceAge,
    loading: !isLoaded || loading,
    error,
    authenticated: Boolean(isSignedIn),
    workerOnline: true, // Always true with Supabase
    refresh: loadData,
  };
}
