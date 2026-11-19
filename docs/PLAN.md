# sg-gov-mcp: long-term horizontal plan

Goal: one MCP server that exposes Singapore government open data across many
agencies and datasets, with correct per-source rate limiting, caching and
tests. "Horizontal" = breadth across agencies, not depth on one dataset.

Rate-limit rule for every phase: limits are discovered from documentation
first, verified with gentle live probing, and then enforced client-side with
headroom. Limits are obeyed, never worked around.

## Phase 0 - Discovery (done, 2026-11-20)

- Measured data.gov.sg v2 real-time keyless limit live: exactly 6 requests per
  10s, 429 on the 7th, recovery after 10s. 404s do not consume quota. No
  Retry-After or X-RateLimit headers; the 429 body says to retry in 10s.
- Mapped the working keyless v2 real-time endpoints and the legacy v1 ones.
- Collected documented limits for data.gov.sg keyed tiers, LTA DataMall and
  OneMap. Full evidence: docs/RATE-LIMITS.md.

## Phase 1 - Keyless real-time core (this iteration)

- Dependency-free MCP stdio server.
- 12 tools: NEA environment + weather (v2), taxi/carpark (legacy v1).
- Token-bucket limiter, caching, single-retry 429 handling, smoke test.
- Repo published: github.com/azjhf-dev/sg-gov-mcp

## Phase 2 - data.gov.sg API key + dataset search

- Sign up on data.gov.sg for a **Developer API key** (needs an email OTP;
  owner decision on which email to use). Dev key lifts limits to 12/10s
  real-time, 8/10s datastore, 4/10s downloads.
- Add Dataset Search / Datastore tools (the catalogue's tabular datasets,
  e.g. data.gov.sg/datasets). Discover the exact datastore route against the
  live API first; docs mention quotas of 4-5 requests per window/minute.
- Add dataset-download tools (initiate-download -> poll-download flow).

## Phase 3 - LTA DataMall

- Free AccountKey signup (instant, email-based). Owner decision on email.
- Tools: bus arrivals v3, bus services/routes/stops, train service alerts,
  traffic incidents/images, ERP rates, estimated travel times, EV charging.
- Documented threshold: 10 million calls/day in the ToS; no per-second limit
  published, so we keep our own conservative per-minute caps and per-endpoint
  caching anyway.

## Phase 4 - OneMap (geocoding, planning areas, population)

- SLA already operates an official OneMap MCP gateway (5 req/s per token,
  burst 10; 24h access token, 30d refresh). Options:
  a. Integrate OneMap's REST APIs directly (token auth, 3-day JWT), or
  b. Document the official MCP as the recommended path and only wrap what it
     lacks.
- Decision point for the owner; a OneMap account signup is required either way.

## Phase 5 - More agencies and datasets

Candidates, each with its own limit discovery first:

- SingStat Table Builder API (economy, population, households)
- URA (property transactions, car parks) - token required
- PUB (water levels, flood alerts via data.gov.sg real-time additions)
- MOM / SingStat labour statistics via datastore
- data.gov.sg collections API for catalogue browsing as a tool
- IPOS trademarks/patents (newly onboarded to data.gov.sg)

## Cross-cutting work (every phase)

- Keep `src/sources.js` as the single registry: endpoint, agency, update
  cadence, cache TTL, client bucket, auth requirement.
- Extend the smoke test per phase; add an offline replay test with recorded
  fixtures so CI does not need the network or quota.
- Re-measure upstream limits occasionally and gently; record results in
  docs/RATE-LIMITS.md with dates.
- Slack: post every iteration to #sg-gov-mcp in the ash-lab workspace.
- GitHub token has repo scope only, so no GitHub Actions workflows until the
  owner adds the workflow scope. Tests run locally for now.
