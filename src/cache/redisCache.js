const { createClient } = require('redis');
const config = require('../config');
const logger = require('../utils/logger');

const client = createClient({
  url: config.redis.url,
  socket: {
    connectTimeout: 1000,
    reconnectStrategy: (retries) => (retries >= 3 ? false : Math.min(retries * 200, 1000)),
  },
});

let connection;

client.on('error', (err) => {
  logger.warn('Redis cache error', { error: err.message });
});

async function connect() {
  if (client.isReady) return;
  if (!connection) {
    connection = client.connect().finally(() => {
      if (!client.isReady) connection = null;
    });
  }
  await connection;
}

async function getJson(key) {
  try {
    await connect();
    const value = await client.get(key);
    return value === null ? null : JSON.parse(value);
  } catch (err) {
    logger.warn('Redis cache read skipped', { error: err.message });
    return null;
  }
}

async function setJson(key, value, ttlSeconds = config.redis.centreCacheTtlSeconds) {
  try {
    await connect();
    await client.set(key, JSON.stringify(value), { EX: Math.max(1, ttlSeconds) });
  } catch (err) {
    logger.warn('Redis cache write skipped', { error: err.message });
  }
}

async function deletePattern(pattern) {
  try {
    await connect();
    let keys = [];
    for await (const batch of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      keys = keys.concat(Array.isArray(batch) ? batch : [batch]);
      if (keys.length >= 100) {
        await client.del(keys);
        keys = [];
      }
    }
    if (keys.length) await client.del(keys);
  } catch (err) {
    logger.warn('Redis cache invalidation skipped', { error: err.message });
  }
}

async function closeCache() {
  if (client.isOpen) await client.quit();
}

module.exports = { getJson, setJson, deletePattern, closeCache };