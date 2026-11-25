# Rate limits: discovered and documented

Method: official documentation first, then small functional checks that stay
within documented quotas. Never intentionally cause HTTP 429.

Correction, iteration 2 (2026-11-20): the initial boundary measurement below
made a seventh request against a documented 6/10s cap. That exceeded the
published limit and should not have been described as compliant. It is kept
as historical evidence, not a method to repeat. The boundary-probing script
has been removed. All iteration-2 live checks were within documented limits.

## data.gov.sg platform (api-open.data.gov.sg)

Documented: https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits,
window resets every 10 seconds:

| API family | Keyless | Dev key | Prod key |
|---|---|---|---|
| v2 real-time | 6 / 10s | 12 / 10s | 30 / 10s |
| Datastore Search | 4 / 10s | 8 / 10s | 20 / 10s |
| Dataset Downloads | 2 / 10s | 4 / 10s | 10 / 10s |

Measured, keyless, v2 real-time:

- Exactly 6 successful requests, then the 7th within the same window returns
  HTTP 429. Reproduced twice on different endpoints (pm25, psi).
- 429 body: `Rate limit exceeded. Please try again in 10 seconds and sign up
  for an API key for higher rate limits.` (code 24, TOO_MANY_REQUESTS).
- No `Retry-After` header and no `X-RateLimit-*` headers on 200 or 429.
- Recovery: first request ~10s after the 429 succeeds.
- 404 responses did NOT consume quota (observed: 6 valid 200s interleaved
  with 4 x 404 in one window still passed; the next valid request 429'd).
- Our client-side cap: 5 requests / 10s (headroom), plus caching.

Note: the dataset-download guide separately mentions "quota of 5 requests per
minute", which conflicts with the 2/10s table above. Unresolved; treat the
stricter number as true until measured.

### Working keyless v2 real-time endpoints (measured 2026-11-20)

`pm25`, `psi`, `uv`, `two-hr-forecast`, `twenty-four-hr-forecast`,
`air-temperature`, `rainfall`, `relative-humidity`, `wind-direction`,
`wind-speed`. All at `https://api-open.data.gov.sg/v2/real-time/api/<name>`,
optional `?date=` filter, all return `code: 0` on success.

### Working keyless v1 endpoints added 2026-11-22

`environment/4-day-weather-forecast` (4 daily outlooks),
`transport/traffic-images` (8 cameras at check time, image links on
images.data.gov.sg).

### Working keyless v2 endpoints added 2026-11-23

`weather/flood-alerts` (PUB): real-time flood alert events, updated every 2
minutes per the dataset page. Response envelope is `data.records` (not
`items`) plus a `paginationToken`. Verified with one request: 200, `code: 0`,
empty records list (no active alerts at check time). Uses the same v2 keyless
bucket (measured 6/10s; client cap 5/10s) with a 2-minute cache. Record shape
documented from the official OpenAPI spec (2026-11-25): each record carries
`datetime`, `updatedTimestamp` and `item` (CAP envelope) with `readings[]`
(area/headline/description/severity/urgency/instruction; area circle radius
is the broadcasting radius, not flood extent).

404 (not present under these names): `four-day-forecast`,
`four-day-weather-forecast`, `uv-index`, `taxi`, `taxi-availability`,
`carpark`, `carpark-availability`, `traffic-images`, `flood-warnings`,
`dengue`, `hawker-centres`.

## Legacy api.data.gov.sg v1 (keyless)

- Still live for `environment/*` (including `4-day-weather-forecast`, which
  has no v2 equivalent) and `transport/taxi-availability`,
  `transport/carpark-availability`, `transport/traffic-images`.
- No documented rate limit found. Measured: 10 rapid requests all 200, no
  429, no rate-limit headers. We still self-cap at 5 req/10s and cache.
- data.gov.sg is migrating services to the new platform; these endpoints may
  be retired. Watch for redirects/deprecation notices.
- Iteration 5 (2026-11-22): `transport/estimated-travel-times` returned HTTP
  403 on one request. Not retried; not available keyless.

## LTA DataMall (datamall2.mytransport.sg)

- Requires a free AccountKey (email signup, instant). Not yet obtained.
- Documented (API Terms of Service): up to 10 million calls/day ("the
  Threshold"); exceeding it may suspend access. No per-second limit
  published. 500 records per call; `$skip` pagination.
- Plan: conservative self-imposed per-minute caps per endpoint regardless.

## Dataset APIs: iteration-2 checks (2026-11-20, about 09:02 SGT)

Official docs:
- https://guide.data.gov.sg/developer-guide/dataset-apis/search-and-filter-within-dataset
- https://guide.data.gov.sg/developer-guide/dataset-apis/list-all-datasets
- https://guide.data.gov.sg/developer-guide/dataset-apis/get-dataset-metadata
- https://guide.data.gov.sg/developer-guide/dataset-apis/list-rows-of-dataset

Live outcomes:
- `https://data.gov.sg/api/action/datastore_search` returned 200 with HDB
  data. Verified exact filters, fields, sort, offset and limit=2.
- `limit=0` returned 200 with a headers-only object, not dataset fields.
  Schema tool therefore requests one row and discards the row content.
- Projected queries returned `fields` entries as empty objects; use the
  unprojected schema tool to inspect column names and types.
- Documented `api-production.data.gov.sg` catalogue and metadata routes
  returned 403 on one request each. Stopped; no alternate-host bypass.
  Tools for those routes remain unimplemented.
- Dataset requests share **3/10s** per process, below the documented **4/10s**.
  No boundary/429 probing was performed in this iteration.

## OneMap (SLA)

- REST APIs use token auth: POST `/api/auth/post/getToken` with the account's
  email/password returns a JWT valid for 3 days (401 when expired; re-run
  getToken to renew). Current docs read 2026-11-21:
  https://www.onemap.gov.sg/apidocs/authentication.
- Official OneMap MCP gateway exists (hosted by SLA on AWS Bedrock AgentCore):
  24h access token, 30d refresh token, **5 requests/second per token, burst
  10, 429 + exponential backoff recommended**.
- Sources: https://www.onemap.gov.sg/apidocs/authentication and
  https://www.onemap.gov.sg/apidocs/mcp/ (read 2026-11-20).
- Signup confirmation states 300 calls/minute for regular APIs. This is an
  email claim, not an independently measured quota. Although 300/min and
  5/sec have equal averages, they do NOT establish interchangeable burst
  rules, quota scope or token systems. Never combine them.
- Iteration 4 (2026-11-21): implemented `sg_onemap_search` (geocoding) and
  `sg_onemap_planning_areas` (names). Server reads the token from the
  `ONEMAP_TOKEN` env var, never stores or logs it. Client cap 30/min per
  process. Live checks: geocode and names both 200. No 429 observed or
  provoked. Polygons/themes/population not wrapped yet.

## SingStat Table Builder (tablebuilder.singstat.gov.sg)

Documented: https://www.tablebuilder.singstat.gov.sg/view-api/for-developers
(read 2026-11-21, with OpenAPI spec).

- 100 calls/minute per IP address, keyless, no signup.
- Our client-side cap: 20 requests/minute per process, plus caching
  (search/metadata 1h, table data 15min).
- Functional checks 2026-11-21 (~08:38-08:48 SGT): resourceid search,
  metadata and tabledata all returned HTTP 200 with documented shapes.
  No 429 observed or provoked; no rate-limit headers seen.
- `tabledata` `limit` semantics shift when `sortBy` is present (columns per
  row vs rows). Recorded in docs/ITERATION-3.md.
- The gateway intermittently hangs requests (10s+ stalls, zero bytes, then
  recovery) for both curl and Node clients. Not quota-shaped. Handled by
  15s timeout plus one paced retry; do not add parallelism to compensate.
- Detailed-trade-only parameters (cursor, markets, tradeTypes, searchoption)
  are not implemented.

## Signup state (2026-11-20)

- data.gov.sg developer key created and stored securely. One-time
  programmatic check approved and run 2026-11-20 (keyless limits unchanged;
  keyed PM2.5 returned 403, datastore 200); the copied key was deleted.
  Keyed-tier limits remain documented, not measured.
- OneMap account created 2026-11-20; owner approved one-time programmatic
  credential use 2026-11-21. Token flows through `ONEMAP_TOKEN` only; nothing
  secret is stored by the server.
- LTA DataMall form not submitted: permission for a required contact number
  remains pending. No AccountKey has been obtained.

Update 2026-11-20/21: an LTA form submission was attempted once with an
owner-approved contact number; the submit click timed out and no confirmation
or key email arrived. The owner decided not to resubmit. Any future key email
goes to the vault only.

Secrets are never stored in this repository or posted to Slack.

## Enforcement scope

In iteration 2, a 429 pauses its entire quota group. Retry-After seconds and
HTTP-date forms are honored, with a minimum wait of 10.5s. At most one retry.
Long Retry-After values return an error early but leave the group paused.
403s are terminal. Concurrent identical requests share a fetch. All of these
paths are tested offline, not by provoking live errors.

Buckets are per process. Shared egress, multiple processes, other clients or
future replicas need coordinated budgets or a shared limiter. The prototype
cannot ensure the aggregate behavior of unrelated clients.
