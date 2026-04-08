
# Phase 1: Signal Integrity Foundation ✅

- `source_reliability`, `event_classification`, `risk_signal_aggregate` tables
- `risk-engine` edge function with 5-min pg_cron schedule
- Risk Intelligence panel on Opportunities page

# Phase 2: Portfolio Risk Control ✅

- **Concentration Risk Detector** — HHI index, single-asset thresholds, top-N alerts, weight bars with ideal drift
- **Correlation Risk Analyzer** — Pearson correlation heatmap, diversification score, high-corr/hedge pair detection

# Phase 3: Market Stability Monitoring ✅

- **Liquidity Collapse Warning** — 24h volume analysis, volume/mcap ratio, price-drop severity alerts
- **Order Book Depth Analyzer** — composite depth score (volume, mcap, volatility), slippage estimates, thin-market detection

# Phase 4: Opportunity Discovery ✅

- **Early Stage Project Radar** — scans listing_events, multi-factor radar score (exchange presence, recency, confidence, event diversity)
- **Project Survivability Score** — 5-factor grading (A-F): exchange presence, event health, risk level, longevity, confidence. Factor breakdown visualization.

## All 6 new widgets integrated into configurable Dashboard card system with compact mode support.
