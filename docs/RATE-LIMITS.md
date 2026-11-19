# Rate limits: discovered and documented

Method note: "documented" = official docs; "measured" = gentle live probing on
2026-11-20 ~00:33-00:36 SGT (small request counts, immediate stop on first
429, full window waited before any retry). We never probed harder than the
documented limit.

## data.gov.sg platform (api-open.data.gov.sg)

Documented (guide.data.gov.sg/developer-guide/api-overview/api-rate-limits),
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

404 (not present under these names): `four-day-forecast`,
`four-day-weather-forecast`, `uv-index`, `taxi`, `taxi-availability`,
`carpark`, `carpark-availability`, `traffic-images`, `flood-warnings`,
`dengue`, `hawker-centres`.

## Legacy api.data.gov.sg v1 (keyless)

- Still live for `environment/*` and `transport/taxi-availability`,
  `transport/carpark-availability`.
- No documented rate limit found. Measured: 10 rapid requests all 200, no
  429, no rate-limit headers. We still self-cap at 5 req/10s and cache.
- data.gov.sg is migrating services to the new platform; these endpoints may
  be retired. Watch for redirects/deprecation notices.

## LTA DataMall (datamall2.mytransport.sg)

- Requires a free AccountKey (email signup, instant). Not yet obtained.
- Documented (API Terms of Service): up to 10 million calls/day ("the
  Threshold"); exceeding it may suspend access. No per-second limit
  published. 500 records per call; `$skip` pagination.
- Plan: conservative self-imposed per-minute caps per endpoint regardless.

## OneMap (SLA)

- Most APIs now require token auth (RS256 JWT, 3-day validity, renewable via
  `/api/public/postloginrenew` flow after email signup).
- Official OneMap MCP gateway exists (hosted by SLA on AWS Bedrock AgentCore):
  24h access token, 30d refresh token, **5 requests/second per token, burst
  10, 429 + exponential backoff recommended**.
- Workshop material mentions onboarded Search API users capped at "250"
  calls; the window (minute/day) is not stated publicly. Unresolved.

## API key signups needed (owner decision)

1. data.gov.sg Developer key - email OTP signup on data.gov.sg.
2. LTA DataMall AccountKey - email signup on datamall.lta.gov.sg.
3. OneMap account - email signup on onemap.gov.sg.

None obtained yet. Keys will be stored in the credential vault, never in this
repo, Slack, or chat.
