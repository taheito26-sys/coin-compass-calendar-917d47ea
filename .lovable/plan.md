
# Phase 5: Social & Sentiment Deep-Dive

## 5A — Sentiment History Table & Enhanced Feed
- New `sentiment_history` table to store per-token sentiment snapshots over time (token_symbol, score, source, mentions, timestamp)
- Upgrade `sentiment-feed` edge function to store historical data points alongside the cache
- RLS: publicly readable, service_role writable

## 5B — Token Sentiment Trends Widget
- New `SentimentTrends` component showing per-token sentiment score over time (sparkline charts)
- Reddit mention count tracking with trend indicators (↑↓)
- Filterable by token from portfolio or search
- Compact mode for dashboard card integration

## 5C — Sentiment-Price Correlation Widget
- New `SentimentPriceCorrelation` component
- Dual-axis chart: sentiment score vs price movement over 7/30 days
- Pearson correlation coefficient displayed per token
- Highlights divergences (sentiment up + price down = potential opportunity)

## 5D — Community Health Score Widget
- New `CommunityHealth` component
- Composite score (0-100) per token based on: Reddit activity, sentiment consistency, mention growth rate, sentiment volatility
- Grade system (A-F) similar to Survivability Score
- Top/bottom community health tokens table

## 5E — Integration
- Add all 3 widgets to Dashboard card system
- Add "Sentiment Trends" and "Community Health" as sub-tabs on Opportunities page
- Update plan.md

## Database: `sentiment_history` table
- `id`, `token_symbol`, `sentiment_score` (0-100), `source` (reddit, aggregate), `mention_count`, `positive_mentions`, `negative_mentions`, `snapshot_date`, `created_at`
