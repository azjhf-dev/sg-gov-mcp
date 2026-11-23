"use strict";

// Catalog of Singapore government open-data sources exposed by this server.
//
// Real-time registry. General tabular tools live in datasets.js.
// Two real-time upstream families:
//  - data.gov.sg v2 real-time APIs (api-open.data.gov.sg), keyless tier:
//    6 requests / 10 s, measured live. We cap at 5/10s for headroom.
//  - Legacy api.data.gov.sg v1, keyless, no documented limit found and none
//    observed in gentle probing; we still cap at 5/10s out of politeness.
//
// Sources needing an API key signup (LTA DataMall, data.gov.sg keyed tiers,
// OneMap) are intentionally NOT here yet; see docs/PLAN.md.

const V2 = "https://api-open.data.gov.sg/v2/real-time/api";
const V1 = "https://api.data.gov.sg/v1";

const V2_BUCKET = { capacity: 5, windowMs: 10000 }; // documented keyless: 6/10s
const V1_BUCKET = { capacity: 5, windowMs: 10000 }; // undocumented; conservative

const MIN = 60 * 1000;

const SOURCES = {
  sg_pm25: {
    host: "api-open.data.gov.sg",
    bucket: V2_BUCKET,
    url: `${V2}/pm25`,
    ttlMs: 30 * MIN,
    agency: "NEA via data.gov.sg",
    updates: "hourly",
    dateParam: true,
    description: "PM2.5 one-hourly readings by region (national, north, south, east, west, central).",
  },
  sg_psi: {
    host: "api-open.data.gov.sg",
    bucket: V2_BUCKET,
    url: `${V2}/psi`,
    ttlMs: 30 * MIN,
    agency: "NEA via data.gov.sg",
    updates: "hourly",
    dateParam: true,
    description: "Pollutant Standards Index (24h and sub-indices) by region.",
  },
  sg_uv_index: {
    host: "api-open.data.gov.sg",
    bucket: V2_BUCKET,
    url: `${V2}/uv`,
    ttlMs: 30 * MIN,
    agency: "NEA via data.gov.sg",
    updates: "hourly",
    dateParam: true,
    description: "UV index readings.",
  },
  sg_weather_forecast_2hr: {
    host: "api-open.data.gov.sg",
    bucket: V2_BUCKET,
    url: `${V2}/two-hr-forecast`,
    ttlMs: 30 * MIN,
    agency: "NEA via data.gov.sg",
    updates: "every 30 min",
    dateParam: true,
    description: "2-hour weather forecast by area.",
  },
  sg_weather_forecast_24hr: {
    host: "api-open.data.gov.sg",
    bucket: V2_BUCKET,
    url: `${V2}/twenty-four-hr-forecast`,
    ttlMs: 60 * MIN,
    agency: "NEA via data.gov.sg",
    updates: "several times daily",
    dateParam: true,
    description: "24-hour island-wide weather forecast (general + periods).",
  },
  sg_air_temperature: {
    host: "api-open.data.gov.sg",
    bucket: V2_BUCKET,
    url: `${V2}/air-temperature`,
    ttlMs: 5 * MIN,
    agency: "NEA via data.gov.sg",
    updates: "every few minutes",
    dateParam: true,
    description: "Air temperature readings per weather station.",
  },
  sg_rainfall: {
    host: "api-open.data.gov.sg",
    bucket: V2_BUCKET,
    url: `${V2}/rainfall`,
    ttlMs: 5 * MIN,
    agency: "NEA via data.gov.sg",
    updates: "every 5 min",
    dateParam: true,
    description: "Rainfall readings per station.",
  },
  sg_relative_humidity: {
    host: "api-open.data.gov.sg",
    bucket: V2_BUCKET,
    url: `${V2}/relative-humidity`,
    ttlMs: 5 * MIN,
    agency: "NEA via data.gov.sg",
    updates: "every few minutes",
    dateParam: true,
    description: "Relative humidity readings per station.",
  },
  sg_wind_direction: {
    host: "api-open.data.gov.sg",
    bucket: V2_BUCKET,
    url: `${V2}/wind-direction`,
    ttlMs: 5 * MIN,
    agency: "NEA via data.gov.sg",
    updates: "every few minutes",
    dateParam: true,
    description: "Wind direction readings per station.",
  },
  sg_wind_speed: {
    host: "api-open.data.gov.sg",
    bucket: V2_BUCKET,
    url: `${V2}/wind-speed`,
    ttlMs: 5 * MIN,
    agency: "NEA via data.gov.sg",
    updates: "every few minutes",
    dateParam: true,
    description: "Wind speed readings per station.",
  },
  sg_flood_alerts: {
    host: "api-open.data.gov.sg",
    bucket: V2_BUCKET,
    url: `${V2}/weather/flood-alerts`,
    ttlMs: 2 * MIN,
    agency: "PUB via data.gov.sg",
    updates: "every 2 min",
    dateParam: true,
    description: "Real-time flood alert events across Singapore (records list; empty when no active alerts).",
  },
  sg_weather_forecast_4day: {
    host: "api.data.gov.sg",
    bucket: V1_BUCKET,
    url: `${V1}/environment/4-day-weather-forecast`,
    ttlMs: 60 * MIN,
    agency: "NEA via legacy api.data.gov.sg v1",
    updates: "several times daily",
    dateParam: true,
    description: "4-day island-wide weather outlook (forecast, temperature, humidity, wind). Only on legacy v1.",
  },
  sg_traffic_images: {
    host: "api.data.gov.sg",
    bucket: V1_BUCKET,
    url: `${V1}/transport/traffic-images`,
    ttlMs: 5 * 60 * 1000,
    agency: "LTA via legacy api.data.gov.sg v1",
    updates: "every few minutes",
    dateParam: true,
    description: "Latest traffic camera images with locations and image links.",
  },
  sg_taxi_availability: {
    host: "api.data.gov.sg",
    bucket: V1_BUCKET,
    url: `${V1}/transport/taxi-availability`,
    ttlMs: 30 * 1000,
    agency: "LTA via legacy api.data.gov.sg v1",
    updates: "~every minute",
    dateParam: true,
    description: "Locations of available taxis (GeoJSON points), legacy v1 API.",
  },
  sg_carpark_availability: {
    host: "api.data.gov.sg",
    bucket: V1_BUCKET,
    url: `${V1}/transport/carpark-availability`,
    ttlMs: 60 * 1000,
    agency: "HDB/URA/LTA via legacy api.data.gov.sg v1",
    updates: "~every minute",
    dateParam: true,
    description: "Available lots for major carparks, legacy v1 API.",
  },
};

function listSources() {
  return Object.entries(SOURCES).map(([tool, s]) => ({
    tool,
    agency: s.agency,
    endpoint: s.url,
    typical_update: s.updates,
    cache_ttl_seconds: Math.round(s.ttlMs / 1000),
    client_rate_bucket: `${s.bucket.capacity} req / ${s.bucket.windowMs / 1000}s on ${s.host}`,
    description: s.description,
  }));
}

module.exports = { SOURCES, listSources };
