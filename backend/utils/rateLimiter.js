// Fixed-window, in-memory rate limiter. Counters are per backend instance.
export function createRateLimiter({ windowMs, max }) {
  const windows = new Map();

  function consume(key, now = Date.now()) {
    let entry = windows.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      windows.set(key, entry);
    }

    entry.count += 1;
    if (entry.count > max) {
      return { allowed: false, retryAfterMs: entry.resetAt - now };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  function reset(key) {
    windows.delete(key);
  }

  function prune(now = Date.now()) {
    for (const [key, entry] of windows) {
      if (now >= entry.resetAt) windows.delete(key);
    }
  }

  const sweeper = setInterval(prune, windowMs);
  sweeper.unref();

  function stop() {
    clearInterval(sweeper);
    windows.clear();
  }

  return { consume, reset, prune, stop };
}
