# sg-gov-mcp: long-term horizontal plan

Goal: one MCP server that exposes Singapore government open data across many
agencies and datasets, with correct per-source rate limiting, caching and
tests. "Horizontal" = breadth across agencies, not depth on one dataset.

Rate-limit rule for every phase: limits are discovered from documentation
first, verified with gentle live probing, and then enforced client-side with
headroom. Limits are obeyed, never worked around.

## Phase 0 - Initial discovery (historical, 2026-11-20)

- Measured data.gov.sg v2 real-time keyless limit live: exactly 6 requests per
  10s, 429 on the 7th, recovery after 10s. 404s do not consume quota. No
  Retry-After or X-RateLimit headers; the 429 body says to retry in 10s.
- Mapped the working keyless v2 real-time endpoints and the legacy v1 ones.
- Collected documented limits for data.gov.sg keyed tiers, LTA DataMall and
  OneMap. Full evidence: docs/RATE-LIMITS.md.

## Phase 1 - Keyless real-time core (done, iteration 1)

- Dependency-free MCP stdio server.
- 12 tools: NEA environment + weather (v2), taxi/carpark (legacy v1).
- Token-bucket limiter, caching, single-retry 429 handling, smoke test.
- Repo published: github.com/azjhf-dev/sg-gov-mcp

## Phase 2 - General tabular datasets (iteration 2 implemented; partial)

Done: dataset rows/schema for arbitrary tabular IDs, exact filters, column
projection, sorting, bounded explicit pagination, offline captured fixtures,
shared 429 cooldown, Retry-After, single-flight requests and bounded cache.

Blocked or deferred:
- Developer key exists; programmatic use awaits owner approval. Keep keyless
  limits even after adding auth until the selected tier is verified safely.
- Catalogue/metadata docs point to a host that returned 403. Stop there;
  no catalogue tool or alternate-host workaround. Existing dataset IDs work.
- Bulk downloads need a conservative resolution of conflicting documented
  limits before implementation. No automatic initiate/poll loop yet.

## Phase 3 - LTA DataMall

- Agent email approved. Form still needs permission for a required contact
  number; not submitted. Do not invent a number or use one without consent.
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
- OneMap account created. Regular REST API uses a 3-day token. Current
  authentication docs show `/api/auth/post/getToken`, not the older path.
- Next iteration: safe one-at-a-time token/auth support and geocoding tests,
  only after secure programmatic credential access. Keep MCP gateway auth
  separate; average rate arithmetic does not prove identical quotas.

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
- Re-read upstream limit docs when adding a source. Use within-quota
  functional checks only; never deliberately provoke 429. Record evidence
  and uncertainty in docs/RATE-LIMITS.md.
- A distributed deployment needs shared quota state; this prototype's
  in-memory limiter is per process, not horizontally scalable.
- Slack: post every iteration to #sg-gov-mcp in the ash-lab workspace.
- GitHub token has repo scope only, so no GitHub Actions workflows until the
  owner adds the workflow scope. Tests run locally for now.

## Iteration 3 checkpoint

Add OneMap auth/geocoding if secure credential access is granted. Otherwise
continue independent keyless breadth via SingStat, first reading its current
docs and quotas, with fixture tests and small live checks. Revisit LTA only
after permission for the contact number. Push and post a short Slack report.
No new spend, no workflow files, no quota workarounds.
