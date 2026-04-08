## Implementation Plan

### Phase 1: Database Schema
Create all required tables via migration:
- `listing_sources` — exchange source registry
- `listing_events` — normalized listing/delisting/airdrop events
- `airdrop_projects` — airdrop tracking
- `airdrop_tasks` + `user_airdrop_progress` — task completion tracking
- `token_risk_flags` — risk warnings

### Phase 2: Edge Function — `opportunity-ingest`
- Fetches announcements from Binance, Coinbase, KuCoin, OKX, Bybit via their public announcement APIs
- Fetches new coins from CoinGecko
- Normalizes events, deduplicates via SHA-256 hash within 30-min window
- Computes confidence scores and lead time
- Stores results in `listing_events`

### Phase 3: UI — Opportunities Page
- New page with 4 tabs: Listings, Airdrops, New Assets, Delistings
- Filterable/sortable tables
- Confidence badges, lead time display
- In-app toast alerts for high-confidence events

### Phase 4: Navigation + Scheduler
- Add "Opportunities" to sidebar navigation
- Add route in App.tsx
- Document cron setup for 5/10/15 min polling

### Scope Lock
- No changes to Portfolio, Ledger, Calendar, Vault, Settings
- No trading execution or wallet integration
- No social media rumor ingestion
