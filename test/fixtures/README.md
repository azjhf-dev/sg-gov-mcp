# Public-data fixtures

Captured 2026-11-20 around 09:02 Asia/Singapore from data.gov.sg's documented
`/api/action/datastore_search` endpoint. These are public dataset excerpts,
not live/latest values, credentials or authoritative valuations.

Publisher: Housing & Development Board (HDB).
Dataset: Resale flat prices based on registration date from Jan-2017 onwards.
Source: https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view
The publisher page states reuse under the Singapore Open Data Licence.
The code's MIT licence does not replace the source data's licence.

- `hdb-rows.json`: first two rows, no filters/projection.
- `hdb-filtered.json`: two rows, town=ANG MO KIO, month/town/resale_price
  selected, sorted by month descending.

The source warns that prices are indicative and depend on many factors.
Fixtures preserve the API's empty projected field descriptors so tests do
not silently assume complete schema metadata when selecting columns.

## SingStat fixtures (added 2026-11-21)

Captured 2026-11-21 around 08:38 Asia/Singapore from the SingStat Table
Builder developer API (https://www.tablebuilder.singstat.gov.sg/view-api/for-developers),
keyless and public.

Publisher: Singapore Department of Statistics.
Table: M650681, Car Population By CC Rating (End Of Period), Annual.
Source agency named in the metadata: Land Transport Authority.
Terms: Singapore Open Data Licence via the developer page's terms link.

- `singstat-search.json`: resourceid search for "population", trimmed from
  352 to the first 3 records (upstream search responses are unpaginated).
- `singstat-metadata.json`: full metadata response for M650681.
- `singstat-tabledata.json`: tabledata for M650681 with limit=3 (1 series
  row, 3 annual columns).

## OneMap fixtures (added 2026-11-21)

Captured 2026-11-21 around 11:35 Asia/Singapore from OneMap's documented
token-authenticated endpoints (https://www.onemap.gov.sg/apidocs/).
Publisher: Singapore Land Authority. Public reference data; no credentials
or tokens are present in these files.

- `onemap-search.json`: geocode of postal code 200640 (one result).
- `onemap-planning-names.json`: 2019 master-plan planning-area names.

## Legacy v1 fixtures (added 2026-11-22)

Captured 2026-11-22 around 08:05 Asia/Singapore from keyless legacy
api.data.gov.sg v1 endpoints. Public data: NEA weather outlook, LTA camera
metadata.

- `nea-4day-forecast.json`: 4-day weather outlook (NEA).
- `lta-traffic-images.json`: traffic camera list with image links (LTA).
  Image URLs point to images.data.gov.sg and rotate; they are fixtures, not
  live camera feeds.

## v2 real-time fixtures (added 2026-11-23)

Captured 2026-11-23 around 09:19 Asia/Singapore from the keyless v2
real-time API. Public data: PUB flood alerts.

- `pub-flood-alerts.json`: flood alert envelope; `data.records` was empty
  (no active alerts). Record-level fields are not yet observed live.

## Datastore schema fixtures (added 2026-11-24)

Captured 2026-11-24 around 08:48 Asia/Singapore from the official
data.gov.sg datastore route (limit=1). Public data: MOM labour statistics
schema.

- `mom-lfpr-schema.json`: schema of the MOM Resident Labour Force
  Participation Rate dataset (d_4ed91a4ac48c9cf0c2bbcf93a7067d74).
