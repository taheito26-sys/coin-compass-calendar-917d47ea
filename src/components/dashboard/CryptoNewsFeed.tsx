import { useState, useEffect } from "react";
import { useCrypto } from "@/lib/cryptoContext";

interface NewsItem {
  id: number; title: string; url: string; published_at: string;
  source: { title: string; domain: string };
  currencies?: { code: string; title: string }[];
  votes: { positive: number; negative: number; };
}

function timeAgo(dateStr: string): string {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function CryptoNewsFeed() {
  const { state } = useCrypto();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "portfolio">("portfolio");
  const [error, setError] = useState("");

  const heldSymbols = new Set(state.txs.map(t => t.asset.toUpperCase()));

  useEffect(() => {
    setLoading(true);
    setError("");
    // CryptoPanic public endpoint — no API key needed for basic news
    const currenciesParam = filter === "portfolio" && heldSymbols.size > 0
      ? `&currencies=${[...heldSymbols].slice(0, 5).join(",")}`
      : "";
    fetch(`https://cryptopanic.com/api/free/v1/posts/?auth_token=free&kind=news${currenciesParam}&public=true`)
      .then(r => r.json())
      .then(d => {
        if (d?.results) setNews(d.results.slice(0, 20));
        else setError("Could not load news.");
      })
      .catch(() => setError("News unavailable. Check CORS or network."))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="panel">
      <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Crypto News</span>
        <div style={{ display: "flex", gap: 4 }}>
          {(["portfolio","all"] as const).map(f => (
            <button key={f} className={`btn tiny${f === filter ? "" : " secondary"}`}
              style={{ fontSize: 10, padding: "2px 8px" }} onClick={() => setFilter(f)}>
              {f === "portfolio" ? "My Coins" : "All"}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {loading ? (
          <div className="muted" style={{ padding: 24, textAlign: "center" }}>Loading news...</div>
        ) : error ? (
          <div className="muted" style={{ padding: 24, textAlign: "center", fontSize: 12 }}>{error}</div>
        ) : (
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {news.map(n => (
              <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer"
                style={{ display: "block", padding: "10px 14px", borderBottom: "1px solid var(--line)", textDecoration: "none", color: "var(--text)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--panel2)")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, flex: 1 }}>{n.title}</div>
                  <span className="muted" style={{ fontSize: 10, flexShrink: 0 }}>{timeAgo(n.published_at)}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                  <span className="muted" style={{ fontSize: 10 }}>{n.source.domain}</span>
                  {n.currencies?.slice(0, 3).map(c => (
                    <span key={c.code} style={{ fontSize: 9, background: "var(--brand3)", color: "var(--brand)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>{c.code}</span>
                  ))}
                  {(n.votes.positive > 0 || n.votes.negative > 0) && (
                    <span className="muted" style={{ fontSize: 10, marginLeft: "auto" }}>
                      +{n.votes.positive} -{n.votes.negative}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
