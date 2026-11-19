#!/usr/bin/env node
"use strict";

// sg-gov-mcp: a dependency-free MCP (stdio) server over Singapore government
// open data. JSON-RPC 2.0, one message per line on stdin/stdout.
// Diagnostics go to stderr only. Rate limits are always obeyed: see
// docs/RATE-LIMITS.md. We never parallel-burst, never retry-storm, and on a
// 429 we wait out the full 10-second window exactly once, then give up.

const readline = require("readline");
const { bucketFor, allStats } = require("./ratelimit");
const { SOURCES, listSources } = require("./sources");

const VERSION = "0.1.0";
const MAX_BODY_CHARS = 12000;
const cache = new Map(); // url -> { at, ttlMs, body }

function log(...a) {
  process.stderr.write(`[sg-gov-mcp] ${a.join(" ")}\n`);
}

async function fetchSource(id, args = {}) {
  const src = SOURCES[id];
  if (!src) throw new Error(`unknown source: ${id}`);

  let url = src.url;
  if (args.date && src.dateParam) {
    url += (url.includes("?") ? "&" : "?") + "date=" + encodeURIComponent(args.date);
  }

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < hit.ttlMs) {
    return { body: hit.body, cached: true, url, src };
  }

  const bucket = bucketFor(src.host, src.bucket);
  let lastErr = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    await bucket.acquire();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          accept: "application/json",
          "user-agent": `sg-gov-mcp/${VERSION} (+https://github.com/azjhf-dev/sg-gov-mcp)`,
        },
      });
      clearTimeout(timer);

      if (res.status === 429) {
        // Upstream says: try again in 10 seconds. Obey the full window, once.
        log(`429 from ${url}; waiting out the 10s window before one retry`);
        await new Promise((r) => setTimeout(r, 10500));
        lastErr = new Error(
          "upstream rate limit (429); waited 10s and retried once, still limited"
        );
        continue;
      }
      if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);

      const body = await res.json();
      if (body && body.code !== undefined && body.code !== 0) {
        throw new Error(`upstream error code ${body.code}: ${body.errorMsg || "no message"}`);
      }
      cache.set(url, { at: Date.now(), ttlMs: src.ttlMs, body });
      return { body, cached: false, url, src };
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") {
        lastErr = new Error("upstream request timed out after 15s");
      } else {
        lastErr = e;
      }
      break;
    }
  }
  throw lastErr || new Error("fetch failed");
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
    return JSON.stringify(listSources(), null, 2);
  }
  if (name === "sg_rate_limit_status") {
    const out = {
      buckets: allStats(),
      cache_entries: cache.size,
      policy:
        "Conservative client-side caps below documented upstream limits. On 429: wait the full 10s window, retry once, then fail. Never work around limits.",
    };
    return JSON.stringify(out, null, 2);
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
