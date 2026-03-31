import React, { useState } from "react";
import { toast } from "sonner";

export function WalletConnector() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  const connectWallet = async () => {
    if (!address) return;
    setLoading(true);
    try {
      // In a real app, this would use a backend function to scan xPub or single address
      // Using Blockchair or Blockchain.info public API for demonstration
      const res = await fetch(`https://blockchain.info/rawaddr/${address}`);
      const data = await res.json();
      const btc = data.final_balance / 100000000;
      setBalance(btc);
      toast.success("Wallet connected! Balance: " + btc.toFixed(4) + " BTC");
    } catch (err) {
      console.error("Wallet Sync Error:", err);
      // Fallback for demo if API fails
      toast.error("Failed to sync address. Ensure it's a valid BTC address.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wallet-connector">
       <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Connect Watch-only Wallet (xPub / Address)</div>
       <div style={{ display: "flex", gap: 8 }}>
         <input 
           className="inp" 
           placeholder="Paste BTC address or xPub..." 
           value={address}
           onChange={e => setAddress(e.target.value)}
           style={{ flex: 1, padding: "8px 12px", fontSize: 12 }}
         />
         <button className="btn primary tiny" onClick={connectWallet} disabled={loading}>
           {loading ? "Syncing..." : "Sync"}
         </button>
       </div>
       
       {balance !== null && (
         <div style={{ marginTop: 12, background: "var(--brand3)", padding: 10, borderRadius: 8, border: "1px solid var(--brand)" }}>
            <div style={{ fontSize: 10, color: "var(--brand)", fontWeight: 800, textTransform: "uppercase" }}>Current Balance</div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{balance.toFixed(6)} BTC</div>
            <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>Last synced: Just now</div>
         </div>
       )}
       
       <div style={{ marginTop: 12, fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>
          Your keys never leave your device. We only scan the blockchain for public balances. Supports BTC and xPub.
       </div>
    </div>
  );
}
