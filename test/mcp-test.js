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
  check("tools/list returns >= 14 tools", tools.length >= 14);
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

  console.log(`\n${pass} passed, ${fail} failed`);
  server.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("TEST ERROR:", e.message || e);
  server.kill();
  process.exit(1);
});
