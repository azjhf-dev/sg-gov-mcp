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
