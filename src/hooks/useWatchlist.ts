import { useCallback } from "react";
import { useCrypto } from "@/lib/cryptoContext";

/** Manage the user's favorite-coin watchlist (state.watch), synced to the backend like any other preference. */
export function useWatchlist() {
  const { state, setState } = useCrypto();
  const watch = state.watch || [];

  const isWatched = useCallback((sym: string) => {
    return watch.includes(sym.toUpperCase());
  }, [watch]);

  const addToWatch = useCallback((sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    setState(prev => prev.watch.includes(s) ? prev : { ...prev, watch: [...prev.watch, s] });
  }, [setState]);

  const removeFromWatch = useCallback((sym: string) => {
    const s = sym.toUpperCase();
    setState(prev => ({ ...prev, watch: prev.watch.filter(w => w !== s) }));
  }, [setState]);

  const toggleWatch = useCallback((sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    setState(prev => prev.watch.includes(s)
      ? { ...prev, watch: prev.watch.filter(w => w !== s) }
      : { ...prev, watch: [...prev.watch, s] });
  }, [setState]);

  return { watch, isWatched, addToWatch, removeFromWatch, toggleWatch };
}
