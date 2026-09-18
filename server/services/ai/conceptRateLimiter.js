const Redis = require("ioredis");
const redisConfig = require("../../config/redis");

/**
 * Distributed Dual Rate Limiter for Concept Generation (Qwen Model)
 *
 * Enforces strict global limits across concurrent workers and processes:
 * - Token Budget: 5800 ITPM (Input Tokens Per Minute) rolling window (safe headroom below 7000 account limit)
 * - Request Limit: 30 RPM
 * - Minimum Spacing: 2200ms between consecutive calls
 * - Redis-coordinated atomic sliding window with Lua scripting
 * - Dynamic token-wait scheduling (never starts a request if it exceeds rolling minute budget)
 * - Respects HTTP 429 Retry-After and rate-limit headers globally
 * - Graceful in-memory sliding-window fallback if Redis is unavailable
 */
class ConceptRateLimiter {
  constructor() {
    this.minGapMs = 2200; // Minimum 2.2 seconds between API calls
    this.windowMs = 60000; // 1-minute rolling token window
    this.maxTokensPerMinute = 5800; // Safe budget with headroom below 7000 ITPM

    this.redisKeyNext = "ratelimit:concept_generation:next_allowed";
    this.redisKeyCooldown = "ratelimit:concept_generation:cooldown_until";
    this.redisKeyTokenWindow = "ratelimit:concept_generation:token_window";

    // In-memory fallbacks
    this.localLastAllowed = 0;
    this.localCooldownUntil = 0;
    this.localTokenHistory = []; // Array of { timestamp: number, tokens: number }

    this.redisClient = null;
    this._initRedis();
  }

  _initRedis() {
    try {
      const conn = redisConfig.connection;
      if (conn) {
        this.redisClient = new Redis({
          ...conn,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });

        this.redisClient.on("error", () => {
          // Non-fatal, handled by local fallback
        });
      }
    } catch (e) {
      this.redisClient = null;
    }
  }

  async getConnectedClient() {
    if (!this.redisClient) return null;
    try {
      if (this.redisClient.status === "wait" || this.redisClient.status === "close") {
        await this.redisClient.connect().catch(() => {});
      }
      if (this.redisClient.status === "ready") {
        return this.redisClient;
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Conservative estimation of input tokens from text content.
   * Uses ~3.7 chars per token + safety buffer.
   *
   * @param {string} text
   * @returns {number} Estimated input tokens
   */
  estimateTokens(text = "") {
    if (!text || typeof text !== "string") return 50;
    return Math.max(Math.ceil(text.length / 3.7) + 20, 1);
  }

  /**
   * Acquire a rate-limited slot before invoking the Concept API.
   * Evaluates both request rate limit (>= 2.2s gap) and rolling token budget (<= 5800 ITPM).
   * Atomically schedules and sleeps for the required delay.
   *
   * @param {number} estimatedTokens - Estimated input tokens for the upcoming call
   * @returns {Promise<number>} Actual delay waited in milliseconds
   */
  async acquireSlot(estimatedTokens = 1500) {
    const tokens = Math.max(parseInt(estimatedTokens, 10) || 1500, 100);
    const now = Date.now();
    let delayMs = 0;

    const redis = await this.getConnectedClient();

    if (redis) {
      try {
        const luaScript = `
          local nextKey = KEYS[1]
          local cooldownKey = KEYS[2]
          local tokenZSetKey = KEYS[3]

          local now = tonumber(ARGV[1])
          local estimatedTokens = tonumber(ARGV[2])
          local minGap = tonumber(ARGV[3])
          local windowMs = tonumber(ARGV[4])
          local maxTokens = tonumber(ARGV[5])
          local callId = ARGV[6]

          -- 1. Prune token entries older than (now - windowMs)
          redis.call('zremrangebyscore', tokenZSetKey, '-inf', now - windowMs)

          -- 2. Check 429 cooldown and request spacing
          local cooldownUntil = tonumber(redis.call('get', cooldownKey) or '0')
          local lastAllowed = tonumber(redis.call('get', nextKey) or '0')

          local baseTime = math.max(now, cooldownUntil)
          if lastAllowed > 0 and (lastAllowed + minGap) > baseTime then
            baseTime = lastAllowed + minGap
          end

          -- 3. Fetch all active token entries to compute rolling token consumption
          local entries = redis.call('zrangebyscore', tokenZSetKey, now - windowMs, '+inf')
          local currentTokens = 0
          local parsedEntries = {}

          for i, entry in ipairs(entries) do
            -- Format: timestamp:id:tokens
            local firstColon = string.find(entry, ':')
            if firstColon then
              local ts = tonumber(string.sub(entry, 1, firstColon - 1))
              local remainder = string.sub(entry, firstColon + 1)
              local secondColon = string.find(remainder, ':')
              if secondColon then
                local tok = tonumber(string.sub(remainder, secondColon + 1))
                if ts and tok then
                  currentTokens = currentTokens + tok
                  table.insert(parsedEntries, { ts = ts, tok = tok })
                end
              end
            end
          end

          -- 4. Calculate earliest targetTime where rolling tokens + estimatedTokens <= maxTokens
          local targetTime = baseTime
          local neededTokens = currentTokens + estimatedTokens

          if neededTokens > maxTokens then
            -- Sort entries ascending by timestamp
            table.sort(parsedEntries, function(a, b) return a.ts < b.ts end)

            local tempTokens = currentTokens
            for _, item in ipairs(parsedEntries) do
              tempTokens = tempTokens - item.tok
              local expireTime = item.ts + windowMs + 50
              if expireTime > targetTime then
                targetTime = expireTime
              end
              if (tempTokens + estimatedTokens) <= maxTokens then
                break
              end
            end
          end

          -- Re-enforce spacing from lastAllowed after token wait
          if lastAllowed > 0 and (lastAllowed + minGap) > targetTime then
            targetTime = lastAllowed + minGap
          end

          -- 5. Record scheduled slot in Redis atomically
          redis.call('set', nextKey, tostring(targetTime), 'PX', 180000)
          local member = tostring(targetTime) .. ':' .. callId .. ':' .. tostring(estimatedTokens)
          redis.call('zadd', tokenZSetKey, targetTime, member)
          redis.call('pexpire', tokenZSetKey, 180000)

          local delay = targetTime - now
          return delay
        `;

        const callId = `${now}_${Math.floor(Math.random() * 10000)}`;
        const result = await redis.eval(
          luaScript,
          3,
          this.redisKeyNext,
          this.redisKeyCooldown,
          this.redisKeyTokenWindow,
          now,
          tokens,
          this.minGapMs,
          this.windowMs,
          this.maxTokensPerMinute,
          callId
        );

        delayMs = Math.max(parseInt(result, 10) || 0, 0);
      } catch (err) {
        // Fallback to local in-memory scheduling if Redis call fails
        delayMs = this._acquireLocalSlot(now, tokens);
      }
    } else {
      delayMs = this._acquireLocalSlot(now, tokens);
    }

    if (delayMs > 0) {
      if (delayMs >= 1000) {
        console.log(
          `[ConceptRateLimiter] Rate limiting: waiting ${(delayMs / 1000).toFixed(1)}s (estimatedTokens: ${tokens}, budget: ${this.maxTokensPerMinute} ITPM)`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return delayMs;
  }

  /**
   * In-memory sliding-window slot allocation fallback
   */
  _acquireLocalSlot(now, estimatedTokens) {
    // 1. Prune local history older than 60s
    const cutoff = now - this.windowMs;
    this.localTokenHistory = this.localTokenHistory.filter((item) => item.timestamp > cutoff);

    // 2. Compute base time from cooldown and lastAllowed
    const baseTime = Math.max(now, this.localCooldownUntil);
    let targetTime = baseTime;
    if (this.localLastAllowed > 0 && (this.localLastAllowed + this.minGapMs) > baseTime) {
      targetTime = this.localLastAllowed + this.minGapMs;
    }

    // 3. Compute rolling tokens
    let currentTokens = this.localTokenHistory.reduce((sum, item) => sum + item.tokens, 0);
    if (currentTokens + estimatedTokens > this.maxTokensPerMinute) {
      const sorted = [...this.localTokenHistory].sort((a, b) => a.timestamp - b.timestamp);
      let tempTokens = currentTokens;
      for (const item of sorted) {
        tempTokens -= item.tokens;
        const expireTime = item.timestamp + this.windowMs + 50;
        if (expireTime > targetTime) {
          targetTime = expireTime;
        }
        if (tempTokens + estimatedTokens <= this.maxTokensPerMinute) {
          break;
        }
      }
    }

    if (this.localLastAllowed > 0 && (this.localLastAllowed + this.minGapMs) > targetTime) {
      targetTime = this.localLastAllowed + this.minGapMs;
    }

    this.localLastAllowed = targetTime;
    this.localTokenHistory.push({ timestamp: targetTime, tokens: estimatedTokens });

    return Math.max(targetTime - now, 0);
  }

  /**
   * Handle HTTP 429 response: parse headers or compute exponential backoff with jitter,
   * and update global cooldown so all workers pause.
   *
   * @param {Object} error - Groq API error object
   * @param {number} attemptIndex - 0-indexed attempt count
   * @returns {Promise<number>} Milliseconds to wait
   */
  async reportRateLimit(error = {}, attemptIndex = 0) {
    let waitMs = 0;

    // 1. Inspect HTTP headers for Retry-After or x-ratelimit-reset-*
    const headers = error.headers || error.response?.headers || {};
    const retryAfter =
      headers["retry-after"] ||
      headers["x-ratelimit-reset-requests"] ||
      headers["x-ratelimit-reset-tokens"];

    if (retryAfter) {
      const parsed = parseFloat(retryAfter);
      if (!isNaN(parsed) && parsed > 0) {
        waitMs = parsed > 1000 ? Math.ceil(parsed) : Math.ceil(parsed * 1000);
      } else {
        const dateMs = Date.parse(retryAfter);
        if (!isNaN(dateMs) && dateMs > Date.now()) {
          waitMs = dateMs - Date.now();
        }
      }
    }

    // 2. Fallback: Exponential backoff with jitter if headers unavailable
    if (waitMs <= 0) {
      const baseMs = Math.min(3000 * Math.pow(2, attemptIndex), 25000);
      const jitterMs = Math.floor(Math.random() * 1000);
      waitMs = baseMs + jitterMs;
    }

    // Enforce minimum gap
    waitMs = Math.max(waitMs, this.minGapMs);

    const cooldownUntil = Date.now() + waitMs;
    this.localCooldownUntil = Math.max(this.localCooldownUntil, cooldownUntil);

    // 3. Broadcast cooldown to Redis so concurrent workers pause too
    const redis = await this.getConnectedClient();
    if (redis) {
      try {
        await redis.set(
          this.redisKeyCooldown,
          cooldownUntil.toString(),
          "PX",
          waitMs + 30000
        );
        await redis.set(
          this.redisKeyNext,
          cooldownUntil.toString(),
          "PX",
          waitMs + 30000
        );
      } catch {
        // Fallback already updated locally
      }
    }

    console.warn(
      `[ConceptRateLimiter] 429 Cooldown active globally for ${(waitMs / 1000).toFixed(1)}s across all workers.`
    );

    return waitMs;
  }
}

module.exports = new ConceptRateLimiter();
