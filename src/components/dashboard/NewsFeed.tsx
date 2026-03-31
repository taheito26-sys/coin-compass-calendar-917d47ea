import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useCrypto } from "@/lib/cryptoContext";

interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  sentiment: "positive" | "negative" | "neutral";
  tags: string[];
  domain?: string;
}

type FeedSource = "all" | "portfolio";

export function NewsFeed() {
  const { state } = useCrypto();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedSource, setFeedSource] = useState<FeedSource>("portfolio");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 6;

  const heldSymbols = useMemo(() => {
    return state.holdings?.map(h => h.asset.toUpperCase()) ?? [];
  }, [state.holdings]);

  const loadNews = useCallback(async () => {
    setLoading(true);
    try {
      // Use CryptoPanic public API (no key needed for basic access)
      const currencies = feedSource === "portfolio" && heldSymbols.length > 0
        ? heldSymbols.slice(0, 10).join(",")
        : "";

      const params = new URLSearchParams({
        auth_token: "free", // CryptoPanic allows limited free access
        public: "true",
      });
      if (currencies) params.set("currencies", currencies);

      // Primary: CryptoPanic
      let items: NewsItem[] = [];

      try {
        const res = await fetch(`https://cryptopanic.com/api/free/v1/posts/?${params}`);
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.results)) {
            items = json.results.map((n: any) => {
              const votes = n.votes || {};
              const pos = (votes.positive || 0) + (votes.liked || 0);
              const neg = (votes.negative || 0) + (votes.disliked || 0);
              const sentiment: "positive" | "negative" | "neutral" =
                pos > neg + 2 ? "positive" : neg > pos + 2 ? "negative" : "neutral";

              return {
                id: String(n.id),
                title: n.title,
                url: n.url,
                source: n.source?.title || n.domain || "Unknown",
                domain: n.domain || "",
                published_at: new Date(n.published_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                sentiment,
                tags: (n.currencies || []).map((c: any) => c.code?.toUpperCase()).filter(Boolean),
              };
            });
          }
        }
      } catch {
        // CryptoPanic failed, fall through to fallback
      }

      // Fallback: CryptoCompare
      if (items.length === 0) {
        const res = await fetch("https://min-api.cryptocompare.com/data/v2/news/?lang=EN");
        const json = await res.json();
        if (Array.isArray(json.Data)) {
          const mapped = json.Data.map((n: any) => ({
            id: String(n.id),
            title: n.title,
            url: n.url,
            source: n.source,
            published_at: new Date(n.published_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            sentiment: (n.sentiment === "positive" ? "positive" : n.sentiment === "negative" ? "negative" : "neutral") as NewsItem["sentiment"],
            tags: (n.categories || "").toUpperCase().split("|"),
          }));

          if (feedSource === "portfolio" && heldSymbols.length > 0) {
            const filtered = mapped.filter((n: NewsItem) =>
              n.tags.some(t => heldSymbols.includes(t))
            );
            items = filtered.length > 0 ? filtered : mapped;
          } else {
            items = mapped;
          }
        }
      }

      setNews(items.slice(0, 30));
    } catch (err) {
      console.error("News Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  }, [heldSymbols, feedSource]);

  useEffect(() => {
    loadNews();
    const interval = setInterval(loadNews, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [loadNews]);

  const paginatedNews = useMemo(() => {
    return news.slice(0, page * PAGE_SIZE);
  }, [news, page]);

  const hasMore = paginatedNews.length < news.length;

  const sentimentColor = (s: string) =>
    s === "positive" ? "var(--good, #22c55e)" : s === "negative" ? "var(--bad, #ef4444)" : "var(--muted)";

  const sentimentIcon = (s: string) =>
    s === "positive" ? "↑" : s === "negative" ? "↓" : "•";

  if (loading && news.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>
          Scanning market signals...
        </div>
      </div>
    );
  }

  return (
    <div className="news-feed" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {(["portfolio", "all"] as FeedSource[]).map(src => (
          <button
            key={src}
            onClick={() => { setFeedSource(src); setPage(1); }}
            className="pill"
            style={{
              fontSize: 8,
              padding: "3px 8px",
              cursor: "pointer",
              background: feedSource === src ? "var(--brand)" : "var(--panel2)",
              color: feedSource === src ? "#fff" : "var(--muted)",
              border: "1px solid var(--line)",
              borderRadius: 999,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {src === "portfolio" ? "My Portfolio" : "All Crypto"}
          </button>
        ))}
        {loading && (
          <span style={{ fontSize: 8, color: "var(--muted)", marginLeft: "auto", alignSelf: "center" }}>
            Updating...
          </span>
        )}
      </div>

      {/* News items */}
      {paginatedNews.map(item => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--line)",
            padding: "10px 12px",
            borderRadius: 10,
            transition: "transform 0.1s, border-color 0.2s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = "translateX(4px)";
            e.currentTarget.style.borderColor = "var(--brand)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = "translateX(0)";
            e.currentTarget.style.borderColor = "var(--line)";
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: "var(--brand)", fontWeight: 800, textTransform: "uppercase" }}>
              {item.source}
            </span>
            <span style={{ fontSize: 9, color: "var(--muted2)" }}>{item.published_at}</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>{item.title}</div>
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{
                fontSize: 10,
                fontWeight: 900,
                color: sentimentColor(item.sentiment),
              }}>
                {sentimentIcon(item.sentiment)}
              </span>
              <span style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {item.sentiment}
              </span>
            </div>
            {item.tags.slice(0, 3).map(tag => (
              <span
                key={tag}
                style={{
                  fontSize: 8,
                  padding: "1px 5px",
                  borderRadius: 4,
                  background: "var(--panel2)",
                  color: "var(--brand)",
                  fontWeight: 700,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </a>
      ))}

      {news.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: 20, fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>
          No news found for your held assets. Try switching to "All Crypto".
        </div>
      )}

      {hasMore && (
        <div style={{ textAlign: "center", marginTop: 4 }}>
          <button
            className="btn tiny secondary"
            style={{ fontSize: 9 }}
            onClick={() => setPage(p => p + 1)}
          >
            Load More ({news.length - paginatedNews.length} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
