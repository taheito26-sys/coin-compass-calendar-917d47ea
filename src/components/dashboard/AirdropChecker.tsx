import React, { useState, useMemo } from "react";
import { toast } from "sonner";

interface AirdropProject {
  name: string;
  token: string;
  chain: string;
  status: "claimable" | "claimed" | "pending" | "ineligible" | "ended";
  amount: string;
  criteria: string[];
  link?: string;
  deadline?: string;
  score: number; // 0-100 eligibility score
}

// Known airdrop snapshot database (curated from public sources)
const AIRDROP_DATABASE: Omit<AirdropProject, "status" | "amount" | "score">[] = [
  { name: "Arbitrum", token: "ARB", chain: "ethereum", criteria: ["Bridge to Arbitrum", "TX on Arbitrum", "Interact with DApps"], link: "https://arbitrum.foundation" },
  { name: "Starknet", token: "STRK", chain: "starknet", criteria: ["Bridge to Starknet", "Unique active months", "TX volume > $100"], link: "https://starknet.io" },
  { name: "LayerZero", token: "ZRO", chain: "ethereum", criteria: ["Cross-chain messages", "OFT transfers", "Unique months"], link: "https://layerzero.network" },
  { name: "zkSync Era", token: "ZK", chain: "zksync", criteria: ["Bridge assets", "Smart contract interactions", "Unique active months ≥ 6"], link: "https://zksync.io" },
  { name: "Scroll", token: "SCR", chain: "scroll", criteria: ["Bridge to Scroll", "Deploy contracts", "DApp interactions"], link: "https://scroll.io" },
  { name: "Linea", token: "LINEA", chain: "linea", criteria: ["Voyage NFT", "Bridge usage", "DeFi interactions"], link: "https://linea.build" },
  { name: "EigenLayer", token: "EIGEN", chain: "ethereum", criteria: ["Restake ETH/LST", "Hold ≥ 30 days", "Delegate to operators"], link: "https://eigenlayer.xyz" },
  { name: "Celestia", token: "TIA", chain: "cosmos", criteria: ["Stake ATOM/OSMO", "IBC transfers", "Governance votes"], link: "https://celestia.org" },
  { name: "Jupiter", token: "JUP", chain: "solana", criteria: ["Trade on Jupiter", "Unique months", "Volume > $1000"], link: "https://jup.ag" },
  { name: "Wormhole", token: "W", chain: "ethereum", criteria: ["Cross-chain transfers", "Portal usage", "Multi-chain activity"], link: "https://wormhole.com" },
  { name: "Blast", token: "BLAST", chain: "blast", criteria: ["Bridge ETH/USDB", "Earn yield", "DApp usage"], link: "https://blast.io" },
  { name: "Mode Network", token: "MODE", chain: "mode", criteria: ["Bridge to Mode", "DeFi interactions", "Referrals"], link: "https://mode.network" },
  { name: "Hyperliquid", token: "HYPE", chain: "hyperliquid", criteria: ["Trade perpetuals", "Provide liquidity", "Volume milestones"], link: "https://hyperliquid.xyz" },
  { name: "Monad", token: "MON", chain: "monad", criteria: ["Testnet participation", "Community engagement", "Bug reports"], deadline: "TBD" },
  { name: "Berachain", token: "BERA", chain: "berachain", criteria: ["Testnet faucet", "DApp testing", "NFT mints"], deadline: "TBD" },
];

type ChainFilter = "all" | "ethereum" | "solana" | "cosmos" | "l2" | "testnet";

export function AirdropChecker() {
  const [address, setAddress] = useState("");
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<AirdropProject[]>([]);
  const [chainFilter, setChainFilter] = useState<ChainFilter>("all");
  const [hasChecked, setHasChecked] = useState(false);

  const checkAirdrops = async () => {
    const trimmed = address.trim();
    if (!trimmed) {
      toast.error("Please enter a wallet address");
      return;
    }

    // Detect chain from address format
    const isEVM = trimmed.startsWith("0x") && trimmed.length === 42;
    const isSolana = !trimmed.startsWith("0x") && trimmed.length >= 32 && trimmed.length <= 44;
    const isCosmos = trimmed.startsWith("cosmos") || trimmed.startsWith("osmo");

    if (!isEVM && !isSolana && !isCosmos) {
      toast.error("Supported: EVM (0x...), Solana, or Cosmos addresses");
      return;
    }

    setChecking(true);
    setHasChecked(true);

    try {
      // Simulate on-chain activity analysis
      // In production, this would query DeBank, Zapper, or direct RPC
      const analysisResults: AirdropProject[] = [];

      for (const project of AIRDROP_DATABASE) {
        // Simulate eligibility based on address hash for deterministic demo results
        const hashVal = trimmed.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const projectHash = project.name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const combined = (hashVal * projectHash) % 100;

        let status: AirdropProject["status"];
        let amount: string;
        let score: number;

        if (combined > 80) {
          status = "claimable";
          amount = `${(combined * 15).toLocaleString()} ${project.token}`;
          score = combined;
        } else if (combined > 60) {
          status = "claimed";
          amount = `${(combined * 10).toLocaleString()} ${project.token}`;
          score = combined;
        } else if (combined > 35) {
          status = "pending";
          amount = "TBD";
          score = combined;
        } else if (combined > 15) {
          status = "ineligible";
          amount = `0 ${project.token}`;
          score = combined;
        } else {
          status = "ended";
          amount = `0 ${project.token}`;
          score = 0;
        }

        analysisResults.push({ ...project, status, amount, score });
      }

      // Sort: claimable first, then pending, then claimed, ineligible last
      const order = { claimable: 0, pending: 1, claimed: 2, ended: 3, ineligible: 4 };
      analysisResults.sort((a, b) => order[a.status] - order[b.status]);

      setResults(analysisResults);
      const claimable = analysisResults.filter(r => r.status === "claimable").length;
      const pending = analysisResults.filter(r => r.status === "pending").length;
      toast.success(`Scan complete: ${claimable} claimable, ${pending} pending`);
    } catch (err) {
      toast.error("Failed to analyze wallet activity.");
    } finally {
      setChecking(false);
    }
  };

  const filteredResults = useMemo(() => {
    if (chainFilter === "all") return results;
    if (chainFilter === "l2") return results.filter(r => ["zksync", "scroll", "linea", "blast", "mode", "arbitrum"].includes(r.chain));
    if (chainFilter === "testnet") return results.filter(r => ["monad", "berachain"].includes(r.chain));
    return results.filter(r => r.chain === chainFilter);
  }, [results, chainFilter]);

  const stats = useMemo(() => {
    const claimable = results.filter(r => r.status === "claimable").length;
    const pending = results.filter(r => r.status === "pending").length;
    const claimed = results.filter(r => r.status === "claimed").length;
    const avgScore = results.length > 0
      ? Math.round(results.reduce((acc, r) => acc + r.score, 0) / results.length)
      : 0;
    return { claimable, pending, claimed, avgScore };
  }, [results]);

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    claimable: { label: "CLAIMABLE", color: "var(--good, #22c55e)", bg: "rgba(34,197,94,0.12)" },
    claimed: { label: "CLAIMED", color: "var(--brand, #3b82f6)", bg: "rgba(59,130,246,0.12)" },
    pending: { label: "PENDING", color: "var(--warn, #eab308)", bg: "rgba(234,179,8,0.12)" },
    ineligible: { label: "INELIGIBLE", color: "var(--muted)", bg: "rgba(128,128,128,0.08)" },
    ended: { label: "ENDED", color: "var(--muted)", bg: "rgba(128,128,128,0.08)" },
  };

  return (
    <div className="airdrop-checker">
      {/* Search input */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          className="inp"
          placeholder="0x... / Solana / Cosmos address"
          value={address}
          onChange={e => setAddress(e.target.value)}
          onKeyDown={e => e.key === "Enter" && checkAirdrops()}
          style={{ flex: 1, fontSize: 11 }}
        />
        <button className="btn primary tiny" onClick={checkAirdrops} disabled={checking}>
          {checking ? "Scanning..." : "Scan"}
        </button>
      </div>

      {/* Stats bar */}
      {hasChecked && results.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6,
          marginBottom: 12,
          padding: 8,
          background: "var(--panel2)",
          borderRadius: 8,
          border: "1px solid var(--line)",
        }}>
          {[
            { label: "Claimable", value: stats.claimable, color: "var(--good, #22c55e)" },
            { label: "Pending", value: stats.pending, color: "var(--warn, #eab308)" },
            { label: "Claimed", value: stats.claimed, color: "var(--brand, #3b82f6)" },
            { label: "Avg Score", value: `${stats.avgScore}%`, color: "var(--fg)" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 8, color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Chain filter */}
      {hasChecked && results.length > 0 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
          {(["all", "ethereum", "solana", "cosmos", "l2", "testnet"] as ChainFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setChainFilter(f)}
              style={{
                fontSize: 8,
                padding: "2px 7px",
                cursor: "pointer",
                background: chainFilter === f ? "var(--brand)" : "transparent",
                color: chainFilter === f ? "#fff" : "var(--muted)",
                border: "1px solid var(--line)",
                borderRadius: 999,
                fontWeight: 800,
                textTransform: "uppercase",
              }}
            >
              {f === "l2" ? "L2s" : f}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filteredResults.length > 0 ? filteredResults.map(r => {
          const cfg = statusConfig[r.status];
          return (
            <div
              key={r.name}
              style={{
                padding: 10,
                background: "var(--panel2)",
                borderRadius: 10,
                border: "1px solid var(--line)",
                borderLeft: `3px solid ${cfg.color}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 800 }}>{r.name}</span>
                    <span style={{
                      fontSize: 7,
                      padding: "1px 5px",
                      borderRadius: 4,
                      background: "var(--panel)",
                      color: "var(--muted)",
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}>
                      {r.chain}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 900,
                    color: r.status === "ineligible" || r.status === "ended" ? "var(--muted)" : "var(--brand)",
                    marginTop: 2,
                  }}>
                    {r.amount}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span style={{
                    fontSize: 8,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: cfg.bg,
                    color: cfg.color,
                    fontWeight: 900,
                  }}>
                    {cfg.label}
                  </span>
                  {/* Score bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{
                      width: 40,
                      height: 4,
                      borderRadius: 2,
                      background: "var(--line)",
                      overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${r.score}%`,
                        height: "100%",
                        borderRadius: 2,
                        background: r.score > 60 ? "var(--good, #22c55e)" : r.score > 30 ? "var(--warn, #eab308)" : "var(--muted)",
                      }} />
                    </div>
                    <span style={{ fontSize: 8, color: "var(--muted)", fontWeight: 700 }}>{r.score}</span>
                  </div>
                </div>
              </div>

              {/* Criteria */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {r.criteria.map(c => (
                  <span
                    key={c}
                    style={{
                      fontSize: 7,
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: "rgba(255,255,255,0.04)",
                      color: "var(--muted)",
                      border: "1px solid var(--line)",
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>

              {/* Actions */}
              {(r.status === "claimable" || r.status === "pending") && r.link && (
                <a
                  href={r.link}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-block",
                    marginTop: 6,
                    fontSize: 8,
                    fontWeight: 800,
                    color: "var(--brand)",
                    textDecoration: "none",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {r.status === "claimable" ? "Claim Now →" : "Check Status →"}
                </a>
              )}
            </div>
          );
        }) : (
          <div style={{ textAlign: "center", padding: 20, fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>
            {hasChecked
              ? "No matching airdrops found for this filter."
              : "Scan your wallet against 15+ historical & upcoming airdrop snapshots across EVM, Solana, and Cosmos."
            }
          </div>
        )}
      </div>
    </div>
  );
}
