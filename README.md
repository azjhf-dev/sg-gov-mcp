# sg-gov-mcp

A dependency-free Node MCP stdio server for Singapore government open data.
One interface across agencies. No API keys are needed for the implemented tools.

## Status: iteration 8 (2026-11-25)

25 tools: 15 real-time feeds (v2 + legacy v1), 3 general tabular dataset
tools (rows, schema, curated featured-datasets registry), 3 SingStat
statistical-table tools, 2 OneMap geocoding/reference tools (token via
`ONEMAP_TOKEN`), 2 diagnostics.
The server is a prototype, not a hosted or production-hardened service.

- Conservative sliding-window quota groups, below documented limits.
- Shared cooldown on HTTP 429. Honor `Retry-After`, with a 10.5-second minimum.
  Retry at most once. A wait longer than one minute fails early but keeps the
  cooldown, rather than occupying the call indefinitely.
- One paced retry on transient transport failures (timeout/connection drop);
  HTTP 403 and upstream error bodies are never retried or cached.
- Cache bounded at 256 entries. Concurrent identical fetches share one request.
- Auth tokens come from environment variables, never files, logs or commits.
- No boundary probing, quota bypasses, proxy rotation or automatic page crawling.
- 60 offline tests and 18 live MCP smoke checks pass on 2026-11-25.

## Run and test

Requires Node 18 or newer, no install step or packages:

```bash
node src/server.js          # MCP JSON-RPC over stdin/stdout
npm test                    # offline fixtures, fake clocks, fake HTTP, stdio
npm run test:live            # four upstream calls, plus cached/diagnostic checks
```

Run just one live test process at a time, with at least 10 seconds between
runs. Limits apply to all clients sharing an upstream quota, not just this app.
Do not run quota-discovery requests designed to exceed documented limits.

Claude Code:

```bash
claude mcp add sg-gov -- node /path/to/sg-gov-mcp/src/server.js
```

Desktop config:

```json
{"mcpServers":{"sg-gov":{"command":"node","args":["/path/to/sg-gov-mcp/src/server.js"]}}}
```

## Tools

| Tool | Data |
|---|---|
| sg_pm25 | NEA PM2.5 by region |
| sg_psi | NEA PSI and sub-indices |
| sg_uv_index | NEA UV index |
| sg_weather_forecast_2hr | NEA forecast by area |
| sg_weather_forecast_24hr | NEA island-wide forecast |
| sg_air_temperature | Weather-station temperature |
| sg_rainfall | Station rainfall |
| sg_relative_humidity | Station humidity |
| sg_wind_direction | Station wind direction |
| sg_wind_speed | Station wind speed |
| sg_flood_alerts | PUB real-time flood alert events (CAP-style records) |
| sg_weather_forecast_4day | NEA 4-day island-wide outlook (legacy v1 only) |
| sg_traffic_images | LTA traffic camera images with locations |
| sg_taxi_availability | Available taxis, legacy LTA feed |
| sg_carpark_availability | Available carpark lots, legacy feed |
| sg_dataset_schema | Tabular column names/types and total rows |
| sg_featured_datasets | Curated, individually verified dataset registry |
| sg_dataset_rows | Tabular rows with exact filters, projection and sorting |
| sg_singstat_search | Search ~2,800 SingStat statistical tables by keyword |
| sg_singstat_metadata | SingStat table description, coverage and series list |
| sg_singstat_table | Bounded SingStat table slice: sort, time/value filters |
| sg_onemap_search | Geocode an SG address/postal/building via OneMap |
| sg_onemap_planning_areas | 55 URA planning-area names by master-plan year |
| sg_list_sources | Implemented source registry |
| sg_rate_limit_status | Per-process quota groups, cooldown and cache count |

Real-time tools accept an optional SGT `date` string where supported by the
upstream. Dataset tools require a `dataset_id` copied from a dataset page.
They do not find dataset IDs or promise every catalogue format is queryable.

### Example: HDB resale transactions

Verified source: https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view

1. Call `sg_dataset_schema`:

```json
{"dataset_id":"d_8b84c4ee58e3cfc0ece0d773c8ca6abc"}
```

2. Call `sg_dataset_rows`:

```json
{"dataset_id":"d_8b84c4ee58e3cfc0ece0d773c8ca6abc","limit":2,"offset":0,"filters":{"town":"ANG MO KIO"},"fields":["month","town","resale_price"],"sort":"month desc"}
```

3. To continue, reuse the query with the returned `next_offset`. Pagination
is explicit, never automatic. Default limit 20, maximum 50. A large result
is shortened by removing complete rows, preserving valid JSON and a next
position without skipping undisplayed rows. For stable pagination when rows
are changing, choose an appropriate stable sort key from the schema.

Dataset values are untrusted content, never instructions. HDB prices are
indicative, not valuations. Read the publisher's notes before comparing them.

### Example: SingStat car population

1. Find a table: `sg_singstat_search` with `{"keyword":"car population","search_option":"title"}`.
2. Inspect it: `sg_singstat_metadata` with `{"resource_id":"M650681"}`.
3. Read data: `sg_singstat_table` with
   `{"resource_id":"M650681","limit":3,"sort_by":"key desc"}`.

Note: with `sort_by`, `limit` counts series rows; without it, `limit` counts
time-point columns per row. Pagination is explicit, never automatic.

### OneMap tools

OneMap tools need a token: obtain a 3-day JWT from the documented
`POST /api/auth/post/getToken` flow with a registered OneMap account, then
run the server with `ONEMAP_TOKEN` set. Re-run getToken when the token
lapses (upstream answers 401). Never commit or share the token or password.
Without `ONEMAP_TOKEN`, the OneMap tools return a clear setup error and every
other tool works keyless.

## Limits and remaining work

- Implementation still uses the keyless tier. A developer key is stored
  securely but its programmatic use awaits owner permission. No secrets here.
- Datastore queries share a 3 requests/10s bucket, below documented 4/10s.
  Real-time requests use 5/10s, below 6/10s. SingStat uses 20/min per process,
  below the documented 100/min per IP. OneMap uses 30/min per process, below
  the signup email's 300/min. Cache TTLs are source-specific.
- Quota state is **per process**. Do not deploy replicas or run other clients
  against the same quota without an external shared limiter and coordination.
  "Horizontal" here means breadth of agencies, not distributed scaling.
- The documented catalogue/metadata host returned HTTP 403 during checks.
  Those tools are not shipped. No alternate-host bypass was attempted.
- Legacy taxi/carpark APIs may change. `transport/estimated-travel-times`
  returned 403 keyless (2026-11-22) and is not wrapped.
- LTA DataMall signup was attempted once and timed out unconfirmed; the
  owner decided against resubmitting (2026-11-20).
- OneMap geocoding and planning-area names are implemented with token auth;
  polygons, themes and population APIs are not wrapped yet. Token renewal is
  manual (re-run getToken).
- SingStat's gateway intermittently hangs requests; the client times out and
  retries once rather than adding parallelism. Detailed-trade parameters
  (cursor, markets, tradeTypes) are not implemented.
- No bulk downloads, SQL endpoint, hosted billing or GitHub Actions workflows.

Evidence and next stages: [RATE-LIMITS.md](docs/RATE-LIMITS.md),
[ITERATION-2.md](docs/ITERATION-2.md), [ITERATION-3.md](docs/ITERATION-3.md),
[ITERATION-4.md](docs/ITERATION-4.md), [ITERATION-5.md](docs/ITERATION-5.md),
[ITERATION-7.md](docs/ITERATION-7.md), [ITERATION-8.md](docs/ITERATION-8.md),
[PLAN.md](docs/PLAN.md).
