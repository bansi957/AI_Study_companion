/**
 * Redis connection configuration for BullMQ.
 *
 * IMPORTANT: This module intentionally uses a lazy getter so that
 * process.env.REDIS_URL is read at first access, not at require() time.
 * This ensures dotenv.config() has already run before the value is consumed.
 */

const buildConnection = () => {
  const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
 
  let host = "127.0.0.1";
  let port = 6379;
  let username;
  let password;
  let tls;

  try {
    const parsed = new URL(redisUrl);
    host = parsed.hostname || "127.0.0.1";
    port = parsed.port ? parseInt(parsed.port, 10) : 6379;
    if (parsed.username) username = decodeURIComponent(parsed.username);
    if (parsed.password) password = decodeURIComponent(parsed.password);
    if (parsed.protocol === "rediss:") tls = {};
  } catch {
    // Keep fallback defaults
  }

  return {
    host,
    port,
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    ...(tls ? { tls } : {}),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  };
};

// Lazy connection: resolved on first access so dotenv always wins
let _connection = null;

module.exports = {
  get connection() {
    if (!_connection) {
      _connection = buildConnection();
    }
    return _connection;
  },
  get url() {
    return process.env.REDIS_URL || "redis://127.0.0.1:6379";
  },
};
