# Iteration 5: legacy v1 breadth — NEA 4-day outlook, LTA traffic cameras

2026-11-22, checked around 08:05 Asia/Singapore.

## Delivered

- `sg_weather_forecast_4day`: NEA 4-day island-wide outlook (forecast text,
  temperature, humidity, wind) via legacy api.data.gov.sg v1. This forecast
  exists only on v1; the v2 catalogue has no equivalent.
- `sg_traffic_images`: LTA traffic camera images (camera id, location,
  image link, dimensions, capture timestamp) via legacy v1. Keyless.
- 23 tools total. Both join the existing conservative v1 bucket
  (5 requests/10s per process, shared with taxi/carpark), with caching
  (4-day: 60 min; cameras: 5 min).

## Verification

- `npm test`: 53/53 offline tests pass, including fixture shape checks for
  both new feeds and bucket/TTL registry assertions.
- `npm run test:live`: 15/15 checks pass, including live calls for both new
  tools. Upstream requests this iteration: three one-shot endpoint checks
  plus the live test calls, all spread minutes apart and within the
  self-imposed caps. No 429 observed or provoked.
- No dependencies, paid services, workflow files or secrets added.

## Findings and boundaries

1. `GET /v1/environment/4-day-weather-forecast` works keyless (200, 4 daily
   outlooks). `GET /v1/transport/traffic-images` works keyless (200; 8
   cameras at check time, each with an images.data.gov.sg link).
2. `GET /v1/transport/estimated-travel-times` returned HTTP 403 once. Not
   retried, not worked around; this endpoint is not available keyless. LTA
   DataMall remains the sanctioned route for richer transport data, and its
   signup is not being resubmitted per the owner's decision.
3. Both new feeds are legacy v1: no documented rate limit; the 5/10s
   self-cap and caching stand. v1 may be retired as services migrate to the
   new platform; tools will surface errors rather than hide them.
4. OneMap live checks were skipped in the live run (no ONEMAP_TOKEN in this
   environment; the token lapsed path is covered by the clear-error check).

## Not done / next

- OneMap token lapses ~Nov 24; renewal needs another owner-approved one-time
  credential copy when next required.
- data.gov.sg catalogue/metadata routes (403) remain unimplemented.
- Phase 5 candidates: datastore-backed statistics curation, PUB feeds if
  they appear in the v2 real-time list, OneMap population/themes after a
  response-size review.
