# sg-gov-mcp

An MCP (Model Context Protocol) server over **Singapore government open data**.
One server, many agencies behind a uniform tool interface: NEA weather and
environment readings, taxi and carpark availability now, LTA transport,
OneMap geocoding, and dataset search in later phases.

Idea: following the "sell the MCP layer, not the agent" argument, the durable
asset is a reliable, rate-limit-respecting MCP server over valuable public
data. This repo is the long-term horizontal build: plan in `docs/PLAN.md`,
measured rate-limit evidence in `docs/RATE-LIMITS.md`.

## Status: iteration 1 (2026-11-20)

- 12 live tools over two keyless API families (data.gov.sg v2 real-time,
  legacy api.data.gov.sg v1), plus 2 meta tools (`sg_list_sources`,
  `sg_rate_limit_status`).
- Dependency-free Node (>= 18, uses built-in `fetch`). Stdio transport.
- Rate limits are **always obeyed**: conservative client-side buckets below
  documented limits, caching, and a single 10-second back-off on 429. No
  workarounds, ever.

## Run

No install step, no dependencies:

```bash
node src/server.js        # speaks MCP over stdio
node test/mcp-test.js     # handshake + live smoke test (2 upstream calls)
```

Claude Code:

```bash
claude mcp add sg-gov -- node /path/to/sg-gov-mcp/src/server.js
```

Claude Desktop config:

```json
{ "mcpServers": { "sg-gov": { "command": "node", "args": ["/path/to/sg-gov-mcp/src/server.js"] } } }
```

## Tools

| Tool | Agency | Data |
|---|---|---|
| sg_pm25 | NEA | PM2.5 by region, hourly |
| sg_psi | NEA | PSI + sub-indices by region, hourly |
| sg_uv_index | NEA | UV index |
| sg_weather_forecast_2hr | NEA | 2h forecast by area |
| sg_weather_forecast_24hr | NEA | 24h island-wide forecast |
| sg_air_temperature | NEA | Per-station air temperature |
| sg_rainfall | NEA | Per-station rainfall |
| sg_relative_humidity | NEA | Per-station humidity |
| sg_wind_direction | NEA | Per-station wind direction |
| sg_wind_speed | NEA | Per-station wind speed |
| sg_taxi_availability | LTA (legacy v1) | Available taxi locations (GeoJSON) |
| sg_carpark_availability | HDB/URA/LTA (legacy v1) | Carpark lot availability |

All real-time tools accept an optional `date` (`YYYY-MM-DD` or
`YYYY-MM-DDTHH:mm:ss`, SGT) where the upstream API supports it.

## Rate-limit policy

1. Client-side token buckets sit **below** documented upstream limits
   (5 req/10s where the documented keyless limit is 6/10s).
2. Responses are cached for their natural update cadence, so most calls never
   hit the upstream at all.
3. On HTTP 429 we wait the full 10-second window **once**, retry **once**,
   then return an error. No header tricks, no IP rotation, no parallel
   bursting, no workarounds of any kind.
4. `sg_rate_limit_status` exposes bucket usage so compliance is inspectable.

## Honest caveats

- We are on the **keyless tier**. data.gov.sg offers 2x-5x higher limits with
  a free API key (signup requires an email OTP; see docs/PLAN.md phase 2).
- The legacy api.data.gov.sg v1 endpoints are the older generation; data.gov.sg
  is migrating traffic to the new platform, so taxi/carpark may move.
- SLA already runs an official OneMap MCP gateway (account required). We link
  to it rather than duplicate it; see docs/PLAN.md phase 4.
- Rate-limit numbers in docs/RATE-LIMITS.md mix official documentation with
  our own gentle live measurements; each row says which.
