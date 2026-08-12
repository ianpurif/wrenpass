const defaultBadSequenceRetryDelaysMs = [750, 1_500] as const;

const accountQueues = new Map<string, Promise<void>>();

function isBadSequenceError(error: unknown): boolean {
  return error instanceof Error
    && /(?:txBadSeq|tx[_-]bad[_-]seq)/i.test(error.message);
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runInLocalAccountQueue<T>(account: string, action: () => Promise<T>): Promise<T> {
  const previous = accountQueues.get(account) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(action);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  accountQueues.set(account, tail);

  try {
    return await result;
  } finally {
    if (accountQueues.get(account) === tail) {
      accountQueues.delete(account);
    }
  }
}

async function runWithAccountLock<T>(account: string, action: () => Promise<T>): Promise<T> {
  const lockName = `wrenpass:stellar-transaction:${account}`;
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(lockName, action);
  }
  return runInLocalAccountQueue(account, action);
}

export async function submitWithFreshAccountSequence<T>(input: {
  account: string;
  assembleSignAndSend(): Promise<T>;
  badSequenceRetryDelaysMs?: readonly number[];
}): Promise<T> {
  const retryDelays = input.badSequenceRetryDelaysMs ?? defaultBadSequenceRetryDelaysMs;

  return runWithAccountLock(input.account, async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await input.assembleSignAndSend();
      } catch (error) {
        const retryDelay = retryDelays[attempt];
        if (!isBadSequenceError(error) || retryDelay === undefined) {
          throw error;
        }
        await wait(retryDelay);
      }
    }
  });
}
