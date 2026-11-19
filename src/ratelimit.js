"use strict";

// Sliding-window rate limiter, one bucket per upstream host.
// Capacities are deliberately set BELOW documented upstream limits so the
// client never rides the edge. See docs/RATE-LIMITS.md for the evidence.

class TokenBucket {
  constructor({ capacity, windowMs }) {
    this.capacity = capacity;
    this.windowMs = windowMs;
    this.timestamps = [];
  }

  _prune(now) {
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
  }

  // Resolves once a slot is free; the slot is consumed on resolution.
  async acquire() {
    for (;;) {
      const now = Date.now();
      this._prune(now);
      if (this.timestamps.length < this.capacity) {
        this.timestamps.push(now);
        return;
      }
      const waitMs = this.windowMs - (now - this.timestamps[0]) + 25;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  stats() {
    const now = Date.now();
    this._prune(now);
    return {
      capacity: this.capacity,
      windowMs: this.windowMs,
      usedInWindow: this.timestamps.length,
    };
  }
}

const buckets = new Map();

function bucketFor(key, opts) {
  if (!buckets.has(key)) buckets.set(key, new TokenBucket(opts));
  return buckets.get(key);
}

function allStats() {
  const out = {};
  for (const [k, b] of buckets) out[k] = b.stats();
  return out;
}

module.exports = { TokenBucket, bucketFor, allStats };
