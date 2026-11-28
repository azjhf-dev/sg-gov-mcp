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

- Agent email approved. One signup attempt with an owner-approved contact
  number timed out unconfirmed (2026-11-20); the owner decided against
  resubmitting. If a key arrives by email, it is stored in the vault only.
- Tools: bus arrivals v3, bus services/routes/stops, train service alerts,
  traffic incidents/images, ERP rates, estimated travel times, EV charging.
- Documented threshold: 10 million calls/day in the ToS; no per-second limit
  published, so we keep our own conservative per-minute caps and per-endpoint
  caching anyway.

## Phase 4 - OneMap (geocoding, planning areas, population)

Done (iteration 4, 2026-11-21):

- Token flow via documented `/api/auth/post/getToken` (3-day JWT), token read
  from `ONEMAP_TOKEN` env var, never stored or logged by the server.
- Tools: `sg_onemap_search` (geocoding) and `sg_onemap_planning_areas`
  (names). Client cap 30/min per process under the email-stated 300/min.
- Owner approved one-time programmatic credential use 2026-11-21. No new
  signup; re-authenticate with the same flow when the token lapses.

Deferred:

- Boundary polygons, themes and population APIs (size/cost review first).
- Automatic token renewal. The official OneMap MCP gateway (5 req/s, burst
  10; 24h/30d tokens) remains a separate option with distinct auth/quotas.

## Phase 5 - More agencies and datasets

Done:

- SingStat Table Builder API (iteration 3): keyless search, metadata and
  bounded table slices over ~2,800 tables from 70 agencies. Documented
  100/min per IP; client cap 20/min per process. See docs/ITERATION-3.md.
- PUB flood alerts via the v2 real-time endpoint (iteration 6). See
  docs/ITERATION-6.md.
- Curated featured-datasets registry: HDB resale prices, MOM/SingStat
  labour series (iteration 7), SingStat CPI and NEA monthly rainfall
  (iteration 8), LTA annual motor vehicle population (iteration 9), HDB
  resale price index and MOE schools (iteration 10), LTA COE results and
  HDB carparks (iteration 11), each verified live once. See
  docs/ITERATION-7.md to docs/ITERATION-11.md.

Candidates, each with its own limit discovery first:

- URA (property transactions, car parks) - token required
- PUB water levels (currently a bulk poll-download dataset; deferred with
  the other bulk downloads)
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

## Iteration 12 checkpoint

Iterations 4-11 shipped OneMap, legacy v1 additions, PUB flood alerts (with
the observation-window semantics correction) and a curated
featured-datasets registry now at 11 entries (HDB resale, MOM/SingStat
labour, CPI, NEA rainfall, LTA vehicles, HDB RPI, MOE schools, LTA COE
results, HDB carparks). Next: more curated datasets (URA once token rules
allow), confirming populated flood-alerts readings during an actual alert,
or OneMap population/themes once an owner-approved one-time credential copy
exists (parent decision 2026-11-24: not now; ask via parent when chosen).
Do not resubmit the LTA signup (owner decision, 2026-11-20); a key arriving
by email goes to the vault only. Push and post a short Slack report. No new
spend, no workflow files, no quota workarounds.
