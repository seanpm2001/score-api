import redis from '../redis';
import { get, set } from '../aws';

const VP_KEY_PREFIX = 'vp';

interface VpResult {
  vp: number;
  vp_by_strategy?: number[];
  vp_state: string;
}

export async function cachedVp<Type extends Promise<VpResult>>(
  key: string,
  callback: () => Type,
  toCache = false
) {
  if (!toCache || !redis) {
    return { result: await callback(), cache: false };
  }

  const cache = await redis.hGetAll(`${VP_KEY_PREFIX}:${key}`);

  if (cache?.vp_state) {
    cache.vp = parseFloat(cache.vp);
    cache.vp_by_strategy = JSON.parse(cache.vp_by_strategy);

    return { result: cache as Awaited<Type>, cache: true };
  }

  const result = await callback();

  if (result.vp_state === 'final') {
    const multi = redis.multi();
    multi.hSet(`${VP_KEY_PREFIX}:${key}`, 'vp', result.vp);
    multi.hSet(`${VP_KEY_PREFIX}:${key}`, 'vp_by_strategy', JSON.stringify(result.vp_by_strategy));
    multi.hSet(`${VP_KEY_PREFIX}:${key}`, 'vp_state', result.vp_state);
    multi.exec();
  }

  return { result, cache: false };
}

export async function cachedScores<Type>(key: string, callback: () => Type, toCache = false) {
  if (!toCache || !!process.env.AWS_REGION) {
    return { scores: await callback(), cache: false };
  }

  const cache = await get(key);

  if (cache) {
    return { scores: cache as Awaited<Type>, cache: true };
  }

  const scores = await callback();
  set(key, scores);

  return { scores, cache: false };
}
