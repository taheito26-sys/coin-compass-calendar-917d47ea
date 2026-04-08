
# Phase 1: Signal Integrity Foundation ✅

## Deliverables

### 1. Database Tables (Migration)
- `source_reliability` — tracks trust scores per event source (0-100)
- `event_classification` — classifies events as RUMOR/LEAK/UNCONFIRMED/CONFIRMED/OFFICIAL/LIVE
- `risk_signal_aggregate` — per-token risk score aggregation

### 2. Edge Function: `risk-engine`
- Processes all listing_events against source reliability scores
- Auto-classifies events based on source trust thresholds
- Computes per-token risk scores from aggregated signals
- Scheduled via pg_cron every 5 minutes

### 3. Frontend: Risk Intelligence Panel
- "Risk" sub-tab on Opportunities page
- Source reliability table, event classification badges, per-token risk cards

---

# Phase 2: Portfolio Risk Control ✅

## Deliverables

### 1. Concentration Risk Detector (`ConcentrationRisk.tsx`)
- HHI (Herfindahl-Hirschman Index) calculation
- Single-asset thresholds (30% warn, 50% danger)
- Top-N concentration alerts (top 2 > 60%, top 3 > 80%)
- Visual weight bars with ideal-weight benchmark lines
- Drift indicators showing over/under-weight vs equal-weight

### 2. Correlation Risk Analyzer (`CorrelationMatrix.tsx`)
- Pairwise Pearson correlation from 7-day sparkline price data
- Heatmap matrix with color-coded cells
- Diversification Score (0-100)
- Highlights high-correlation pairs (risk) and inverse pairs (hedges)
- Summary metrics: avg correlation, high-corr pair count, hedge count

### 3. Dashboard Integration
- Both widgets added to configurable dashboard card system
- Compact mode support for dashboard grid

---

# Phase 3: Market Stability Monitoring (Next)
- Liquidity Collapse Warning
- Order Book Depth Collapse Detector

# Phase 4: Opportunity Discovery (Future)
- Early Stage Project Radar
- Project Survivability Score
