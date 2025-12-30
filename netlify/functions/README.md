# FHM MabelCoins - Phase 3 (Coins API)

## What’s included
Netlify Functions (CommonJS):
- netlify/functions/coins-balance.js
- netlify/functions/coins-history.js
- netlify/functions/coins-award.js
- netlify/functions/coins-spend.js
- netlify/functions/lib/auth.js (shared JWT verification like auth-me.js)

## Requirements
Env vars (Netlify):
- JWT_SECRET (same one used by your auth functions)
- DATABASE_URL or DB_URL (same as your existing db.js)

DB tables must exist (Phase 2):
- fhm_wallets
- fhm_coin_ledger
- fhm_coin_daily_caps

## Notes
- Earn cap is hardcoded to 100 in these functions (as per Phase 0).
- Idempotency is enforced with UNIQUE(user_id, ref_id) in fhm_coin_ledger.
- Advisory locks are used per-user to avoid race issues when awarding/spending.

## Endpoints
- GET  /.netlify/functions/coins-balance
- GET  /.netlify/functions/coins-history?limit=50&cursor=...
- POST /.netlify/functions/coins-award
  body: { amount, type:'EARN'|'BONUS', reason, refId, meta? }
- POST /.netlify/functions/coins-spend
  body: { amount, reason, refId, meta? }
