// In-memory session manager
// Features:
// - track sessions by chatId
// - touch session to extend TTL
// - capacity limit (max concurrent sessions)
// - per-session token-bucket rate limiter

class TokenBucket {
  constructor({capacity = 60, refillPerSec = 1}) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillPerSec = refillPerSec;
    this.lastRefill = Date.now();
  }

  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    const add = elapsed * this.refillPerSec;
    this.tokens = Math.min(this.capacity, this.tokens + add);
    this.lastRefill = now;
  }

  take(count = 1) {
    this._refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  getTokens() {
    this._refill();
    return this.tokens;
  }
}

class SessionManagementService {
  constructor() {
    // Map chatId -> { chatId, createdAt, lastSeen, ttl, bucket }
    this.sessions = new Map();
    this.defaultTTL = 1000 * 60 * 60; // 1 hour
    this.cleanupInterval = 1000 * 60; // 1 minute
    this.maxSessions = 1000; // default capacity
    this._startCleanup();
  }

  _startCleanup() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.sessions.entries()) {
        if (now - v.lastSeen > v.ttl) {
          this.sessions.delete(k);
        }
      }
    }, this.cleanupInterval);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  configure({defaultTTLMs, maxSessions, cleanupIntervalMs} = {}) {
    if (defaultTTLMs) this.defaultTTL = defaultTTLMs;
    if (maxSessions) this.maxSessions = maxSessions;
    if (cleanupIntervalMs) {
      clearInterval(this.cleanupTimer);
      this.cleanupInterval = cleanupIntervalMs;
      this._startCleanup();
    }
  }

  hasCapacity() {
    return this.sessions.size < this.maxSessions;
  }

  register(chatId, {ttlMs, rateLimit} = {}) {
    if (!chatId) throw new Error('chatId required');
    if (!this.hasCapacity() && !this.sessions.has(chatId)) {
      return {ok: false, reason: 'capacity'};
    }

    const now = Date.now();
    const ttl = ttlMs || this.defaultTTL;

    let session = this.sessions.get(chatId);
    if (!session) {
      // create token bucket for rate limiting
      const bucket = new TokenBucket({
        capacity: rateLimit?.capacity ?? 60,
        refillPerSec: rateLimit?.refillPerSec ?? 1
      });
      session = {
        chatId,
        createdAt: now,
        lastSeen: now,
        ttl,
  bucket,
  // metrics
  requestCount: 0,
  errorCount: 0,
  totalLatencyMs: 0,
  lastLatencyMs: 0
      };
      this.sessions.set(chatId, session);
    } else {
      session.lastSeen = now;
      session.ttl = ttl; // allow updating ttl
    }

    return {ok: true, session};
  }

  touch(chatId) {
    const session = this.sessions.get(chatId);
    if (!session) return false;
    session.lastSeen = Date.now();
    return true;
  }

  recordRequest(chatId, { latencyMs = 0, error = false } = {}) {
    const session = this.sessions.get(chatId);
    if (!session) return false;
    session.requestCount = (session.requestCount || 0) + 1;
    if (error) session.errorCount = (session.errorCount || 0) + 1;
    if (typeof latencyMs === 'number' && latencyMs >= 0) {
      session.lastLatencyMs = latencyMs;
      session.totalLatencyMs = (session.totalLatencyMs || 0) + latencyMs;
    }
    return true;
  }

  getSummary() {
    const out = [];
    for (const [k, v] of this.sessions.entries()) {
      out.push({
        chatId: k,
        createdAt: v.createdAt,
        lastSeen: v.lastSeen,
        ttl: v.ttl,
        requestCount: v.requestCount || 0,
        errorCount: v.errorCount || 0,
        lastLatencyMs: v.lastLatencyMs || 0,
        avgLatencyMs: v.requestCount ? Math.round((v.totalLatencyMs || 0) / v.requestCount) : 0
      });
    }
    return out;
  }

  unregister(chatId) {
    return this.sessions.delete(chatId);
  }

  canConsume(chatId, tokens = 1) {
    const session = this.sessions.get(chatId);
    if (!session) return {ok: false, reason: 'no_session'};
    const allowed = session.bucket.take(tokens);
    return {ok: allowed, remaining: session.bucket.getTokens()};
  }

  getInfo(chatId) {
    return this.sessions.get(chatId);
  }

  shutdown() {
    clearInterval(this.cleanupTimer);
    this.sessions.clear();
  }
}

const singleton = new SessionManagementService();
export default singleton;
