"use strict";

// Spawns the server, runs a real MCP handshake over stdio, lists tools and
// makes two live calls (inside rate limits) plus two meta calls. Exits 1 on
// any failure.

const { spawn } = require("child_process");
const path = require("path");

const server = spawn(process.execPath, [path.join(__dirname, "..", "src", "server.js")], {
  stdio: ["pipe", "pipe", "inherit"],
});

let buffer = "";
const replies = new Map();
server.stdout.on("data", (d) => {
  buffer += d.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined) replies.set(msg.id, msg);
  }
});

function send(o) {
  server.stdin.write(JSON.stringify(o) + "\n");
}

async function waitReply(id, timeout = 40000) {
  const start = Date.now();
  for (;;) {
    if (replies.has(id)) return replies.get(id);
    if (Date.now() - start > timeout) throw new Error("timeout waiting for id " + id);
    await new Promise((r) => setTimeout(r, 50));
  }
}

(async () => {
  let pass = 0,
    fail = 0;
  const check = (name, cond) => {
    if (cond) {
      pass++;
      console.log("PASS", name);
    } else {
      fail++;
      console.log("FAIL", name);
    }
  };

  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "mcp-test", version: "0" } } });
  const init = await waitReply(1);
  check("initialize handshake", init.result && init.result.serverInfo && init.result.serverInfo.name === "sg-gov-mcp");

  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const list = await waitReply(2);
  const tools = (list.result.tools || []).map((t) => t.name);
  check("tools/list returns 24 tools", tools.length === 24);
  console.log("tools:", tools.join(", "));

  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "sg_psi", arguments: {} } });
  const psi = await waitReply(3);
  check("sg_psi live call", psi.result && !psi.result.isError && /psi/i.test(psi.result.content[0].text));

  send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "sg_taxi_availability", arguments: {} } });
  const taxi = await waitReply(4);
  check("sg_taxi_availability live call", taxi.result && !taxi.result.isError && /taxi/i.test(taxi.result.content[0].text));

  send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "sg_rate_limit_status", arguments: {} } });
  const status = await waitReply(5);
  check("sg_rate_limit_status", status.result && status.result.content[0].text.includes("buckets"));

  send({ jsonrpc: "2.0", id: 6, method: "bogus/method" });
  const bogus = await waitReply(6);
  check("unknown method returns JSON-RPC error", !!bogus.error);

  send({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "sg_psi", arguments: {} } });
  const psi2 = await waitReply(7);
  check("second sg_psi served from cache", psi2.result && psi2.result.content[0].text.includes("cache: hit"));

  send({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "sg_dataset_rows", arguments: { dataset_id: "d_8b84c4ee58e3cfc0ece0d773c8ca6abc", limit: 2, filters: {town:"ANG MO KIO"}, fields:["month","town","resale_price"], sort:"month desc" } } });
  const dataset = await waitReply(8);
  check("sg_dataset_rows live filtered page", dataset.result && !dataset.result.isError && JSON.parse(dataset.result.content[0].text).records.length === 2);
  send({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "sg_dataset_schema", arguments: {dataset_id: "d_8b84c4ee58e3cfc0ece0d773c8ca6abc"} } });
  const schema = await waitReply(9);
  check("sg_dataset_schema live", schema.result && !schema.result.isError && JSON.parse(schema.result.content[0].text).fields.some(f=>f.id==="resale_price"));

  send({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "sg_singstat_metadata", arguments: { resource_id: "M650681" } } });
  const stMeta = await waitReply(10);
  check("sg_singstat_metadata live", stMeta.result && !stMeta.result.isError && JSON.parse(stMeta.result.content[0].text).coverage.end === "2025");

  send({ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "sg_singstat_table", arguments: { resource_id: "M650681", limit: 3, sort_by: "key desc" } } });
  const stTable = await waitReply(11);
  check("sg_singstat_table live sorted page", stTable.result && !stTable.result.isError && (()=>{const o=JSON.parse(stTable.result.content[0].text);return o.rows.length===3 && o.rows[0].columns[0].key==="2025";})());

  send({ jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "sg_singstat_search", arguments: { keyword: "car population", search_option: "title" } } });
  const stSearch = await waitReply(12);
  check("sg_singstat_search live", stSearch.result && !stSearch.result.isError && JSON.parse(stSearch.result.content[0].text).records.some(r=>r.id==="M650681"));

  send({ jsonrpc: "2.0", id: 15, method: "tools/call", params: { name: "sg_weather_forecast_4day", arguments: {} } });
  const f4 = await waitReply(15);
  check("sg_weather_forecast_4day live", f4.result && !f4.result.isError && /forecast/i.test(f4.result.content[0].text));

  send({ jsonrpc: "2.0", id: 16, method: "tools/call", params: { name: "sg_traffic_images", arguments: {} } });
  const cams = await waitReply(16);
  check("sg_traffic_images live", cams.result && !cams.result.isError && /camera_id/.test(cams.result.content[0].text));

  send({ jsonrpc: "2.0", id: 17, method: "tools/call", params: { name: "sg_flood_alerts", arguments: {} } });
  const flood = await waitReply(17);
  check("sg_flood_alerts live", flood.result && !flood.result.isError && /"records"/.test(flood.result.content[0].text));

  if (process.env.ONEMAP_TOKEN) {
    send({ jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "sg_onemap_search", arguments: { query: "200640" } } });
    const om = await waitReply(13);
    check("sg_onemap_search live geocode", om.result && !om.result.isError && JSON.parse(om.result.content[0].text).results[0].postal === "200640");

    send({ jsonrpc: "2.0", id: 14, method: "tools/call", params: { name: "sg_onemap_planning_areas", arguments: { year: "2019" } } });
    const omNames = await waitReply(14);
    check("sg_onemap_planning_areas live", omNames.result && !omNames.result.isError && JSON.parse(omNames.result.content[0].text).count === 55);
  } else {
    send({ jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "sg_onemap_search", arguments: { query: "200640" } } });
    const om = await waitReply(13);
    check("OneMap tools fail clearly without ONEMAP_TOKEN", om.result && om.result.isError && om.result.content[0].text.includes("ONEMAP_TOKEN"));
    console.log("skipping OneMap live calls: ONEMAP_TOKEN not set");
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  server.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("TEST ERROR:", e.message || e);
  server.kill();
  process.exit(1);
});
