/**
 * Latest-request-wins guard for refetches (we-trace, result for the
 * timeline): starting a new request aborts the previous one, and
 * `isCurrent()` lets the caller drop a response that raced past an abort.
 * A late response must never overwrite newer state.
 *
 *   const guard = createLatest();            // one per resource, e.g. in a ref
 *   const req = guard.begin();
 *   const data = await api.getWeTrace(id, { signal: req.signal });
 *   if (req.isCurrent()) setWeTrace(data);   // AbortError (code "ABORTED") → ignore
 */
export function createLatest() {
  let controller: AbortController | null = null;
  let seq = 0;
  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      const mine = ++seq;
      return { signal: controller.signal, isCurrent: () => mine === seq };
    },
    /** Invalidate whatever is in flight (unmount, new session). */
    cancel() {
      controller?.abort();
      seq++;
    },
  };
}
