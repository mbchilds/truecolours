// Vercel serverless function: records daily-challenge scores and returns today's stats.
//
//   POST /api/daily  { date: "2026-09-02", score: 842, cid: "abc123" }
//   GET  /api/daily?date=2026-09-02
//
// Storage is Upstash Redis (via the Vercel Marketplace). Keys per day:
//   daily:<date>:count   number of players
//   daily:<date>:sum     sum of all scores
//   daily:<date>:hist    hash of bucket(score/50) -> count, used for "you beat X%"
//   daily:<date>:players set of client ids, so a player is only counted once
import { Redis } from '@upstash/redis';

const BUCKET = 50; // score bucket width for the percentile histogram

// Finds the Upstash REST credentials whatever prefix the Vercel integration gave
// them (KV_REST_API_URL, STORAGE_REST_API_URL, UPSTASH_REDIS_REST_URL, ...).
function getRedis() {
  const env = process.env;
  let url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  let token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    const urlKey = Object.keys(env).find(k => /REST_API_URL$/.test(k) || /REDIS_REST_URL$/.test(k));
    if (urlKey) {
      const tokenKey = urlKey.replace(/URL$/, 'TOKEN');
      url = env[urlKey]; token = env[tokenKey];
    }
  }
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function stats(redis, date, myScore) {
  const [count, sum, hist] = await Promise.all([
    redis.get(`daily:${date}:count`), redis.get(`daily:${date}:sum`), redis.hgetall(`daily:${date}:hist`),
  ]);
  const n = Number(count) || 0;
  const avg = n ? Math.round(Number(sum) / n) : 0;
  let beat = null;
  if (myScore != null && n > 1 && hist) {
    const mine = Math.floor(myScore / BUCKET);
    let below = 0, same = 0;
    for (const [b, c] of Object.entries(hist)) {
      const bucket = Number(b), cnt = Number(c);
      if (bucket < mine) below += cnt; else if (bucket === mine) same += cnt;
    }
    // exclude yourself; players in your own bucket count as half beaten
    const others = n - 1;
    beat = Math.max(0, Math.min(1, (below + Math.max(0, same - 1) * 0.5) / others));
  }
  return { date, count: n, avg, beat };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const redis = getRedis();
  if (!redis) return res.status(503).json({ error: 'Leaderboard not configured (missing Redis env vars)' });

  const today = new Date().toISOString().slice(0, 10);

  if (req.method === 'GET') {
    const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : today;
    return res.status(200).json(await stats(redis, date, null));
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const { date, score, cid } = body || {};
    const s = Number(score);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !Number.isInteger(s) || s < 0 || s > 1000 || typeof cid !== 'string' || cid.length > 64) {
      return res.status(400).json({ error: 'Bad request' });
    }
    // only accept scores for today or yesterday (time zones straddle midnight UTC)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (date !== today && date !== yesterday) return res.status(400).json({ error: 'Not an open challenge day' });

    const isNew = await redis.sadd(`daily:${date}:players`, cid);
    if (isNew) {
      await Promise.all([
        redis.incr(`daily:${date}:count`),
        redis.incrby(`daily:${date}:sum`, s),
        redis.hincrby(`daily:${date}:hist`, String(Math.floor(s / BUCKET)), 1),
        redis.expire(`daily:${date}:players`, 60 * 60 * 24 * 3),
      ]);
    }
    return res.status(200).json(await stats(redis, date, s));
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
