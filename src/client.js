"use strict";
const { bucketFor } = require('./ratelimit');
function retryDelay(value, now = Date.now()) {
  const seconds = value && /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) * 1000 : NaN;
  const date = value ? Date.parse(value) - now : NaN;
  return Math.max(10500, Number.isFinite(seconds) ? seconds : Number.isFinite(date) ? date : 0);
}
function createClient({ fetchImpl = globalThis.fetch, getBucket = bucketFor, now = Date.now } = {}) {
  const cache = new Map(), inflight = new Map();
  async function request(src, url) {
    const hit = cache.get(url);
    if (hit && now() - hit.at < src.ttlMs) return { body: hit.body, cached: true };
    if (inflight.has(url)) return inflight.get(url);
    const work = (async () => {
      const bucket = getBucket(src.quotaGroup || src.host, src.bucket);
      for (let attempt = 0; attempt < 2; attempt++) {
        await bucket.acquire();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        try {
          const res = await fetchImpl(url, { signal: ctrl.signal, redirect: 'error',
            headers: { accept: 'application/json', 'user-agent': 'sg-gov-mcp/0.10.0', ...(src.headers ? src.headers() : {}) } });
          if (res.status === 429) {
            const delay = retryDelay(res.headers.get('retry-after'), now());
            bucket.defer(delay);
            if (res.body && res.body.cancel) await res.body.cancel();
            if (attempt === 1) throw new Error('upstream rate limit (429); one retry exhausted, quota group paused');
            if (delay > 60000) throw new Error('upstream rate limit (429); long Retry-After, quota group paused; retry later');
            continue;
          }
          if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
          // Bound untrusted payloads before parsing. Timeout includes body read.
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let raw = '', bytes = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('upstream response exceeds 2 MiB safety limit'); }
            raw += decoder.decode(value, { stream: true });
          }
          raw += decoder.decode();
          const body = JSON.parse(raw);
          if (body.code !== undefined && body.code !== 0) throw new Error(`upstream error code ${body.code}`);
          if (body.success === false) throw new Error('upstream dataset query unsuccessful');
          if (typeof body.StatusCode === 'number' && body.StatusCode >= 400) throw new Error(`upstream error StatusCode ${body.StatusCode}`);
          if (cache.size >= 256) cache.delete(cache.keys().next().value);
          cache.set(url, { at: now(), body });
          return { body, cached: false };
        } catch (e) {
          // Transient transport failures (timeout, connection drop) get one
          // paced retry through the same bucket; then they surface.
          const transient = e.name === 'AbortError' || e.name === 'TypeError';
          if (transient && attempt === 0) continue;
          if (e.name === 'AbortError') throw new Error('upstream request timed out after 15s');
          throw e;
        } finally { clearTimeout(timer); }
      }
    })();
    inflight.set(url, work);
    try { return await work; } finally { inflight.delete(url); }
  }
  return { request, cacheSize: () => cache.size };
}
module.exports = { createClient, retryDelay };
