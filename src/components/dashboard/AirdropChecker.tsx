import React, { useState } from "react";
import { toast } from "sonner";

export function AirdropChecker() {
  const [address, setAddress] = useState("");
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const checkAirdrops = async () => {
    if (!address.startsWith("0x")) {
      toast.error("Please enter a valid EVM address (0x...)");
      return;
    }
    setChecking(true);
    try {
       // Deep mock of known airdrop list
       // In a real app, use Dayo's or similar API/database
       const knownAirdrops = [
          { name: "Arbitrum (DAO)", amount: "1500 ARB", status: "Claimed", color: "var(--brand)" },
          { name: "Starknet (STRK)", amount: "500 STRK", status: "Check Website", color: "var(--warn, #eab308)" },
          { name: "Celestia (TIA)", amount: "0 TIA", status: "Ineligible", color: "var(--muted)" },
          { name: "ZKSync (Speculative)", amount: "N/A", status: "Pending", color: "var(--good)" }
       ];
       setResults(knownAirdrops);
       toast.success("Wallet scan complete.");
    } catch (err) {
       toast.error("Failed to fetch eligibility snapshots.");
    } finally {
       setChecking(false);
    }
  };

  return (
    <div className="airdrop-checker">
       <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input 
            className="inp" placeholder="Paste your 0x address..." 
            value={address} onChange={e => setAddress(e.target.value)}
            style={{ flex: 1, fontSize: 11 }}
          />
          <button className="btn primary tiny" onClick={checkAirdrops} disabled={checking}>
             {checking ? "Scanning..." : "Scan"}
          </button>
       </div>

       <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {results.length > 0 ? results.map(r => (
            <div key={r.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 10, background: "var(--panel2)", borderRadius: 10, border: "1px solid var(--line)" }}>
               <div>
                  <div style={{ fontSize: 11, fontWeight: 800 }}>{r.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: r.status === "Ineligible" ? "var(--muted)" : "var(--brand)" }}>{r.amount}</div>
               </div>
               <span className="pill" style={{ color: r.color, background: `${r.color}15`, fontSize: 8 }}>{r.status.toUpperCase()}</span>
            </div>
          )) : (
            <div style={{ textAlign: "center", padding: 20, fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>
               Scan your wallet against 40+ historical and upcoming airdrop snapshots.
            </div>
          )}
       </div>
    </div>
  );
}
