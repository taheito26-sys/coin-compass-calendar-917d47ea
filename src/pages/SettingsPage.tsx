import { forwardRef, useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { uid, fmtPx } from "@/lib/cryptoState";
import { cryptoDerived } from "@/lib/cryptoState";
import { supabase } from "@/integrations/supabase/client";
import { repairMultiplierTransactions } from "@/lib/api";

// ── Layout & theme metadata ───────────────────────────────────────────────

const LAYOUTS = [
  { id: "flux",   name: "Flux",   desc: "Modern SaaS",    font: "Inter",              dark: false },
  { id: "cipher", name: "Cipher", desc: "Dark Terminal",  font: "JetBrains Mono",     dark: true  },
  { id: "vector", name: "Vector", desc: "Corporate",      font: "Plus Jakarta Sans",  dark: false },
  { id: "aurora", name: "Aurora", desc: "Gradient SaaS",  font: "Plus Jakarta Sans",  dark: false },
  { id: "carbon", name: "Carbon", desc: "Dark Monitor",   font: "JetBrains Mono",     dark: true  },
  { id: "prism",  name: "Prism",  desc: "Bold Fintech",   font: "Space Grotesk",      dark: false },
  { id: "noir",   name: "Noir",   desc: "Luxury Dark",    font: "Inter",              dark: true  },
  { id: "pulse",  name: "Pulse",  desc: "Neon Crypto",    font: "DM Sans",            dark: true  },
];

interface ThemeColors {
  brand: string; brand2: string; bg: string; panel: string;
  text: string; good: string; bad: string; muted: string;
  line: string;
}

const TC: Record<string, Record<string, ThemeColors>> = {
  flux: {
    t1: { brand:"#4f46e5", brand2:"#7c3aed", bg:"#f8faff", panel:"#ffffff", text:"#0f172a", good:"#16a34a", bad:"#dc2626", muted:"#64748b", line:"#e2e8f0" },
    t2: { brand:"#0d9488", brand2:"#059669", bg:"#f0fdf9", panel:"#ffffff", text:"#0f2922", good:"#15803d", bad:"#dc2626", muted:"#4d7c6f", line:"#d1e8e0" },
    t3: { brand:"#e11d48", brand2:"#db2777", bg:"#fff1f5", panel:"#ffffff", text:"#2d0014", good:"#15803d", bad:"#b91c1c", muted:"#8b3560", line:"#f5d0dc" },
    t4: { brand:"#d97706", brand2:"#b45309", bg:"#fffbf0", panel:"#ffffff", text:"#1c1400", good:"#15803d", bad:"#dc2626", muted:"#78600a", line:"#f0e0c0" },
    t5: { brand:"#334155", brand2:"#1e293b", bg:"#f8fafc", panel:"#ffffff", text:"#0f172a", good:"#15803d", bad:"#dc2626", muted:"#475569", line:"#e2e8f0" },
  },
  cipher: {
    t1: { brand:"#00ff64", brand2:"#00cc50", bg:"#000000", panel:"#0a0a0a", text:"#e0ffd4", good:"#00ff64", bad:"#ff4040", muted:"#5a8c50", line:"#1a2a18" },
    t2: { brand:"#0096ff", brand2:"#0064cc", bg:"#000b1a", panel:"#001428", text:"#b8d8ff", good:"#00d4aa", bad:"#ff4455", muted:"#4a7fa8", line:"#0a2540" },
    t3: { brand:"#aa44ff", brand2:"#8800ee", bg:"#0d0015", panel:"#150022", text:"#e8ccff", good:"#44ff88", bad:"#ff4466", muted:"#7a4aa0", line:"#2a0048" },
    t4: { brand:"#ff8c00", brand2:"#ff6600", bg:"#1a0800", panel:"#260c00", text:"#ffd4a0", good:"#44ff88", bad:"#ff3300", muted:"#a06030", line:"#402000" },
    t5: { brand:"#6478ff", brand2:"#4455ee", bg:"#0a0a14", panel:"#10101e", text:"#c8d0ff", good:"#44ffaa", bad:"#ff5566", muted:"#5a60a0", line:"#202038" },
  },
  vector: {
    t1: { brand:"#1363df", brand2:"#0a4cbc", bg:"#f0f4f8", panel:"#ffffff", text:"#1a2b3d", good:"#0d7e38", bad:"#c0392b", muted:"#4a6076", line:"#d0d8e0" },
    t2: { brand:"#0f62fe", brand2:"#0043ce", bg:"#f4f4f4", panel:"#ffffff", text:"#161616", good:"#198038", bad:"#da1e28", muted:"#525252", line:"#d0d0d0" },
    t3: { brand:"#2d6a00", brand2:"#1a4800", bg:"#f5f5f0", panel:"#ffffff", text:"#1e1e14", good:"#2d6a00", bad:"#c42b1c", muted:"#5a5a3a", line:"#d8d8c8" },
    t4: { brand:"#7c3aed", brand2:"#5b21b6", bg:"#fafafa", panel:"#ffffff", text:"#18181b", good:"#15803d", bad:"#be123c", muted:"#71717a", line:"#d8d8d8" },
    t5: { brand:"#ea580c", brand2:"#c2410c", bg:"#fff9f5", panel:"#ffffff", text:"#1c0a00", good:"#15803d", bad:"#dc2626", muted:"#804020", line:"#f0d8c8" },
  },
  aurora: {
    t1: { brand:"#5b21b6", brand2:"#4c1d95", bg:"#f5f4ff", panel:"#ffffff", text:"#1a1040", good:"#059669", bad:"#dc2626", muted:"#5b4f8f", line:"#d8d0f0" },
    t2: { brand:"#059669", brand2:"#047857", bg:"#f0fdf7", panel:"#ffffff", text:"#0a2418", good:"#16a34a", bad:"#dc2626", muted:"#2d6a52", line:"#c0e8d8" },
    t3: { brand:"#e84226", brand2:"#c93119", bg:"#fff5f2", panel:"#ffffff", text:"#3d0c00", good:"#059669", bad:"#b91c1c", muted:"#8b3120", line:"#f0d0c8" },
    t4: { brand:"#9333ea", brand2:"#7e22ce", bg:"#fdf4ff", panel:"#ffffff", text:"#2e0040", good:"#059669", bad:"#dc2626", muted:"#7c2d8a", line:"#e8c8f0" },
    t5: { brand:"#0284c7", brand2:"#0369a1", bg:"#f0f8ff", panel:"#ffffff", text:"#062040", good:"#059669", bad:"#dc2626", muted:"#1a5080", line:"#c0d8f0" },
  },
  carbon: {
    t1: { brand:"#f59e0b", brand2:"#d97706", bg:"#0e0d0b", panel:"#161410", text:"#f5e8c0", good:"#4ade80", bad:"#f87171", muted:"#8c7a50", line:"#2a2820" },
    t2: { brand:"#22d3ee", brand2:"#06b6d4", bg:"#070d10", panel:"#0e1520", text:"#b8e8f8", good:"#4ade80", bad:"#f87171", muted:"#3a7090", line:"#1a2a3e" },
    t3: { brand:"#84cc16", brand2:"#65a30d", bg:"#060c04", panel:"#0c1408", text:"#c8f0a8", good:"#4ade80", bad:"#f87171", muted:"#406830", line:"#1a2814" },
    t4: { brand:"#ec4899", brand2:"#db2777", bg:"#0d050c", panel:"#180c18", text:"#f8c8f0", good:"#4ade80", bad:"#f87171", muted:"#7a3870", line:"#2c162c" },
    t5: { brand:"#f97316", brand2:"#ea580c", bg:"#0e0800", panel:"#171008", text:"#f8d8a0", good:"#4ade80", bad:"#f87171", muted:"#8c5020", line:"#2c1e0e" },
  },
  prism: {
    t1: { brand:"#1c2a8c", brand2:"#3b4ec8", bg:"#f4f6ff", panel:"#ffffff", text:"#0c1240", good:"#166534", bad:"#991b1b", muted:"#303c80", line:"#d0d8f0" },
    t2: { brand:"#991b1b", brand2:"#dc2626", bg:"#fff5f5", panel:"#ffffff", text:"#200808", good:"#166534", bad:"#7f1d1d", muted:"#7a1818", line:"#f0d0d0" },
    t3: { brand:"#14532d", brand2:"#166534", bg:"#f3f8f2", panel:"#ffffff", text:"#0a1e08", good:"#14532d", bad:"#991b1b", muted:"#1e5018", line:"#c8e0c0" },
    t4: { brand:"#a16207", brand2:"#ca8a04", bg:"#fffbeb", panel:"#ffffff", text:"#1c0e00", good:"#166534", bad:"#991b1b", muted:"#6a4c00", line:"#f0e0b0" },
    t5: { brand:"#0f172a", brand2:"#1e293b", bg:"#f8fafc", panel:"#ffffff", text:"#0f172a", good:"#166534", bad:"#991b1b", muted:"#334155", line:"#d8e0e8" },
  },
  noir: {
    t1: { brand:"#d4af37", brand2:"#b8960c", bg:"#0a0800", panel:"#111006", text:"#f5e8c0", good:"#4ade80", bad:"#f87171", muted:"#706840", line:"#222010" },
    t2: { brand:"#90adc4", brand2:"#7090a8", bg:"#0a0c0e", panel:"#131618", text:"#dce8f0", good:"#4ade80", bad:"#f87171", muted:"#60788a", line:"#252a30" },
    t3: { brand:"#e04040", brand2:"#c02828", bg:"#0c0404", panel:"#160808", text:"#f0d0d0", good:"#4ade80", bad:"#f87171", muted:"#704040", line:"#2a1414" },
    t4: { brand:"#2563eb", brand2:"#1d4ed8", bg:"#040810", panel:"#080e1a", text:"#c8d8f8", good:"#4ade80", bad:"#f87171", muted:"#284878", line:"#161e30" },
    t5: { brand:"#16a34a", brand2:"#15803d", bg:"#020c06", panel:"#081408", text:"#c0f0d0", good:"#4ade80", bad:"#f87171", muted:"#286040", line:"#142818" },
  },
  pulse: {
    t1: { brand:"#27e0a3", brand2:"#2bb8ff", bg:"#071018", panel:"#0b141f", text:"#edf6ff", good:"#27e0a3", bad:"#ff627e", muted:"#8aa0b7", line:"#1a2a3a" },
    t2: { brand:"#8b7bff", brand2:"#6e5cff", bg:"#090b16", panel:"#0f101e", text:"#f3f4ff", good:"#3fe0a5", bad:"#ff627e", muted:"#9fa2c7", line:"#1c2036" },
    t3: { brand:"#2bb8ff", brand2:"#0e90ff", bg:"#061220", panel:"#0a1828", text:"#ebf6ff", good:"#27e0a3", bad:"#ff627e", muted:"#90aac2", line:"#162840" },
    t4: { brand:"#27e0a3", brand2:"#06b676", bg:"#07150f", panel:"#091612", text:"#effff7", good:"#27e0a3", bad:"#ff627e", muted:"#94b8a7", line:"#102820" },
    t5: { brand:"#ffb84d", brand2:"#ff8a3d", bg:"#15110a", panel:"#1b150d", text:"#fff7ea", good:"#42e1a7", bad:"#ff6b6b", muted:"#c2ad8f", line:"#2e2415" },
  },
};

const THEMES = ["t1", "t2", "t3", "t4", "t5"] as const;
const METHODS = ["FIFO", "LIFO", "HIFO", "AVCO"];
const CURRENCIES = ["USD", "EUR", "GBP", "QAR"];
const TIMEZONES = [
  { id: "local", name: "Local (Browser)" },
  { id: "UTC", name: "UTC" },
  { id: "America/New_York", name: "US Eastern" },
  { id: "America/Chicago", name: "US Central" },
  { id: "America/Los_Angeles", name: "US Pacific" },
  { id: "Europe/London", name: "London" },
  { id: "Europe/Berlin", name: "Berlin" },
  { id: "Asia/Tokyo", name: "Tokyo" },
  { id: "Asia/Shanghai", name: "Shanghai" },
  { id: "Asia/Dubai", name: "Dubai" },
  { id: "Asia/Qatar", name: "Qatar" },
];
const NUMBER_FORMATS = [
  { id: "default", name: "1,234.56 (US/UK)" },
  { id: "eu", name: "1.234,56 (EU)" },
  { id: "compact", name: "1.23K (Compact)" },
];
const REFRESH_INTERVALS = [
  { id: "60", name: "1 minute" },
  { id: "120", name: "2 minutes" },
  { id: "300", name: "5 minutes" },
  { id: "600", name: "10 minutes" },
];

// ── Layout Card ─────────────────────────────────────────────────────

function LayoutCard({ layout, active, currentTheme, onClick }: {
  layout: typeof LAYOUTS[0]; active: boolean; currentTheme: string; onClick: () => void;
}) {
  const c = TC[layout.id]?.[currentTheme] || TC[layout.id]?.t1;
  if (!c) return null;

  return (
    <div onClick={onClick} style={{
      cursor: "pointer", borderRadius: 10,
      border: active ? `2px solid var(--brand)` : "2px solid var(--line)",
      padding: 10, background: active ? "var(--brand3)" : "var(--panel2)",
      boxShadow: active ? "0 0 0 3px var(--brand3)" : "none",
      transition: "all 0.15s ease", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        height: 56, borderRadius: 6, marginBottom: 8, overflow: "hidden",
        background: c.bg, border: "1px solid " + c.line,
        display: "flex", gap: 3, padding: 4,
      }}>
        <div style={{ width: 14, borderRadius: 3, background: c.panel, display: "flex", flexDirection: "column", gap: 3, padding: 3 }}>
          <div style={{ height: 3, borderRadius: 1, background: c.brand }} />
          <div style={{ height: 3, borderRadius: 1, background: c.muted, opacity: 0.4 }} />
          <div style={{ height: 3, borderRadius: 1, background: c.muted, opacity: 0.3 }} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ height: 7, borderRadius: 2, background: c.panel }} />
          <div style={{ display: "flex", gap: 3, flex: 1 }}>
            <div style={{ flex: 1, borderRadius: 3, background: c.panel, display: "flex", flexDirection: "column", padding: 2, justifyContent: "center" }}>
              <div style={{ height: 2, width: "60%", background: c.muted, borderRadius: 1, marginBottom: 2 }} />
              <div style={{ height: 4, width: "80%", background: c.brand, borderRadius: 1 }} />
            </div>
            <div style={{ flex: 1, borderRadius: 3, background: c.panel, display: "flex", flexDirection: "column", padding: 2, justifyContent: "center" }}>
              <div style={{ height: 2, width: "60%", background: c.muted, borderRadius: 1, marginBottom: 2 }} />
              <div style={{ height: 4, width: "70%", background: c.good, borderRadius: 1 }} />
            </div>
            <div style={{ flex: 1, borderRadius: 3, background: c.panel, display: "flex", flexDirection: "column", padding: 2, justifyContent: "center" }}>
              <div style={{ height: 2, width: "60%", background: c.muted, borderRadius: 1, marginBottom: 2 }} />
              <div style={{ height: 4, width: "50%", background: c.bad, borderRadius: 1 }} />
            </div>
          </div>
          <div style={{ height: 12, borderRadius: 3, background: c.panel }} />
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>{layout.name}</div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>{layout.desc}</div>
      <div style={{ fontSize: 8, color: "var(--muted2)", marginTop: 2, fontStyle: "italic" }}>{layout.font}</div>
      {active && (
        <div style={{ position: "absolute", top: 6, right: 6, width: 16, height: 16, borderRadius: "50%", background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900 }}>✓</div>
      )}
    </div>
  );
}

function ThemeButton({ themeId, layoutId, active, onClick }: {
  themeId: string; layoutId: string; active: boolean; onClick: () => void;
}) {
  const c = TC[layoutId]?.[themeId];
  if (!c) return null;

  return (
    <div onClick={onClick} style={{
      cursor: "pointer", borderRadius: 10,
      border: active ? "2px solid var(--brand)" : "2px solid var(--line)",
      padding: 10, background: active ? "var(--brand3)" : "var(--panel2)",
      boxShadow: active ? "0 0 0 3px var(--brand3)" : "none",
      transition: "all 0.15s ease", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: c.brand, border: "1px solid rgba(128,128,128,0.2)" }} />
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: c.brand2, border: "1px solid rgba(128,128,128,0.2)" }} />
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: c.good, border: "1px solid rgba(128,128,128,0.2)" }} />
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: c.bad, border: "1px solid rgba(128,128,128,0.2)" }} />
      </div>
      <div style={{ width: "100%", height: 20, borderRadius: 4, overflow: "hidden", background: c.bg, border: "1px solid " + c.line, display: "flex", alignItems: "center", gap: 4, padding: "0 6px" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.brand }} />
        <div style={{ flex: 1, height: 3, borderRadius: 2, background: c.text, opacity: 0.2 }} />
        <div style={{ width: 14, height: 3, borderRadius: 2, background: c.good }} />
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text)" }}>Theme {themeId.slice(1)}</div>
    </div>
  );
}

// ── Alerts Types ──────────────────────────────────────────────────
type AlertType = "price_above" | "price_below";

// ── Main Page ─────────────────────────────────────────────────────────────

const SettingsPage = forwardRef<HTMLDivElement, Record<string, never>>(function SettingsPage(_props, _ref) {
  const { state, setState, toast, rehydrateFromBackend } = useCrypto();
  const activeLayout = LAYOUTS.find(l => l.id === state.layout);

  // Alert editing state
  const [editId, setEditId] = useState<string | null>(null);
  const [editSym, setEditSym] = useState("");
  const [editThreshold, setEditThreshold] = useState("");
  const [editType, setEditType] = useState<AlertType>("price_above");

  // User Preferences from Database
  const [minImportValue, setMinImportValue] = useState(100);
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [repairingPEPE, setRepairingPEPE] = useState(false);

  useEffect(() => {
    async function loadPrefs() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("user_preferences").select("key, value").eq("user_id", user.id).eq("key", "minImportValue").single();
      if (data) setMinImportValue(parseFloat(data.value) || 100);
    }
    loadPrefs();
  }, []);

  const saveMinImport = async () => {
    setLoadingPrefs(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from("user_preferences").upsert({
        user_id: user.id,
        key: "minImportValue",
        value: String(minImportValue),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,key" });
      if (error) toast(error.message, "bad");
      else toast("Sync threshold saved to cloud ✓", "good");
    }
    setLoadingPrefs(false);
  };

  const runPEPEMultiplierRepair = async () => {
    if (!confirm("Run in-place multiplier repair for PEPE x1000? This updates existing buy/sell rows without deleting data.")) {
      return;
    }

    setRepairingPEPE(true);
    try {
      // Step 1: Dry-run to preview candidates
      const preview = await repairMultiplierTransactions({
        symbol: "PEPE",
        multiplier: 1000,
        dryRun: true,
      });

      const scanned = Number(preview?.scanned || 0);
      const matched = Number(preview?.matchedSymbolRows || 0);
      const candidates = Number(preview?.candidates || 0);
      const already = Number(preview?.skippedAlreadyRepaired || 0);
      const invariantFail = Number(preview?.invariantFailures || 0);

      if (candidates === 0) {
        if (already > 0) {
          await rehydrateFromBackend();
          toast(`Already repaired: ${already} row(s). Scanned ${scanned}, matched ${matched}.`, "warn");
        } else {
          toast(`No repair candidates. Scanned ${scanned}, matched ${matched}, invariant failures ${invariantFail}.`, "warn");
        }
        return;
      }

      // Step 2: Confirm and apply
      if (!confirm(`Dry-run found ${candidates} candidate(s) to repair (scanned ${scanned}, matched ${matched}, already repaired ${already}). Apply now?`)) {
        return;
      }

      const result = await repairMultiplierTransactions({
        symbol: "PEPE",
        multiplier: 1000,
        dryRun: false,
        force: true,
      });

      await rehydrateFromBackend();

      const rScanned = Number(result?.scanned || 0);
      const rMatched = Number(result?.matchedSymbolRows || 0);
      const rRepaired = Number(result?.repaired || 0);
      const rSkipped = Number(result?.skippedAlreadyRepaired || 0);
      const rInvariant = Number(result?.invariantFailures || 0);

      toast(
        `PEPE repair done: ${rRepaired} repaired, ${rSkipped} already done, ${rInvariant} invariant fail (scanned ${rScanned}, matched ${rMatched})`,
        rRepaired > 0 ? "good" : "warn"
      );

      if (rRepaired > 0) {
        setTimeout(() => window.location.reload(), 500);
      }
    } catch (err: any) {
      toast(err?.message || "PEPE repair failed", "bad");
    } finally {
      setRepairingPEPE(false);
    }
  };

  const alerts = state.alerts || [];

  const addAlert = () => {
    const d = cryptoDerived(state);
    const sym = d.rows[0]?.sym || "BTC";
    setState(prev => ({
      ...prev,
      alerts: [{ id: uid(), type: "price_above", sym, threshold: 100000, active: true, createdAt: Date.now(), triggeredAt: null }, ...prev.alerts]
    }));
    toast("Alert added — edit threshold", "good");
  };

  const startEdit = (a: any) => {
    setEditId(a.id);
    setEditSym(a.sym || "");
    setEditThreshold(String(a.threshold));
    setEditType(a.type || "price_above");
  };

  const saveEdit = () => {
    if (!editId) return;
    setState(p => ({
      ...p,
      alerts: p.alerts.map(a => a.id === editId ? { ...a, sym: editSym.toUpperCase(), threshold: parseFloat(editThreshold) || 0, type: editType } : a)
    }));
    setEditId(null);
    toast("Alert updated", "good");
  };

  return (
    <div style={{ minWidth: 0, overflowX: "hidden" }}>
      {/* Layout Templates */}
      <div className="panel" style={{ minWidth: 0 }}>
        <div className="panel-head"><h2>Layout Templates</h2></div>
        <div className="panel-body">
          <div className="lt-grid">
            {LAYOUTS.map(l => (
              <LayoutCard key={l.id} layout={l} active={state.layout === l.id} currentTheme={state.theme}
                onClick={() => { setState(p => ({ ...p, layout: l.id })); toast("Layout: " + l.name, "good"); }} />
            ))}
          </div>
        </div>
      </div>

      {/* Theme Colors */}
      <div className="panel" style={{ marginTop: 10, minWidth: 0 }}>
        <div className="panel-head"><h2>Theme Colors</h2></div>
        <div className="panel-body">
          <div className="theme-colors">
            {THEMES.map(t => (
              <ThemeButton key={t} themeId={t} layoutId={state.layout} active={state.theme === t}
                onClick={() => { setState(p => ({ ...p, theme: t })); toast("Theme: " + t, "good"); }} />
            ))}
          </div>
        </div>
      </div>

      {/* Tracking + Currency */}
      <div className="settings-row" style={{ marginTop: 10 }}>
        <div className="panel" style={{ minWidth: 0 }}>
          <div className="panel-head"><h2>Tracking Method</h2></div>
          <div className="panel-body">
            <div className="seg">
              {METHODS.map(m => (
                <button key={m} className={state.method === m ? "active" : ""} onClick={() => { setState(p => ({ ...p, method: m })); toast("Method: " + m, "good"); }}>{m}</button>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 8, fontSize: 11, whiteSpace: "normal", wordBreak: "break-word", lineHeight: "1.4" }}>
              FIFO: First-In-First-Out lot matching. DCA: Dollar Cost Average position tracking.
            </p>
          </div>
        </div>
        <div className="panel" style={{ minWidth: 0 }}>
          <div className="panel-head"><h2>Base Currency</h2></div>
          <div className="panel-body">
            <div className="seg">
              {CURRENCIES.map(c => (
                <button key={c} className={state.base === c ? "active" : ""} onClick={() => setState(p => ({ ...p, base: c }))}>{c}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tracking Threshold */}
      <div className="settings-row" style={{ marginTop: 10 }}>
        <div className="panel" style={{ minWidth: 0 }}>
          <div className="panel-head"><h2>🚀 Tracking Threshold</h2></div>
          <div className="panel-body">
            <div className="form-field" style={{ minWidth: 0, borderBottom: "1px solid var(--line)", paddingBottom: 12, marginBottom: 12 }}>
              <label className="form-label" style={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: "1.25" }}>
                Minimum Asset Value ({state.base})
              </label>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <input 
                  type="range" 
                  min="0" 
                  max="500" 
                  step="10" 
                  className="inp" 
                  style={{ flex: 1, height: 6, padding: 0 }}
                  value={state.minImportValue} 
                  onChange={e => setState(p => ({ ...p, minImportValue: parseInt(e.target.value) }))} 
                />
                <div style={{ position: "relative" }}>
                  <input 
                    type="number" 
                    className="inp" 
                    style={{ width: 90, textAlign: "right", paddingRight: 32 }}
                    value={state.minImportValue}
                    onChange={e => setState(p => ({ ...p, minImportValue: parseInt(e.target.value) || 0 }))}
                  />
                  <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, fontWeight: 800, color: "var(--muted)" }}>{state.base}</span>
                </div>
              </div>
              <p className="muted" style={{ marginTop: 8, fontSize: 11, lineBreak: "auto", wordBreak: "break-word", lineHeight: "1.4" }}>
                Assets with a total value less than this will be hidden from dashboard and summaries.
              </p>
            </div>

            <div className="form-field" style={{ minWidth: 0 }}>
              <label className="form-label" style={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: "1.25" }}>
                Minimum API Sync Value (USD)
              </label>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <input 
                  className="inp" 
                  type="number"
                  value={minImportValue}
                  onChange={e => setMinImportValue(parseFloat(e.target.value) || 0)}
                  style={{ flex: 1 }}
                />
                <button className="btn secondary" onClick={saveMinImport} disabled={loadingPrefs} style={{ padding: "8px 16px", fontSize: 11 }}>
                  {loadingPrefs ? "Saving..." : "Save to Cloud"}
                </button>
              </div>
              <p className="muted" style={{ marginTop: 8, fontSize: 11, lineBreak: "auto", wordBreak: "break-word", lineHeight: "1.4" }}>
                Trades (Buy/Sell) below this USD value will be ignored during API sync. <strong>Recommended: $100</strong> to avoid dust clutter.
              </p>
            </div>
          </div>
        </div>
        {/* Placeholder panel to keep 2-col layout consistent */}
        <div style={{ flex: 1, minWidth: 0 }} />
      </div>

      {/* Display Preferences */}
      <div className="panel" style={{ marginTop: 10, minWidth: 0 }}>
        <div className="panel-head"><h2>Display Preferences</h2></div>
        <div className="panel-body">
          <div className="settings-prefs-grid">
            <div className="form-field" style={{ minWidth: 0 }}>
              <label className="form-label" style={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: "1.25" }}>Timezone</label>
              <select className="inp" style={{ width: "100%", minWidth: 0 }} value={(state as any).timezone || "local"} onChange={e => { setState(p => ({ ...p, timezone: e.target.value } as any)); toast("Timezone updated", "good"); }}>
                {TIMEZONES.map(tz => <option key={tz.id} value={tz.id}>{tz.name}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ minWidth: 0 }}>
              <label className="form-label" style={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: "1.25" }}>Number Format</label>
              <select className="inp" style={{ width: "100%", minWidth: 0 }} value={(state as any).numberFormat || "default"} onChange={e => { setState(p => ({ ...p, numberFormat: e.target.value } as any)); toast("Number format updated", "good"); }}>
                {NUMBER_FORMATS.map(nf => <option key={nf.id} value={nf.id}>{nf.name}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ minWidth: 0 }}>
              <label className="form-label" style={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: "1.25" }}>Data Refresh Interval</label>
              <select className="inp" style={{ width: "100%", minWidth: 0 }} value={(state as any).refreshInterval || "120"} onChange={e => { setState(p => ({ ...p, refreshInterval: e.target.value } as any)); toast("Refresh interval updated", "good"); }}>
                {REFRESH_INTERVALS.map(ri => <option key={ri.id} value={ri.id}>{ri.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="panel" style={{ marginTop: 10, minWidth: 0 }}>
        <div className="panel-head"><h2>Notifications</h2></div>
        <div className="panel-body">
          {[
            { key: "notifyAlerts", label: "Price alert notifications", def: true },
            { key: "notifyImports", label: "Import completion notifications", def: true },
            { key: "notifySync", label: "Sync status notifications", def: false },
          ].map(n => (
            <div key={n.key} className="tog-wrap" onClick={() => setState(p => ({ ...p, [n.key]: !(p as any)[n.key] } as any))}>
              <span className="tog-lbl" style={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: "1.25" }}>{n.label}</span>
              <div className="tog-switch">
                <input type="checkbox" checked={(state as any)[n.key] ?? n.def} readOnly />
                <span className="tog-track" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Price Alerts */}
      <div className="panel" style={{ marginTop: 10, minWidth: 0 }}>
        <div className="panel-head">
          <h2>🔔 Price Alerts</h2>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className="pill">{alerts.length} total</span>
            <button className="btn tiny" onClick={addAlert}>+ Add</button>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <div className="tableWrap"><table>
            <thead><tr><th>Type</th><th>Symbol</th><th style={{ textAlign: "right" }}>Threshold</th><th>Status</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
            <tbody>
              {alerts.length ? alerts.map(a => (
                editId === a.id ? (
                  <tr key={a.id} style={{ background: "var(--brand3)" }}>
                    <td>
                      <select className="inp" value={editType} onChange={e => setEditType(e.target.value as AlertType)} style={{ fontSize: 11, padding: 4 }}>
                        <option value="price_above">PRICE ABOVE</option>
                        <option value="price_below">PRICE BELOW</option>
                      </select>
                    </td>
                    <td><input className="inp" value={editSym} onChange={e => setEditSym(e.target.value)} style={{ width: 60, fontSize: 11, padding: 4 }} /></td>
                    <td style={{ textAlign: "right" }}><input className="inp" value={editThreshold} onChange={e => setEditThreshold(e.target.value)} style={{ width: 90, fontSize: 11, padding: 4, textAlign: "right" }} /></td>
                    <td></td>
                    <td style={{ textAlign: "right", display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button className="btn tiny" onClick={saveEdit}>Save</button>
                      <button className="btn tiny secondary" onClick={() => setEditId(null)}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 900 }}>{(a.type || "").replace("_", " ").toUpperCase()}</td>
                    <td>{a.sym || "—"}</td>
                    <td style={{ textAlign: "right" }}>{fmtPx(a.threshold)} {state.base}</td>
                    <td>{a.active ? <span className="pill good">Active</span> : <span className="pill">Disabled</span>}</td>
                    <td style={{ textAlign: "right", display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button className="btn tiny secondary" onClick={() => startEdit(a)}>Edit</button>
                      <button className="btn tiny secondary" onClick={() => setState(p => ({ ...p, alerts: p.alerts.map(x => x.id === a.id ? { ...x, active: !x.active } : x) }))}>
                        {a.active ? "Disable" : "Enable"}
                      </button>
                      <button className="btn tiny secondary" onClick={() => setState(p => ({ ...p, alerts: p.alerts.filter(x => x.id !== a.id) }))}>Del</button>
                    </td>
                  </tr>
                )
              )) : <tr><td colSpan={5} className="muted">No alerts yet. Click "+ Add" to get started.</td></tr>}
            </tbody>
          </table></div>
        </div>
      </div>

      {/* Data Management */}
      <div className="panel" style={{ marginTop: 10, minWidth: 0 }}>
        <div className="panel-head"><h2>Data Management</h2></div>
        <div className="panel-body">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="btn secondary" style={{ minWidth: 0, whiteSpace: "normal" }} onClick={() => {
              const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
              const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "crypto-backup.json"; a.click();
              toast("Exported ✓", "good");
            }}>📥 Export Backup</button>
            <button className="btn secondary" style={{ minWidth: 0, whiteSpace: "normal" }} onClick={() => {
              const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json";
              inp.onchange = async () => {
                const file = inp.files?.[0]; if (!file) return;
                try { const data = JSON.parse(await file.text()); setState(() => data); toast("Restored from backup ✓", "good"); }
                catch { toast("Invalid backup file", "bad"); }
              };
              inp.click();
            }}>📤 Import Backup</button>
          </div>
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
            <button className="btn danger" style={{ minWidth: 0, whiteSpace: "normal" }} onClick={() => {
              if (confirm("Clear ALL transactions, lots, and holdings? This cannot be undone.")) {
                setState(p => ({ ...p, txs: [], lots: [], holdings: [], importedFiles: [], calendarEntries: [] }));
                toast("All data cleared", "bad");
              }
            }}>🗑 Clear All Data</button>
          </div>
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
            <button
              className="btn secondary"
              style={{ minWidth: 0, whiteSpace: "normal" }}
              onClick={runPEPEMultiplierRepair}
              disabled={repairingPEPE}
            >
              {repairingPEPE ? "Repairing..." : "🛠 Admin: Repair PEPE x1000 Rows"}
            </button>
            <p className="muted" style={{ marginTop: 8, fontSize: 11, lineBreak: "auto", wordBreak: "break-word", lineHeight: "1.4" }}>
              One-click in-place repair for previously imported multiplier-corrupted PEPE transactions. No data wipe.
            </p>
          </div>
        </div>
      </div>

      {/* Vault / Snapshots */}
      <VaultSection />
    </div>
  );
});

// ── Vault Section ─────────────────────────────────────────────────
const DB_NAME = "cryptotracker_vault";
const STORE = "snapshots";
interface Snapshot { id: string; label: string; ts: number; size: number; }

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSave(id: string, state: any, label: string) { const db = await openDB(); const blob = JSON.stringify(state); return new Promise<void>((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put({ id, label, ts: Date.now(), state, size: blob.length }); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbList(): Promise<Snapshot[]> { const db = await openDB(); return new Promise((res, rej) => { const tx = db.transaction(STORE, "readonly"); const req = tx.objectStore(STORE).getAll(); req.onsuccess = () => { const items = (req.result || []).map((s: any) => ({ id: s.id, label: s.label, ts: s.ts, size: s.size || 0 })); items.sort((a: Snapshot, b: Snapshot) => b.ts - a.ts); res(items); }; req.onerror = () => rej(req.error); }); }
async function idbGet(id: string): Promise<any> { const db = await openDB(); return new Promise((res, rej) => { const tx = db.transaction(STORE, "readonly"); const req = tx.objectStore(STORE).get(id); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
async function idbDelete(id: string): Promise<void> { const db = await openDB(); return new Promise((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
function fmtDate(ts: number) { return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
function fmtSize(bytes: number) { if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + " MB"; if (bytes > 1024) return (bytes / 1024).toFixed(1) + " KB"; return bytes + " B"; }

function VaultSection() {
  const { state, setState, toast } = useCrypto();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(true);
  const loadSnaps = useCallback(async () => { try { setSnapshots(await idbList()); } catch {} setLoading(false); }, []);
  useEffect(() => { loadSnaps(); }, [loadSnaps]);

  const takeSnapshot = async () => { if (!desc.trim()) { toast("Add a description", "warn"); return; } try { await idbSave("snap_" + Date.now(), state, desc.trim()); setDesc(""); toast("📸 Snapshot saved", "good"); loadSnaps(); } catch { toast("Failed", "bad"); } };
  const restoreSnap = async (id: string) => { if (!confirm("Restore this snapshot?")) return; try { const s = await idbGet(id); if (s?.state) { setState(() => s.state); toast("✓ Restored", "good"); } else toast("Not found", "bad"); } catch { toast("Failed", "bad"); } };
  const deleteSnap = async (id: string) => { if (!confirm("Delete?")) return; await idbDelete(id); toast("Deleted", "warn"); loadSnaps(); };
  const exportSnap = async (id: string) => { const s = await idbGet(id); if (!s?.state) { toast("Not found", "bad"); return; } const blob = new Blob([JSON.stringify(s.state, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `snapshot-${new Date(s.ts).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`; a.click(); URL.revokeObjectURL(a.href); toast("Exported", "good"); };

  return (
    <div className="panel" style={{ marginTop: 10, minWidth: 0 }}>
      <div className="panel-head"><h2>💾 Vault — Local Snapshots</h2><span className="pill">{snapshots.length} saved</span></div>
      <div className="panel-body">
        <p className="muted" style={{ fontSize: 11, marginBottom: 10, lineHeight: 1.6 }}>Instant local snapshots stored in IndexedDB. Survives page reloads.</p>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <input className="inp" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Snapshot description" style={{ flex: 1, minWidth: 0 }} />
          <button className="btn" onClick={takeSnapshot}>📸 Snapshot</button>
        </div>
        {loading && <div className="muted" style={{ fontSize: 11 }}>Loading…</div>}
        {!loading && snapshots.length === 0 && <div className="muted" style={{ fontSize: 11, padding: "12px 0" }}>No snapshots yet.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {snapshots.map(s => (
            <div key={s.id} className="vault-card">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12 }}>{s.label}</div>
                <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{fmtDate(s.ts)} · {fmtSize(s.size)}</div>
              </div>
              <div className="vault-card-actions">
                <button className="rowBtn" onClick={() => restoreSnap(s.id)}>Restore</button>
                <button className="rowBtn" onClick={() => exportSnap(s.id)}>Export</button>
                <button className="rowBtn" onClick={() => deleteSnap(s.id)} style={{ color: "var(--bad)" }}>Del</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

SettingsPage.displayName = "SettingsPage";

export default SettingsPage;
