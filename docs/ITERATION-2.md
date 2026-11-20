# Iteration 2: general dataset queries and quota safety

2026-11-20, checked around 09:02-09:05 Asia/Singapore.

## Delivered

- `sg_dataset_rows`: arbitrary tabular dataset ID, exact filters, selected
  columns, sorting, page size 1-50, explicit offset. No SQL or arbitrary URLs.
- `sg_dataset_schema`: names/types and row total from an unprojected one-row
  query. No row content returned to the caller.
- 16 tools total, preserving the original 12 real-time feeds and 2 diagnostics.
- Shared cooldown per quota group on 429; Retry-After seconds and HTTP dates;
  minimum 10.5s, at most one retry, no retry for 403.
- Concurrent identical request coalescing; bounded 256-entry cache; 15s
  timeout covering body reads; 2 MiB response safety cap; redirects rejected.
- Dataset output remains valid JSON. Whole-row trimming updates next_offset
  without silently skipping undisplayed rows. Large single rows ask callers
  to select fewer fields.

## Verification

- `npm test`: 28/28 offline tests pass. Captured public HDB fixtures, fake
  HTTP responses and fake clocks cover schemas, validation, projection,
  pagination, quota spacing, cooldowns, persistent 429, Retry-After, 403,
  cache expiry, concurrency, body-size limits and offline stdio discovery.
- `npm run test:live`: 9/9 checks pass. Actual MCP subprocess handshake,
  16-tool discovery, PSI, taxi availability, diagnostics, unknown method,
  cache hit, filtered HDB rows and HDB schema. Four upstream requests total.
- No live request was designed to trigger 429. Fixture errors are simulated.
- No dependencies, paid services, workflow files or secrets added.

## Findings and boundaries

1. The officially documented datastore endpoint works:
   https://data.gov.sg/api/action/datastore_search
2. HDB source and query example verified on the publisher page:
   https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view
3. Catalogue and metadata endpoints documented at api-production.data.gov.sg
   each returned HTTP 403 on a single request. No bypass/retry. These tools
   are not claimed implemented, and dataset IDs must come from known pages.
4. `limit=0` returned a headers-only object with HTTP 200. Schema inspection
   uses limit=1 instead. Projected fields came back as empty objects, so the
   schema tool does not project.
5. The earlier boundary probe was not compliant: it deliberately requested
   beyond a published cap. Removed the script, corrected the docs, and use
   only within-quota functional checks now.
6. OneMap's ordinary REST token and official MCP gateway differ in lifetime
   and auth flow. 300/minute does not establish the same burst rules as
   5/second. Current REST docs use `/api/auth/post/getToken`; no auth/renewal
   implementation is claimed in this iteration.
7. Limiter state is per process. Production replicas need shared quota state
   and must account for unrelated clients sharing the upstream budget.

## Official sources read

- Data.gov.sg quota table:
  https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits
- Datastore parameters and response:
  https://guide.data.gov.sg/developer-guide/dataset-apis/search-and-filter-within-dataset
- Catalogue route:
  https://guide.data.gov.sg/developer-guide/dataset-apis/list-all-datasets
- Metadata route:
  https://guide.data.gov.sg/developer-guide/dataset-apis/get-dataset-metadata
- List rows route:
  https://guide.data.gov.sg/developer-guide/dataset-apis/list-rows-of-dataset
- HDB source, caveats, sample query and licence:
  https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view
- OneMap REST authentication:
  https://www.onemap.gov.sg/apidocs/authentication
- OneMap MCP gateway authentication and quota:
  https://www.onemap.gov.sg/apidocs/mcp/

## Next

Credential-use approval and the LTA contact-number question remain open.
Neither is a reason to halt independent keyless breadth. Next iteration:
OneMap auth/geocoding if credential use is allowed, otherwise current
SingStat API research, safe implementation and tests. Always push and post
an iteration summary, with no secrets.
