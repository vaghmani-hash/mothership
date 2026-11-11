// One run at a time, for a read that many callers ask for (the folder look-up: the window every few
// seconds, and every create). Runs never overlap, so a slow earlier one can't finish last and
// replace a newer result with an older one.

/**
 * Wraps `run` so only one runs at a time. A call made while one runs waits for a single further
 * run that starts after it, shared by every call made meanwhile: its result is never older than the call.
 */
export function oneAtATime<T>(run: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null
  let next: Promise<T> | null = null
  const again = (): Promise<T> => {
    next = null
    return call()
  }
  const call = (): Promise<T> => {
    if (running !== null) {
      next ??= running.then(again, again)
      return next
    }
    const mine: Promise<T> = run().finally(() => {
      running = null
    })
    running = mine
    return mine
  }
  return call
}
