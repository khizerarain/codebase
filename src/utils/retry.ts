export interface RetryOptions {
  retries?: number;
  delayMs?: number;
  label?: string;
  shouldRetry?: (err: unknown) => boolean;
}

/** Simple async retry for flaky LLM/network/tool calls. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const delayMs = opts.delayMs ?? 400;
  const shouldRetry =
    opts.shouldRetry ??
    ((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return /timeout|ECONNRESET|ECONNREFUSED|fetch failed|429|502|503|504/i.test(
        msg,
      );
    });

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !shouldRetry(err)) throw err;
      await sleep(delayMs * (attempt + 1));
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
