
# Phase 1: Signal Integrity Foundation

## Deliverables

### 1. Database Tables (Migration)
- `source_reliability` — tracks trust scores per event source (0-100)
- `event_classification` — classifies events as RUMOR/LEAK/UNCONFIRMED/CONFIRMED/OFFICIAL/LIVE
- `risk_signal_aggregate` — per-token risk score aggregation

### 2. Edge Function: `risk-engine`
- Processes all listing_events against source reliability scores
- Auto-classifies events based on source trust thresholds
- Computes per-token risk scores from aggregated signals
- Persists results to DB for frontend consumption
- Scheduled via pg_cron every 5 minutes

### 3. Frontend: Risk Intelligence Panel
- New "Risk" sub-tab on Opportunities page
- Source reliability table with trust scores
- Event classification badges (RUMOR → OFFICIAL)
- Per-token risk score cards with level indicators
- Real-time updates from DB cache

## Phase Gate
- ≥95% of event sources classified
- All scores explainable and deterministic
- No AI black boxes

## NOT included in Phase 1
- Phases 2-4 (sequential — built after Phase 1 gate passes)
