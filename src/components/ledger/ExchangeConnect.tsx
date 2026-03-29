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

const AUTO_SYNC_KEY = "exchange_auto_sync";
const AUTO_SYNC_INTERVAL_KEY = "exchange_auto_sync_interval";

// Exchange Connect requires backend migration to Supabase Edge Functions
// For now, show a placeholder message
async function apiFetch(_path: string, _options: RequestInit = {}) {
  throw new Error("Exchange sync backend not yet migrated to Supabase");
}

export default function ExchangeConnect() {
  const { rehydrateFromBackend, toast } = useCrypto();
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
  const [syncResult, setSyncResult] = useState<{ ok: boolean; synced: number; skipped: number } | null>(null);

  // Sync All state
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState<{ current: number; total: number; exchange: string } | null>(null);
  const [syncAllResults, setSyncAllResults] = useState<{ exchange: string; synced: number; skipped: number; error?: string }[]>([]);

  // Auto-sync state
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(() => localStorage.getItem(AUTO_SYNC_KEY) === "true");
  const [autoSyncInterval, setAutoSyncInterval] = useState(() => parseInt(localStorage.getItem(AUTO_SYNC_INTERVAL_KEY) || "30"));
  const autoSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lastAutoSync, setLastAutoSync] = useState<Date | null>(null);
  const [nextAutoSync, setNextAutoSync] = useState<Date | null>(null);

  const loadConnections = useCallback(async () => {
    if (!isWorkerConfigured()) { setLoading(false); return; }
    try {
      const res = await apiFetch("/api/exchange-sync");
      if (res.ok) {
        const data = await res.json();
        setConnections((data as any).connections || []);
      }
    } catch {}
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
      const res = await apiFetch("/api/exchange-sync", {
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
      const res = await apiFetch(`/api/exchange-sync/test/${exId}`, { method: "POST" });
      const data = await res.json() as any;
      setTestResult({ ok: data.ok, message: data.message || data.error || "Unknown" });
      if (data.ok) toast(`${exId}: ${data.message}`, "good");
      else toast(`${exId}: ${data.error}`, "bad");
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.message || "Test failed" });
      toast("Connection test failed", "bad");
    }
    setTesting(null);
  };

  const syncExchange = async (exId: string, silent = false) => {
    if (!silent) setSyncing(exId);
    setSyncResult(null);
    try {
      const res = await apiFetch(`/api/exchange-sync/sync/${exId}`, { method: "POST" });
      const data = await res.json() as any;
      if (data.ok) {
        if (!silent) {
          setSyncResult({ ok: true, synced: data.synced, skipped: data.skipped });
          toast(`Synced ${data.synced} trades from ${exId} (${data.skipped} skipped)`, "good");
        }
        return { ok: true, synced: data.synced || 0, skipped: data.skipped || 0 };
      } else {
        if (!silent) {
          setSyncResult({ ok: false, synced: 0, skipped: 0 });
          toast(data.error || "Sync failed", "bad");
        }
        return { ok: false, synced: 0, skipped: 0, error: data.error || "Sync failed" };
      }
    } catch (err: any) {
      if (!silent) toast(err?.message || "Sync failed", "bad");
      return { ok: false, synced: 0, skipped: 0, error: err?.message || "Network error" };
    } finally {
      if (!silent) setSyncing(null);
    }
  };

  // Sync All
  const syncAll = async () => {
    if (connectedExchanges.length === 0) return;
    setSyncingAll(true);
    setSyncAllResults([]);
    const results: typeof syncAllResults = [];

    for (let i = 0; i < connectedExchanges.length; i++) {
      const exId = connectedExchanges[i];
      setSyncAllProgress({ current: i + 1, total: connectedExchanges.length, exchange: exId });
      const result = await syncExchange(exId, true);
      results.push({ exchange: exId, synced: result.synced, skipped: result.skipped, error: result.error });
      setSyncAllResults([...results]);
    }

    const totalSynced = results.reduce((s, r) => s + r.synced, 0);
    const totalErrors = results.filter(r => r.error).length;
    if (totalErrors === 0) {
      toast(`✓ All exchanges synced — ${totalSynced} new trades`, "good");
    } else {
      toast(`Synced with ${totalErrors} error(s) — ${totalSynced} new trades`, "bad");
    }

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
    setAutoSyncEnabled(enabled);
    localStorage.setItem(AUTO_SYNC_KEY, String(enabled));
  };

  const changeAutoSyncInterval = (mins: number) => {
    setAutoSyncInterval(mins);
    localStorage.setItem(AUTO_SYNC_INTERVAL_KEY, String(mins));
  };

  const deleteConnection = async (exId: string) => {
    if (!confirm(`Disconnect ${exId}? This won't delete imported trades.`)) return;
    try {
      await apiFetch(`/api/exchange-sync/${exId}`, { method: "DELETE" });
      toast("Disconnected ✓", "good");
      await loadConnections();
    } catch {}
  };

  if (!isWorkerConfigured()) {
    return (
      <div className="panel">
        <div className="panel-body" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔗</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Backend Required</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Exchange API connections require the Cloudflare Worker backend to be deployed and configured.
          </div>
        </div>
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
            {syncingAll ? "⏳" : "🔄"} {syncingAll ? "Syncing All…" : `Sync All (${connectedExchanges.length})`}
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

      {/* Sync All results */}
      {syncAllResults.length > 0 && !syncingAll && (
        <div className="card" style={{
          padding: "8px 12px", border: "1px solid var(--line)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Sync Results</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {syncAllResults.map(r => (
              <div key={r.exchange} style={{
                display: "flex", alignItems: "center", gap: 8, fontSize: 11,
              }}>
                <span style={{ fontWeight: 700, minWidth: 70 }}>
                  {EXCHANGES.find(e => e.id === r.exchange)?.icon} {r.exchange}
                </span>
                {r.error ? (
                  <span style={{ color: "var(--bad)" }}>⚠ {r.error}</span>
                ) : (
                  <span style={{ color: "var(--good)" }}>
                    ✓ {r.synced} synced, {r.skipped} skipped
                  </span>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => setSyncAllResults([])}
            style={{
              marginTop: 6, fontSize: 9, padding: "2px 8px", borderRadius: 4,
              background: "none", border: "1px solid var(--line)", color: "var(--muted)",
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Exchange Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 8,
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
                  {conn?.last_sync ? `Last sync: ${new Date(conn.last_sync + 'Z').toLocaleDateString()}` : "Never synced"}
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
                    style={{ fontSize: 10, padding: "4px 10px", background: "var(--brand)", color: "#fff", border: "none", borderRadius: 6 }}>
                    {isSyncing ? "⏳ Syncing…" : "🔄 Sync"}
                  </button>
                  <button className="btn secondary" onClick={() => testConnection(ex.id)} disabled={isTesting}
                    style={{ fontSize: 10, padding: "4px 10px" }}>
                    {isTesting ? "Testing…" : "Test"}
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

      {syncResult && (
        <div style={{
          padding: "8px 12px", borderRadius: "var(--lt-radius-sm)", fontSize: 12,
          background: syncResult.ok ? "rgba(22,163,74,.08)" : "rgba(220,38,38,.08)",
          border: `1px solid ${syncResult.ok ? "rgba(22,163,74,.25)" : "rgba(220,38,38,.25)"}`,
          color: syncResult.ok ? "var(--good)" : "var(--bad)",
        }}>
          {syncResult.ok ? `✓ Synced ${syncResult.synced} trades (${syncResult.skipped} duplicates skipped)` : "⚠ Sync failed"}
        </div>
      )}

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
    </div>
  );
}
