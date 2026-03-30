import { useState } from "react";
import { fmtFiat, fmtQty } from "@/lib/cryptoState";

interface AddressBalance {
  address: string;
  balance: number; // satoshis or smallest unit
  txCount: number;
}

interface XPubResult {
  chain: string;
  totalBalance: number;
  unit: string;
  addresses: AddressBalance[];
  error?: string;
}

const SUPPORTED_CHAINS = [
  { id: "btc", label: "Bitcoin (BTC)", unit: "BTC", divisor: 1e8, explorer: "https://blockstream.info/api" },
  { id: "eth", label: "Ethereum (ETH)", unit: "ETH", divisor: 1e18, explorer: "https://api.etherscan.io/api" },
];

async function lookupXPub(xpub: string, chain: string): Promise<XPubResult> {
  const chainDef = SUPPORTED_CHAINS.find(c => c.id === chain);
  if (!chainDef) throw new Error("Unsupported chain");

  if (chain === "btc") {
    // Use BlockCypher public API (no key needed for basic)
    const res = await fetch(`https://api.blockcypher.com/v1/btc/main/addrs/${xpub}/balance`);
    if (!res.ok) throw new Error("BlockCypher API error — verify xPub is valid");
    const data = await res.json();
    return {
      chain: "BTC",
      totalBalance: data.balance / 1e8,
      unit: "BTC",
      addresses: [{ address: xpub.slice(0, 16) + "...", balance: data.balance, txCount: data.n_tx }],
    };
  } else if (chain === "eth") {
    // For ETH address (not xpub, ETH uses addresses)
    const res = await fetch(`https://api.etherscan.io/api?module=account&action=balance&address=${xpub}&tag=latest`);
    if (!res.ok) throw new Error("Etherscan API error");
    const data = await res.json();
    if (data.status !== "1") throw new Error(data.message || "Address lookup failed");
    const balance = parseInt(data.result) / 1e18;
    return {
      chain: "ETH",
      totalBalance: balance,
      unit: "ETH",
      addresses: [{ address: xpub, balance: parseInt(data.result), txCount: 0 }],
    };
  }

  throw new Error("Chain not implemented");
}

export default function XPubImportPage() {
  const [xpub, setXpub] = useState("");
  const [chain, setChain] = useState("btc");
  const [result, setResult] = useState<XPubResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLookup = async () => {
    if (!xpub.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const r = await lookupXPub(xpub.trim(), chain);
      setResult(r);
    } catch (e: any) {
      setError(e.message || "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontWeight: 800, fontSize: 22, margin: 0 }}>Hardware Wallet / xPub Import</h2>
        <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
          Enter an xPub key (Ledger/Trezor) or wallet address to look up balances on-chain.
          Read-only — no private keys needed.
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">Lookup Address / xPub</div>
        <div className="panel-body">
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {SUPPORTED_CHAINS.map(c => (
              <button key={c.id} className={`btn${c.id === chain ? "" : " secondary"}`}
                style={{ fontSize: 12, padding: "5px 14px" }} onClick={() => setChain(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="inp" style={{ flex: 1 }} value={xpub} onChange={e => setXpub(e.target.value)}
              placeholder={chain === "btc" ? "xpub6C... or bc1..." : "0x..."} />
            <button className="btn" onClick={handleLookup} disabled={loading || !xpub.trim()}>
              {loading ? "Checking..." : "Lookup"}
            </button>
          </div>
          {error && <div className="bad" style={{ marginTop: 8, fontSize: 12 }}>{error}</div>}
          <p className="muted" style={{ fontSize: 10, marginTop: 8 }}>
            Your xPub or address is sent directly to the blockchain API (BlockCypher / Etherscan). For maximum privacy, use a read-only view key or separate watch-only address.
          </p>
        </div>
      </div>

      {result && (
        <div className="panel">
          <div className="panel-head">Lookup Result — {result.chain}</div>
          <div className="panel-body">
            <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
              <div className="kpi-card">
                <div className="kpi-lbl">Total Balance</div>
                <div className="kpi-val mono">{result.totalBalance.toFixed(8)} {result.unit}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-lbl">Addresses Found</div>
                <div className="kpi-val">{result.addresses.length}</div>
              </div>
            </div>
            <div className="tableWrap">
              <table style={{ width: "100%" }}>
                <thead><tr><th>Address</th><th>Balance</th><th>Tx Count</th></tr></thead>
                <tbody>
                  {result.addresses.map((a, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ fontSize: 11 }}>{a.address}</td>
                      <td className="mono">{(a.balance / (result.unit === "BTC" ? 1e8 : 1e18)).toFixed(8)} {result.unit}</td>
                      <td>{a.txCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 14 }}>
              <p className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
                To add this balance to your portfolio, manually enter a transaction in the Ledger (type: transfer_in).
                Full automatic on-chain tx import coming soon.
              </p>
              <button className="btn secondary" style={{ fontSize: 11 }}
                onClick={() => { setResult(null); setXpub(""); }}>
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
