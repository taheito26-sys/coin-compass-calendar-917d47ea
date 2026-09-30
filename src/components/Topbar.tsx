import { useCrypto } from "@/lib/cryptoContext";
import CommandPalette from "./CommandPalette";
import ZenModeButton from "./dashboard/ZenModeToggle";

export default function Topbar({ title, sub, onNav }: { title: string; sub: string; onNav: (p: string) => void }) {
  const { state, rehydrateFromBackend } = useCrypto();

  const syncStatusIcon = state.syncStatus === "loading" ? "🔄" :
                        state.syncStatus === "synced" ? "✓" :
                        state.syncStatus === "error" ? "⚠" : "—";

  const handleQuickSync = () => {
    rehydrateFromBackend().catch(err => {
      console.error("Sync failed:", err);
    });
  };

  return (
    <header className="topbar">
      <div>
        <div className="pageTitle">{title}</div>
        <div className="pageSub" dangerouslySetInnerHTML={{ __html: sub }} />
      </div>
      <div className="topRight" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={handleQuickSync}
          disabled={state.syncStatus === "loading"}
          title={state.syncError || "Sync data across devices"}
          style={{
            padding: "4px 8px",
            fontSize: "12px",
            background: "transparent",
            border: "none",
            cursor: state.syncStatus === "loading" ? "wait" : "pointer",
            opacity: state.syncStatus === "loading" ? 0.6 : 1,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span>{syncStatusIcon}</span>
          {state.syncStatus === "error" && <span style={{ color: "var(--bad)" }}>Error</span>}
        </button>
        <ZenModeButton />
        <CommandPalette onNav={onNav} />
      </div>
    </header>
  );
}
