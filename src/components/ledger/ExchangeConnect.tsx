import { useState, useEffect, useCallback, useRef } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { supabase } from "@/integrations/supabase/client";

interface ExchangeDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  needsPassphrase?: boolean;
  docsUrl: string;
  features: string[];
  instructions: string[];
}

const EXCHANGES: ExchangeDef[] = [
  {
    id: "binance", name: "Binance", icon: "🟡", color: "#f0b90b",
    docsUrl: "https://www.binance.com/en/my/settings/api-management",
    features: ["Spot Trades"],
    instructions: [
      "Go to API Management in your Binance account",
      "Create a new API key → choose 'System generated'",
      "Enable only 'Enable Reading' permission",
      "Copy the API Key and Secret Key below",
    ],
  },
  {
    id: "bybit", name: "Bybit", icon: "🟠", color: "#f7a600",
    docsUrl: "https://www.bybit.com/app/user/api-management",
    features: ["Spot Trades"],
    instructions: [
      "Go to API → API Management in Bybit",
      "Create a new key with 'Read-Only' permissions",
      "Select 'Spot' under API Permissions",
      "Copy the API Key and Secret below",
    ],
  },
  {
    id: "okx", name: "OKX", icon: "⚪", color: "#fff", needsPassphrase: true,
    docsUrl: "https://www.okx.com/account/my-api",
    features: ["Spot Trades"],
    instructions: [
      "Go to Account → API in OKX",
      "Create a new key with 'Read' permissions only",
      "Set a passphrase (you'll need it below)",
      "Copy the API Key, Secret Key, and Passphrase",
    ],
  },
  {
    id: "gate", name: "Gate.io", icon: "🔵", color: "#2354e6",
    docsUrl: "https://www.gate.io/myaccount/apikeys",
    features: ["Spot Trades"],
    instructions: [
      "Go to API Management in Gate.io",
      "Create a key with 'Spot Read' permission",
      "Copy the API Key and Secret below",
    ],
  },
  {
    id: "coinbase", name: "Coinbase", icon: "🔷", color: "#0052ff",
    docsUrl: "https://www.coinbase.com/settings/api",
    features: ["Buys & Sells"],
    instructions: [
      "Go to Settings → API access in Coinbase",
      "Create a new API key",
      "Select 'wallet:buys:read' and 'wallet:sells:read' scopes",
      "Copy the API Key and Secret below",
    ],
  },
  {
    id: "kraken", name: "Kraken", icon: "🟣", color: "#5741d9",
    docsUrl: "https://www.kraken.com/u/settings/api",
    features: ["Spot Trades"],
    instructions: [
      "Go to Settings → API in Kraken",
      "Create a key with 'Query Closed Orders & Trades' permission",
      "Copy the API Key and Private Key (Base64 secret)",
    ],
  },
];

interface Connection {
  id: string;
  exchange: string;
  label: string | null;
  status: string;
  last_sync: string | null;
  sync_count: number;
}

interface SyncOptions {
  period: number;
  types: string[];
  preview: boolean;
  coins: string[];
}

const AUTO_SYNC_KEY = "exchange_auto_sync";
const AUTO_SYNC_INTERVAL_KEY = "exchange_auto_sync_interval";

import { apiFetch } from "@/lib/api";

export default function ExchangeConnect() {
  const { state, setState, rehydrateFromBackend, toast } = useCrypto();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  
  // High-fidelity sync results tracking
  const [syncResults, setSyncResults] = useState<Record<string, { 
    ok: boolean; 
    synced: number; 
    skipped: number; 
    error?: string;
    stats?: any;
  }>>({});

  // Global Sync Options
  const [syncOptions, setSyncOptions] = useState<SyncOptions>({
    period: 90,
    types: ["buy", "sell", "transfer_in", "transfer_out"],
    preview: false,
    coins: [],
  });
  const [showAdvanced, setShowAdvanced] = useState<string | null>(null); // exchangeId
  const [previewData, setPreviewData] = useState<any[] | null>(null);

  // Auto-sync local state for timer management
  const autoSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lastAutoSync, setLastAutoSync] = useState<Date | null>(null);
  const [nextAutoSync, setNextAutoSync] = useState<Date | null>(null);

  const autoSyncEnabled = state.autoSyncEnabled;
  const autoSyncInterval = state.autoSyncInterval;

  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState<{ current: number; total: number; exchange: string } | null>(null);
  const [syncAllResults, setSyncAllResults] = useState<{ exchange: string; synced: number; skipped: number; error?: string }[]>([]);

  const loadConnections = useCallback(async () => {
    try {
      const res = await apiFetch("");
      if (res.ok) {
        const data = await res.json();
        setConnections((data as any).connections || []);
      }
    } catch (err) {
      console.warn("[ExchangeConnect] Failed to load connections:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const connectedExchanges = connections.map(c => c.exchange);
  const isConnected = (exId: string) => connections.some(c => c.exchange === exId);
  const getConnection = (exId: string) => connections.find(c => c.exchange === exId);

  const saveConnection = async () => {
    if (!selectedExchange || !apiKey || !apiSecret) return;
    setSaving(true);
    setTestResult(null);
    try {
      const res = await apiFetch("", {
        method: "POST",
        body: JSON.stringify({
          exchange: selectedExchange,
          api_key: apiKey,
          api_secret: apiSecret,
          passphrase: passphrase || undefined,
        }),
      });
      if (res.ok) {
        toast("Connection saved ✓", "good");
        setApiKey(""); setApiSecret(""); setPassphrase("");
        setSelectedExchange(null);
        await loadConnections();
      } else {
        const err = await res.json().catch(() => ({}));
        toast((err as any)?.error || "Failed to save", "bad");
      }
    } catch (err: any) {
      toast(err?.message || "Network error", "bad");
    }
    setSaving(false);
  };

  const testConnection = async (exId: string) => {
    setTesting(exId);
    setTestResult(null);
    try {
      const res = await apiFetch(`/test/${exId}`, { method: "POST" });
      const data = await res.json() as any;
      setTestResult({ ok: data.ok, message: data.message || data.error || "Unknown" });
      if (data.ok) toast(`${exId}: ${data.message}`, "good");
      else toast(`${exId}: ${data.error || data.message}`, "bad");
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.message || "Test failed" });
      toast("Connection test failed", "bad");
    }
    setTesting(null);
  };

  const syncExchange = async (exId: string, silent = false, customOptions?: SyncOptions) => {
    if (!silent) setSyncing(exId);
    setPreviewData(null);
    
    const options = customOptions || syncOptions;

    try {
      const res = await apiFetch(`/sync/${exId}`, { 
        method: "POST",
        body: JSON.stringify(options),
      });
      const data = await res.json() as any;
      if (data.ok) {
        const result = { 
          ok: true, 
          synced: data.synced, 
          skipped: data.skipped,
          stats: data.stats
        };
        
        setSyncResults(prev => ({ ...prev, [exId]: result }));

        if (!silent) {
          if (options.preview) {
             setPreviewData(data.previewData || []);
             toast(`${exId}: Previewed ${data.synced} potential trades`, "good");
          } else {
            toast(`Synced ${data.synced} trades from ${exId}`, "good");
          }
        }
        return result;
      } else {
        const errResult = { ok: false, synced: 0, skipped: 0, error: data.error || "Sync failed" };
        setSyncResults(prev => ({ ...prev, [exId]: errResult }));
        if (!silent) toast(data.error || "Sync failed", "bad");
        return errResult;
      }
    } catch (err: any) {
      const netErr = { ok: false, synced: 0, skipped: 0, error: err?.message || "Network error" };
      setSyncResults(prev => ({ ...prev, [exId]: netErr }));
      if (!silent) toast(err?.message || "Sync failed", "bad");
      return netErr;
    } finally {
      if (!silent) setSyncing(null);
    }
  };

  // Sync All
  const syncAll = async () => {
    if (connectedExchanges.length === 0) return;
    setSyncingAll(true);
    setSyncResults({}); // Reset for new bulk run

    for (let i = 0; i < connectedExchanges.length; i++) {
      const exId = connectedExchanges[i];
      setSyncAllProgress({ current: i + 1, total: connectedExchanges.length, exchange: exId });
      await syncExchange(exId, true);
    }

    toast(`✓ Bulk sync completed`, "good");

    await rehydrateFromBackend();
    await loadConnections();
    setSyncingAll(false);
    setSyncAllProgress(null);
    setLastAutoSync(new Date());
  };

  // Auto-sync
  useEffect(() => {
    if (autoSyncTimerRef.current) clearInterval(autoSyncTimerRef.current);

    if (autoSyncEnabled && connectedExchanges.length > 0) {
      const ms = autoSyncInterval * 60 * 1000;
      setNextAutoSync(new Date(Date.now() + ms));

      autoSyncTimerRef.current = setInterval(() => {
        syncAll();
        setNextAutoSync(new Date(Date.now() + ms));
      }, ms);
    } else {
      setNextAutoSync(null);
    }

    return () => {
      if (autoSyncTimerRef.current) clearInterval(autoSyncTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncEnabled, autoSyncInterval, connectedExchanges.length]);

  const toggleAutoSync = (enabled: boolean) => {
    setState(prev => ({ ...prev, autoSyncEnabled: enabled }));
  };

  const changeAutoSyncInterval = (mins: number) => {
    setState(prev => ({ ...prev, autoSyncInterval: mins }));
  };

  const deleteConnection = async (exId: string) => {
    if (!confirm(`Disconnect ${exId}? This won't delete imported trades.`)) return;
    try {
      await apiFetch(`/${exId}`, { method: "DELETE" });
      toast("Disconnected ✓", "good");
      await loadConnections();
    } catch {}
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 12 }}>
        Loading connections…
      </div>
    );
  }

  const activeDef = EXCHANGES.find(e => e.id === selectedExchange);
  const hasConnections = connectedExchanges.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Security banner */}
      <div className="card" style={{
        padding: "10px 14px",
        background: "linear-gradient(135deg, var(--brand3), transparent)",
        border: "1px solid var(--brand3)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 18 }}>🔒</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Read-Only API Keys</div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>
            Only read permissions are used. Your funds are safe. Keys are stored securely on the backend.
          </div>
        </div>
      </div>

      {/* Sync All + Auto-sync controls */}
      {hasConnections && (
        <div className="card" style={{
          padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          border: "1px solid var(--line)",
        }}>
          {/* Sync All */}
          <button
            className="btn"
            onClick={syncAll}
            disabled={syncingAll}
            style={{
              background: "var(--brand)", color: "#fff", border: "none",
              borderRadius: 6, fontSize: 11, padding: "6px 14px",
              fontWeight: 700, display: "flex", alignItems: "center", gap: 5,
            }}
          >
            {syncingAll ? (
              <span className="syncing-icon">🔄</span>
            ) : (
              <span>🔄</span>
            )} 
            {syncingAll ? "Syncing All…" : `Sync All (${connectedExchanges.length})`}
          </button>

          {/* Sync All progress bar */}
          {syncAllProgress && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 100, height: 6, borderRadius: 3,
                background: "var(--panel2)", overflow: "hidden",
              }}>
                <div style={{
                  width: `${(syncAllProgress.current / syncAllProgress.total) * 100}%`,
                  height: "100%", background: "var(--brand)",
                  borderRadius: 3, transition: "width .3s",
                }} />
              </div>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>
                {syncAllProgress.current}/{syncAllProgress.total} — {syncAllProgress.exchange}
              </span>
            </div>
          )}

          <div style={{ flex: 1 }} />

          {/* Auto-sync toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>Auto-sync</span>
            <button
              onClick={() => toggleAutoSync(!autoSyncEnabled)}
              style={{
                width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer",
                background: autoSyncEnabled ? "var(--good)" : "var(--panel2)",
                position: "relative", transition: "background .2s",
              }}
            >
              <span style={{
                position: "absolute", top: 2,
                left: autoSyncEnabled ? 18 : 2,
                width: 16, height: 16, borderRadius: "50%",
                background: "#fff", transition: "left .2s",
                boxShadow: "0 1px 3px rgba(0,0,0,.2)",
              }} />
            </button>
            {autoSyncEnabled && (
              <select
                value={autoSyncInterval}
                onChange={e => changeAutoSyncInterval(Number(e.target.value))}
                style={{
                  fontSize: 10, padding: "2px 6px", borderRadius: 4,
                  background: "var(--input)", border: "1px solid var(--line)",
                  color: "var(--text)", cursor: "pointer",
                }}
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
              </select>
            )}
          </div>

          {/* Status text */}
          {(lastAutoSync || nextAutoSync) && (
            <div style={{ width: "100%", fontSize: 9, color: "var(--muted)", marginTop: 2 }}>
              {lastAutoSync && <span>Last synced: {lastAutoSync.toLocaleTimeString()}</span>}
              {lastAutoSync && nextAutoSync && <span> · </span>}
              {nextAutoSync && autoSyncEnabled && <span>Next: {nextAutoSync.toLocaleTimeString()}</span>}
            </div>
          )}
        </div>
      )}

      {/* Sync Results Dash (Persistent until dismissed) */}
      {Object.keys(syncResults).length > 0 && (
        <div className="card" style={{
          padding: "12px 16px", border: "1px solid var(--line)",
          background: "var(--panel)", boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
             Sync Results
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(syncResults).map(([exId, r]) => {
              const def = EXCHANGES.find(e => e.id === exId);
              return (
                <div key={exId} style={{
                  display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                }}>
                  <span style={{ 
                    width: 14, height: 14, borderRadius: "50%", 
                    background: r.error ? "var(--bad)" : r.ok ? "var(--good)" : "var(--warn)",
                    boxShadow: `0 0 8px ${r.error ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.4)"}`
                  }} />
                  <span style={{ fontWeight: 700, minWidth: 80, display: "flex", alignItems: "center", gap: 6 }}>
                     {def?.name}
                  </span>
                  
                  {r.error ? (
                    <span style={{ color: "var(--bad)", display: "flex", alignItems: "center", gap: 4 }}>
                      ⚠️ {r.error}
                    </span>
                  ) : (
                    <span style={{ color: "var(--good)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700 }}>✓ {r.synced} synced</span>
                      <span style={{ color: "var(--muted)", fontSize: 11 }}>
                        ({r.skipped} skipped{r.stats?.duplicateTrades ? `, ${r.stats.duplicateTrades} duplicates` : ""})
                      </span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => setSyncResults({})}
              className="btn secondary"
              style={{ fontSize: 10, padding: "4px 12px", height: "auto" }}
            >
              Dismiss Results
            </button>
          </div>
        </div>
      )}

      {/* Exchange Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 12,
      }}>
        {EXCHANGES.map(ex => {
          const conn = getConnection(ex.id);
          const connected = !!conn;
          const isSyncing = syncing === ex.id || (syncingAll && syncAllProgress?.exchange === ex.id);
          const isTesting = testing === ex.id;

          return (
            <div key={ex.id} className="card" style={{
              padding: 14, cursor: connected ? "default" : "pointer",
              border: selectedExchange === ex.id ? "2px solid var(--brand)" : connected ? "1px solid var(--good)" : "1px solid var(--line)",
              transition: "all .15s", opacity: isSyncing ? 0.7 : 1,
            }}
              onClick={() => {
                if (!connected) setSelectedExchange(selectedExchange === ex.id ? null : ex.id);
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 22 }}>{ex.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{ex.name}</div>
                  <div style={{
                    fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                    background: connected ? "rgba(22,163,74,.12)" : "var(--panel2)",
                    color: connected ? "var(--good)" : "var(--muted)",
                    display: "inline-block", textTransform: "uppercase",
                  }}>
                    {conn?.status === 'error' ? '⚠ ERROR' : connected ? "CONNECTED" : "NOT CONNECTED"}
                  </div>
                </div>
              </div>

              {connected && (
                <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>
                  {conn?.last_sync ? `Last sync: ${new Date(conn.last_sync).toLocaleDateString()}` : "Never synced"}
                  {conn?.sync_count ? ` · ${conn.sync_count} trades` : ""}
                </div>
              )}

              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {ex.features.map(f => (
                  <span key={f} style={{
                    fontSize: 9, padding: "1px 5px", borderRadius: 3,
                    background: "var(--panel2)", color: "var(--muted)",
                  }}>{f}</span>
                ))}
              </div>

              {connected && (
                <div style={{ display: "flex", gap: 4, marginTop: 8 }} onClick={e => e.stopPropagation()}>
                  <button className="btn" onClick={() => syncExchange(ex.id)} disabled={!!syncing || syncingAll}
                    style={{ fontSize: 10, padding: "4px 10px", background: "var(--brand)", color: "#fff", border: "none", borderRadius: 6, display: "flex", alignItems: "center", gap: 4 }}>
                    {isSyncing ? (
                      <>
                        <span className="syncing-icon" style={{ fontSize: 12 }}>🔄</span>
                        Syncing…
                      </>
                    ) : (
                      <>
                        <span>🔄</span>
                        Sync
                      </>
                    )}
                  </button>
                  <button className="btn secondary" onClick={() => setShowAdvanced(ex.id)}
                    style={{ fontSize: 10, padding: "4px 10px" }}>
                    ⚙️
                  </button>
                  <button className="btn secondary" onClick={() => testConnection(ex.id)} disabled={isTesting}
                    style={{ fontSize: 10, padding: "4px 8px", flex: 1 }}>
                    {isTesting ? "…" : "Test"}
                  </button>
                  <button onClick={() => deleteConnection(ex.id)}
                    style={{ fontSize: 10, padding: "4px 8px", background: "none", border: "1px solid var(--line)", borderRadius: 6, color: "var(--bad)", cursor: "pointer" }}>
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Test/Sync result banners */}
      {testResult && (
        <div style={{
          padding: "8px 12px", borderRadius: "var(--lt-radius-sm)", fontSize: 12,
          background: testResult.ok ? "rgba(22,163,74,.08)" : "rgba(220,38,38,.08)",
          border: `1px solid ${testResult.ok ? "rgba(22,163,74,.25)" : "rgba(220,38,38,.25)"}`,
          color: testResult.ok ? "var(--good)" : "var(--bad)",
        }}>
          {testResult.ok ? "✓" : "⚠"} {testResult.message}
        </div>
      )}

      {/* Form Area */}

      {/* Connect Form */}
      {activeDef && !isConnected(activeDef.id) && (
        <div className="panel">
          <div className="panel-head">
            <h2>{activeDef.icon} Connect {activeDef.name}</h2>
            <button className="btn secondary" style={{ fontSize: 10 }} onClick={() => setSelectedExchange(null)}>✕ Close</button>
          </div>
          <div className="panel-body">
            <div style={{
              marginBottom: 14, padding: 12, background: "var(--panel2)",
              borderRadius: "var(--lt-radius-sm)", border: "1px solid var(--line)",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Setup Instructions:</div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                {activeDef.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              <a href={activeDef.docsUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-block", marginTop: 8, fontSize: 10, color: "var(--brand)", textDecoration: "underline" }}>
                Open {activeDef.name} API management →
              </a>
            </div>

            <div style={{ display: "grid", gap: 10, maxWidth: 400 }}>
              <div className="form-field">
                <label className="form-label">API Key</label>
                <input className="inp" type="text" placeholder="Paste your API key…" value={apiKey}
                  onChange={e => setApiKey(e.target.value)} autoComplete="off" />
              </div>
              <div className="form-field">
                <label className="form-label">API Secret</label>
                <input className="inp" type="password" placeholder="Paste your API secret…" value={apiSecret}
                  onChange={e => setApiSecret(e.target.value)} autoComplete="off" />
              </div>
              {activeDef.needsPassphrase && (
                <div className="form-field">
                  <label className="form-label">Passphrase</label>
                  <input className="inp" type="password" placeholder="OKX passphrase…" value={passphrase}
                    onChange={e => setPassphrase(e.target.value)} autoComplete="off" />
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
              <button className="btn" onClick={saveConnection}
                disabled={saving || !apiKey || !apiSecret || (activeDef.needsPassphrase && !passphrase)}
                style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 6 }}>
                {saving ? "Saving…" : `🔗 Connect ${activeDef.name}`}
              </button>
            </div>

            <div style={{
              marginTop: 12, padding: "8px 12px", background: "var(--panel2)",
              borderRadius: 6, fontSize: 10, color: "var(--muted)",
            }}>
              ⚠️ <strong>Important:</strong> Only enable <em>Read-Only</em> permissions. Never enable withdrawal permissions. Keys are stored on the backend and never exposed to the browser.
            </div>
          </div>
        </div>
      )}
      {/* Advanced Sync Modal */}
      {showAdvanced && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          padding: 20,
        }}>
          <div className="panel" style={{ width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto" }}>
            <div className="panel-head">
              <h2>⚙️ Advanced Sync: {showAdvanced}</h2>
              <button className="btn secondary" onClick={() => setShowAdvanced(null)}>✕</button>
            </div>
            <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label className="form-label">Scan History (Period)</label>
                  <select
                    className="inp"
                    value={syncOptions.period}
                    onChange={e => setSyncOptions({ ...syncOptions, period: parseInt(e.target.value) })}
                  >
                    <option value={30}>Last 30 Days</option>
                    <option value={90}>Last 90 Days (Recommended)</option>
                    <option value={365}>Last 365 Days (Deep Scan)</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Default Execution</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button 
                      className={`btn ${!syncOptions.preview ? "" : "secondary"}`}
                      style={{ flex: 1, padding: "4px", fontSize: 11 }}
                      onClick={() => setSyncOptions({ ...syncOptions, preview: false })}
                    >Import Directly</button>
                    <button 
                      className={`btn ${syncOptions.preview ? "" : "secondary"}`}
                      style={{ flex: 1, padding: "4px", fontSize: 11 }}
                      onClick={() => setSyncOptions({ ...syncOptions, preview: true })}
                    >Preview First</button>
                  </div>
                </div>
              </div>

              <div>
                <label className="form-label">Operation Types to Ingest</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  {["buy", "sell", "transfer_in", "transfer_out"].map(type => (
                    <label key={type} style={{
                      display: "flex", alignItems: "center", gap: 6, fontSize: 11,
                      padding: "4px 10px", background: "var(--panel2)", borderRadius: 6,
                      border: `1px solid ${syncOptions.types.includes(type) ? "var(--brand)" : "var(--line)"}`,
                      cursor: "pointer",
                    }}>
                      <input 
                        type="checkbox"
                        checked={syncOptions.types.includes(type)}
                        onChange={e => {
                          const next = e.target.checked 
                            ? [...syncOptions.types, type]
                            : syncOptions.types.filter(t => t !== type);
                          setSyncOptions({ ...syncOptions, types: next });
                        }}
                      />
                      {type.replace("_", " ").toUpperCase()}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button
                  className="btn"
                  style={{ flex: 1, background: "var(--brand)", color: "#fff" }}
                  onClick={() => {
                    syncExchange(showAdvanced);
                    if (!syncOptions.preview) setShowAdvanced(null);
                  }}
                >
                  🚀 Run Sync Now
                </button>
                <button className="btn secondary" onClick={() => setShowAdvanced(null)}>Close</button>
              </div>

              {previewData && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "var(--good)" }}>
                    🔍 Preview Results ({previewData.length} operations detected)
                  </div>
                  <div className="tableWrap" style={{ maxHeight: 300, overflowY: "auto" }}>
                    <table style={{ fontSize: 10 }}>
                      <thead>
                        <tr>
                          <th>TIME</th><th>TYPE</th><th>ASSET</th><th>QTY</th><th>PRICE</th><th>EVENT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.slice(0, 50).map((p, idx) => (
                          <tr key={idx}>
                            <td>{new Date(p.timestamp).toLocaleDateString()}</td>
                            <td style={{ color: p.side.includes("buy") || p.side.includes("in") ? "var(--good)" : "var(--bad)" }}>{p.side.toUpperCase()}</td>
                            <td><strong>{p.symbol}</strong></td>
                            <td>{fmtQty(p.qty)}</td>
                            <td>${fmtPx(p.price)}</td>
                            <td>{p.compaction_metadata?.number_of_fills_merged > 1 ? `Compacted from ${p.compaction_metadata.number_of_fills_merged} fills` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>
                    * This is a dry run. Nothing has been added to your database yet. Run without 'Preview' to commit.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Low-fi helpers for fmt
function fmtQty(v: number) {
  if (v < 0.0001) return v.toFixed(8);
  if (v < 1) return v.toFixed(5);
  return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
function fmtPx(v: number) {
  if (v < 1) return v.toFixed(6);
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
