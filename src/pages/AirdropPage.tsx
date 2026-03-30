import { useState } from "react";

interface AirdropProject {
  name: string;
  token: string;
  status: "upcoming" | "live" | "ended";
  description: string;
  checkUrl: string;
  criteria: string[];
}

const KNOWN_AIRDROPS: AirdropProject[] = [
  { name: "LayerZero (ZRO)", token: "ZRO", status: "ended", description: "ZRO airdrop for LayerZero protocol users", checkUrl: "https://layerzero.foundation/eligibility", criteria: ["Used LayerZero bridge", "Made cross-chain transactions", "Held gas on multiple chains"] },
  { name: "zkSync (ZK)", token: "ZK", status: "ended", description: "ZK token for zkSync Era users", checkUrl: "https://claim.zknation.io", criteria: ["Used zkSync Era mainnet", "Held ETH on zkSync", "Interacted with dApps"] },
  { name: "Starknet (STRK)", token: "STRK", status: "ended", description: "STRK for early Starknet users", checkUrl: "https://provisions.starknet.io", criteria: ["ETH holder", "Used Starknet protocols", "GitHub contributor"] },
  { name: "Arbitrum (ARB)", token: "ARB", status: "ended", description: "ARB for Arbitrum ecosystem users", checkUrl: "https://arbitrum.foundation/eligibility", criteria: ["Used Arbitrum One", "Multiple transactions", "Held ETH on L2"] },
  { name: "Optimism (OP)", token: "OP", status: "live", description: "OP retroactive public goods funding", checkUrl: "https://app.optimism.io/airdrop/check", criteria: ["Used Optimism mainnet", "Voted in governance", "Used Optimism dApps"] },
  { name: "Hyperliquid (HYPE)", token: "HYPE", status: "ended", description: "HYPE for trading volume on Hyperliquid", checkUrl: "https://hyperliquid.xyz", criteria: ["Traded on Hyperliquid perps", "Points accrued before snapshot"] },
  { name: "Monad (MONAD)", token: "MONAD", status: "upcoming", description: "EVM-compatible L1 with parallel execution", checkUrl: "https://monad.xyz", criteria: ["Testnet participation", "Community role", "Early adopter"] },
  { name: "Berachain (BERA)", token: "BERA", status: "live", description: "Proof-of-Liquidity L1", checkUrl: "https://bartio.berachain.com", criteria: ["Testnet activity", "Provided liquidity", "Used BGT governance"] },
];

export default function AirdropPage() {
  const [address, setAddress] = useState("");
  const [filter, setFilter] = useState<"all" | "upcoming" | "live" | "ended">("all");

  const shown = filter === "all" ? KNOWN_AIRDROPS : KNOWN_AIRDROPS.filter(a => a.status === filter);

  const statusColor: Record<string, string> = { upcoming: "var(--warn)", live: "var(--good)", ended: "var(--muted2)" };
  const statusLabel: Record<string, string> = { upcoming: "Upcoming", live: "Live", ended: "Ended" };

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontWeight: 800, fontSize: 22, margin: 0 }}>Airdrop Eligibility Checker</h2>
        <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>Track known airdrops and check if your wallet qualifies.</p>
      </div>

      {/* Wallet address checker */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">Check Your Wallet</div>
        <div className="panel-body">
          <div style={{ display: "flex", gap: 8 }}>
            <input className="inp" style={{ flex: 1 }} placeholder="Enter Ethereum / Solana wallet address (0x... or sol...)"
              value={address} onChange={e => setAddress(e.target.value)} />
            <button className="btn" onClick={() => {
              if (address.trim()) window.open(`https://debank.com/profile/${address.trim()}`, "_blank");
            }}>Check on DeBank ↗</button>
            <button className="btn secondary" onClick={() => {
              if (address.trim()) window.open(`https://zapper.xyz/account/${address.trim()}`, "_blank");
            }}>Zapper ↗</button>
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            Paste your wallet address above to check eligibility on DeBank or Zapper, which aggregate most airdrop eligibilities.
          </p>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {(["all","upcoming","live","ended"] as const).map(f => (
          <button key={f} className={`btn${f === filter ? "" : " secondary"}`} style={{ fontSize: 11, padding: "5px 12px" }}
            onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {shown.map(a => (
          <div key={a.token} className="panel" style={{ borderLeft: `3px solid ${statusColor[a.status]}` }}>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{a.name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: statusColor[a.status], background: `${statusColor[a.status]}22`, borderRadius: 4, padding: "2px 8px" }}>
                  {statusLabel[a.status]}
                </span>
              </div>
              <p className="muted" style={{ fontSize: 11, margin: "0 0 10px" }}>{a.description}</p>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>ELIGIBILITY CRITERIA</div>
                {a.criteria.map((c, i) => (
                  <div key={i} style={{ fontSize: 11, display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 2 }}>
                    <span style={{ color: "var(--brand)", flexShrink: 0 }}>•</span>
                    <span>{c}</span>
                  </div>
                ))}
              </div>
              <a href={a.checkUrl} target="_blank" rel="noopener noreferrer"
                className="btn" style={{ fontSize: 11, display: "inline-block", textDecoration: "none", padding: "5px 12px" }}>
                Check Eligibility ↗
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
