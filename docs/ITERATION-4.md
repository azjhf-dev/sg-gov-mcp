# Iteration 4: OneMap geocoding and planning areas (token auth)

2026-11-21, checked around 11:35-11:37 Asia/Singapore.

## Delivered

- Two OneMap (Singapore Land Authority) tools, token-authenticated:
  - `sg_onemap_search`: geocode an address, building, road, bus stop or
    postal code. Returns matched addresses with lat/long and SVY21 x/y,
    10 results per page, explicit page parameter.
  - `sg_onemap_planning_areas`: the 55 URA planning-area names for a
    master-plan year (1998/2008/2014/2019, default latest). Boundary
    polygons are intentionally not exposed (hundreds of KB per area).
- 21 tools total. Client-side bucket 30 req/min per process for
  www.onemap.gov.sg, under the signup email's stated 300 calls/min.
- Token handling: the server reads a ready 3-day JWT from the ONEMAP_TOKEN
  environment variable at request time. It never stores, logs, commits or
  prints credentials or tokens. Missing token produces a clear error, and
  that path is tested both offline and live.
- Client now supports per-source request headers (used for the Authorization
  token). Headers are never part of the cache key or any log output.
- New captured fixtures: OneMap geocode of postal 200640 and the 2019
  planning-area name list.

## Verification

- `npm test`: 50/50 offline tests pass, including OneMap URL building,
  argument validation, missing-token refusal, fixture parsing, error-body
  rejection and header-without-cache-leak behavior.
- `npm run test:live` with ONEMAP_TOKEN set: 14/14 checks pass, including a
  live geocode (postal 200640 resolves to 640 Rowell Road) and the 55-area
  planning list. Nine upstream requests total, within all documented limits.
- `npm run test:live` without the token: 13/13 pass; OneMap tools fail with a
  clear setup message instead of leaking or crashing.
- No live request was designed to trigger 429; none was observed.
- No dependencies, paid services, workflow files or secrets added.

## Credential provenance and hygiene

- The owner approved one-time programmatic access to the existing agent
  OneMap account on 2026-11-21 ~11:34 SGT. No new signup was created.
- Token obtained via the documented POST /api/auth/post/getToken flow. The
  copied password file was deleted immediately after the token call; the
  token file was deleted after live tests. Nothing secret is in the repo,
  Slack or chat.
- Current docs: https://www.onemap.gov.sg/apidocs/authentication,
  https://www.onemap.gov.sg/apidocs/search,
  https://www.onemap.gov.sg/apidocs/planningarea.
- The 3-day REST token expires around 2026-11-24. Re-authenticate with the
  same getToken flow when it lapses (documented 401 response guides this).
  The official OneMap MCP gateway's separate 24h/30d token system and
  5 req/s + burst 10 quota remain distinct and unused here.

## Not done / next

- OneMap polygons, themes and population APIs not wrapped (size/cost review
  first: polygon responses are very large).
- Token renewal is manual (re-run getToken); no automatic refresh yet.
- LTA DataMall: no resubmission per owner decision; key email, if any, to
  vault only.
- data.gov.sg catalogue/metadata routes (403) remain unimplemented.
