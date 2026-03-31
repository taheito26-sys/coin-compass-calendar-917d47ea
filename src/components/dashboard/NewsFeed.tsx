import React, { useState, useEffect, useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";

interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  sentiment: "positive" | "negative" | "neutral";
  tags: string[];
}

export function NewsFeed() {
  const { state } = useCrypto();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const heldSymbols = useMemo(() => {
    return state.holdings.map(h => h.asset.toUpperCase());
  }, [state.holdings]);

  useEffect(() => {
    async function loadNews() {
      try {
        const res = await fetch("https://min-api.cryptocompare.com/data/v2/news/?lang=EN");
        const json = await res.json();
        const items = json.Data.map((n: any) => ({
          id: n.id,
          title: n.title,
          url: n.url,
          source: n.source,
          published_at: new Date(n.published_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          sentiment: n.sentiment || "neutral",
          tags: (n.categories || "").toUpperCase().split("|")
        }));
        
        // Filter by held coins if relevant
        const filtered = items.filter((n: any) => 
          heldSymbols.length === 0 || n.tags.some((t: string) => heldSymbols.includes(t))
        ).slice(0, 5);

        setNews(filtered.length > 0 ? filtered : items.slice(0, 5));
      } catch (err) {
        console.error("News Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadNews();
  }, [heldSymbols]);

  if (loading) return <div className="muted" style={{ padding: 20, textAlign: "center" }}>Scanning market signals...</div>;

  return (
    <div className="news-feed" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {news.map(item => (
        <a 
          key={item.id} href={item.url} target="_blank" rel="noreferrer"
          style={{ 
            display: "block", textDecoration: "none", color: "inherit",
            background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)",
            padding: "10px 12px", borderRadius: 10, transition: "transform 0.1s"
          }}
          onMouseEnter={e => e.currentTarget.style.transform = "translateX(4px)"}
          onMouseLeave={e => e.currentTarget.style.transform = "translateX(0)"}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: "var(--brand)", fontWeight: 800, textTransform: "uppercase" }}>{item.source}</span>
            <span style={{ fontSize: 9, color: "var(--muted2)" }}>{item.published_at}</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>{item.title}</div>
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
             <div style={{ 
               width: 6, height: 6, borderRadius: "50%", 
               background: item.sentiment === "positive" ? "var(--good)" : item.sentiment === "negative" ? "var(--bad)" : "var(--muted)" 
             }} />
             <span style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
               Sentiment: {item.sentiment}
             </span>
          </div>
        </a>
      ))}
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <button className="btn tiny secondary" style={{ fontSize: 9 }}>More Market Insights</button>
      </div>
    </div>
  );
}
