#!/usr/bin/env node
"use strict";

// sg-gov-mcp: a dependency-free MCP (stdio) server over Singapore government
// open data. JSON-RPC 2.0, one message per line on stdin/stdout.
// Diagnostics go to stderr only. Rate limits are always obeyed: see
// docs/RATE-LIMITS.md. We never parallel-burst, never retry-storm, and on a
// 429 we pause the quota group, honor Retry-After and retry at most once.

const readline = require("readline");
const { allStats } = require("./ratelimit");
const { SOURCES, listSources } = require("./sources");

const { createClient } = require("./client");
const { DATASET_TOOLS, DATASET_SOURCE, buildDatasetRequest, datasetOutput } = require("./datasets");
const { SINGSTAT_TOOLS, SINGSTAT_SOURCE, buildSingstatRequest, singstatOutput } = require("./singstat");
const { ONEMAP_TOOLS, ONEMAP_SOURCE, buildOnemapRequest, onemapOutput } = require("./onemap");
const client = createClient();
const VERSION = "0.4.0";
const MAX_BODY_CHARS = 12000;


function log(...a) {
  process.stderr.write(`[sg-gov-mcp] ${a.join(" ")}\n`);
}

async function fetchSource(id, args = {}) {
  const src = SOURCES[id];
  if (!src) throw new Error(`unknown source: ${id}`);

  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments must be an object');
  if (Object.keys(args).some(k => k !== 'date')) throw new Error('unknown argument');
  if (args.date !== undefined && (typeof args.date !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/.test(args.date))) throw new Error('invalid date format');
  let url = src.url;
  if (args.date && src.dateParam) {
    url += (url.includes("?") ? "&" : "?") + "date=" + encodeURIComponent(args.date);
  }

  const result = await client.request(src, url);
  return { ...result, url, src };
}

function toolDefs() {
  const defs = Object.entries(SOURCES).map(([name, s]) => ({
    name,
    description: `${s.description} [${s.agency}; updates ${s.updates}; cache ${Math.round(
      s.ttlMs / 1000
    )}s]`,
    inputSchema: {
      type: "object",
      properties: s.dateParam
        ? {
            date: {
              type: "string",
              description:
                "Optional SGT date filter: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss. Omit for latest.",
            },
          }
        : {},
      additionalProperties: false,
    },
  }));

  defs.push(...DATASET_TOOLS);
  defs.push(...SINGSTAT_TOOLS);
  defs.push(...ONEMAP_TOOLS);
  defs.push({
    name: "sg_list_sources",
    description: "List every Singapore government data source this server exposes, with agency, endpoint, update cadence, cache TTL and the client-side rate bucket.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  });
  defs.push({
    name: "sg_rate_limit_status",
    description: "Show the client-side rate-limit buckets (capacity, window, current usage) and cache occupancy. Use this to confirm the server is staying under upstream limits.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  });
  return defs;
}

async function callTool(name, args) {
  if (name === "sg_list_sources") {
    return JSON.stringify([...listSources(),
      { tools: DATASET_TOOLS.map(t => t.name), endpoint: DATASET_SOURCE.url, client_rate_bucket: "3 req / 10s shared datastore group", cache_ttl_seconds: 300 },
      { tools: SINGSTAT_TOOLS.map(t => t.name), endpoint: SINGSTAT_SOURCE.url, client_rate_bucket: "20 req / 60s shared SingStat group (documented upstream: 100/min per IP)", cache_ttl_seconds: 900 },
      { tools: ONEMAP_TOOLS.map(t => t.name), endpoint: ONEMAP_SOURCE.url, client_rate_bucket: "30 req / 60s shared OneMap group (signup email: 300/min regular APIs)", auth: "ONEMAP_TOKEN env var, 3-day JWT", cache_ttl_seconds: 3600 }], null, 2);
  }
  if (name === "sg_rate_limit_status") {
    const out = {
      buckets: allStats(),
      cache_entries: client.cacheSize(),
      policy:
        "Per-process conservative quota groups. On 429: shared cooldown, honor Retry-After (at least 10.5s), retry at most once. Long waits fail early with cooldown retained. Never work around limits.",
    };
    return JSON.stringify(out, null, 2);
  }

  if (DATASET_TOOLS.some(t => t.name === name)) {
    const request = buildDatasetRequest(name, args);
    const { body, cached } = await client.request(request.src, request.url);
    return JSON.stringify({ source: request.url, cached, ...datasetOutput(body, request) });
  }
  if (SINGSTAT_TOOLS.some(t => t.name === name)) {
    const request = buildSingstatRequest(name, args);
    const { body, cached } = await client.request(request.src, request.url);
    return JSON.stringify({ source: request.url, cached, ...singstatOutput(body, request) });
  }
  if (ONEMAP_TOOLS.some(t => t.name === name)) {
    const request = buildOnemapRequest(name, args);
    const { body, cached } = await client.request(request.src, request.url);
    return JSON.stringify({ source: request.url, cached, ...onemapOutput(body, request) });
  }
  const { body, cached, url, src } = await fetchSource(name, args || {});
  let text = JSON.stringify(body);
  let truncated = false;
  if (text.length > MAX_BODY_CHARS) {
    text = text.slice(0, MAX_BODY_CHARS);
    truncated = true;
  }
  const meta = [
    `source: ${url}`,
    `agency: ${src.agency}`,
    `cache: ${cached ? "hit" : "fresh fetch"}`,
    `rate bucket: ${src.bucket.capacity} req / ${src.bucket.windowMs / 1000}s on ${src.host} (client-side, conservative)`,
    truncated ? `note: body truncated at ${MAX_BODY_CHARS} chars` : null,
    "---",
  ]
    .filter(Boolean)
    .join("\n");
  return meta + "\n" + text;
}

async function handleRequest(msg) {
  switch (msg.method) {
    case "initialize":
      return {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "sg-gov-mcp", version: VERSION },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: toolDefs() };
    case "resources/list":
      return { resources: [] };
    case "prompts/list":
      return { prompts: [] };
    case "tools/call": {
      const { name, arguments: args } = msg.params || {};
      try {
        const text = await callTool(name, args);
        return { content: [{ type: "text", text }], isError: false };
      } catch (e) {
        return {
          content: [{ type: "text", text: `error: ${e.message || e}` }],
          isError: true,
        };
      }
    }
    default:
      throw { code: -32601, message: `method not found: ${msg.method}` };
  }
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // ignore non-JSON noise
  }
  if (msg.id === undefined || msg.id === null || !msg.method) return; // notification or response: ignore
  try {
    const result = await handleRequest(msg);
    send({ jsonrpc: "2.0", id: msg.id, result });
  } catch (e) {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: e.code || -32603, message: e.message || String(e) },
    });
  }
});

log(`sg-gov-mcp ${VERSION} listening on stdio`);
