import React, { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { fmtQty } from "@/lib/cryptoState";

export function MigrationHub() {
  const { state } = useCrypto();

  const migrations = useMemo(() => {
    const ins = state.txs.filter(t => t.type === "transfer_in");
    const outs = state.txs.filter(t => t.type === "transfer_out");
    
    // Simple matching logic: Same asset, same-ish time (within 1 hour), same-ish qty
    const linked: any[] = [];
    const unmatchedIns = [...ins];
    const unmatchedOuts = [...outs];

    for (let i = 0; i < unmatchedOuts.length; i++) {
      const o = unmatchedOuts[i];
      const matchIdx = unmatchedIns.findIndex(inTx => 
        inTx.asset === o.asset && 
        Math.abs(inTx.ts - o.ts) < 3600000 && // 1 hour
        Math.abs(inTx.qty - o.qty) < (o.qty * 0.05) // 5% fee tolerance
      );

      if (matchIdx !== -1) {
        const inTx = unmatchedIns.splice(matchIdx, 1)[0];
        linked.push({
          id: `${o.id}-${inTx.id}`,
          asset: o.asset,
          qty: o.qty,
          from: (o as any).venue || "Wallet",
          to: (inTx as any).venue || "Exchange",
          ts: o.ts,
          status: "Linked"
        });
        unmatchedOuts.splice(i, 1);
        i--;
      }
    }

    return { linked, unmatchedIns, unmatchedOuts };
  }, [state.txs]);

  return (
    <div className="migration-hub">
       <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, background: "var(--panel2)", padding: 10, borderRadius: 10, border: "1px solid var(--line)" }}>
             <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 800 }}>LINKED MOVES</div>
             <div style={{ fontSize: 18, fontWeight: 900 }}>{migrations.linked.length}</div>
          </div>
          <div style={{ flex: 1, background: "var(--panel2)", padding: 10, borderRadius: 10, border: "1px solid var(--line)" }}>
             <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 800 }}>PENDING MATCH</div>
             <div style={{ fontSize: 18, fontWeight: 900, color: "var(--warn, #eab308)" }}>
                {migrations.unmatchedIns.length + migrations.unmatchedOuts.length}
             </div>
          </div>
       </div>

       <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {migrations.linked.map(m => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 10, background: "rgba(34, 197, 94, 0.04)", border: "1px solid rgba(34, 197, 94, 0.15)", borderRadius: 10 }}>
               <div>
                  <div style={{ fontSize: 11, fontWeight: 800 }}>{fmtQty(m.qty)} {m.asset}</div>
                  <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 2 }}>{m.from} → {m.to}</div>
               </div>
               <span className="pill good" style={{ fontSize: 8 }}>MIGRATED</span>
            </div>
          ))}

          {migrations.unmatchedOuts.map(o => (
            <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 10, background: "var(--panel2)", border: "1px dashed var(--line)", borderRadius: 10 }}>
               <div>
                  <div style={{ fontSize: 11, fontWeight: 800 }}>{fmtQty(o.qty)} {o.asset}</div>
                  <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 2 }}>Leaving {(o as any).venue || "Cold Storage"}</div>
               </div>
               <button className="btn tiny secondary" style={{ fontSize: 8 }}>Match Handlers</button>
            </div>
          ))}
       </div>

       <div style={{ marginTop: 14, background: "rgba(255, 255, 255, 0.03)", padding: 10, borderRadius: 8, fontSize: 10, lineHeight: 1.5 }}>
          💡 <strong>Transfer Matching</strong> ensures your "Cost Basis" travels with your assets when moving between exchanges, preventing artificial tax gains.
       </div>
    </div>
  );
}
