"use strict";

// Sliding-window limiter. A 429 pauses the entire quota group, not just
// the request that saw it. Instances/processes do not share state.
class TokenBucket {
  constructor({ capacity, windowMs, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
    this.capacity = capacity;
    this.windowMs = windowMs;
    this.now = now;
    this.sleep = sleep;
    this.timestamps = [];
    this.blockedUntil = 0;
  }
  _prune(now) { this.timestamps = this.timestamps.filter(t => now - t < this.windowMs); }
  defer(ms) { this.blockedUntil = Math.max(this.blockedUntil, this.now() + ms); }
  async acquire() {
    for (;;) {
      const now = this.now();
      this._prune(now);
      const wait = Math.max(this.blockedUntil - now,
        this.timestamps.length >= this.capacity ? this.windowMs - (now - this.timestamps[0]) + 25 : 0);
      if (wait <= 0) { this.timestamps.push(now); return; }
      await this.sleep(wait);
    }
  }
  stats() {
    this._prune(this.now());
    return { capacity: this.capacity, windowMs: this.windowMs,
      usedInWindow: this.timestamps.length, cooldownMs: Math.max(0, this.blockedUntil - this.now()) };
  }
}
const buckets = new Map();
function bucketFor(key, opts) {
  if (!buckets.has(key)) buckets.set(key, new TokenBucket(opts));
  return buckets.get(key);
}
function allStats() { return Object.fromEntries([...buckets].map(([k,b]) => [k,b.stats()])); }
module.exports = { TokenBucket, bucketFor, allStats };
