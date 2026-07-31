/**
 * Shared transport for api3.geo.admin.ch.
 *
 * Extracted from the street-name checker so every feature hitting geo.admin.ch draws from
 * ONE request budget. The service's fair-use limit is 40 req/min for the whole client: two
 * features each running their own 30 req/min limiter would issue 60 and get throttled, so
 * the limiter below is deliberately a module singleton rather than a per-feature instance.
 */

/** Documented maximum page size of the identify endpoint. */
export const PAGE_SIZE = 200;
export const IDENTIFY_URL = "https://api3.geo.admin.ch/rest/services/api/MapServer/identify";
/** Stay under the 40 req/min fair-use limit, shared across all features. */
const MAX_REQUESTS_PER_MINUTE = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sliding-window rate limiter; acquire() resolves when a request slot is free. */
export class RateLimiter {
  private stamps: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(private maxPerMinute = MAX_REQUESTS_PER_MINUTE) {}

  acquire(): Promise<void> {
    const next = this.queue.then(async () => {
      let now = Date.now();
      this.stamps = this.stamps.filter((t) => now - t < 60_000);
      if (this.stamps.length >= this.maxPerMinute) {
        const oldest = this.stamps[0] ?? now;
        await sleep(Math.max(0, oldest + 60_000 - now));
        now = Date.now();
        this.stamps = this.stamps.filter((t) => now - t < 60_000);
      }
      this.stamps.push(Date.now());
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/** The one budget every geo.admin.ch caller shares. Do not construct a second one. */
export const rateLimiter = new RateLimiter();

function gmGetJson(url: string, signal?: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Scan aborted", "AbortError"));
      return;
    }
    // GM_xmlhttpRequest returns a handle with .abort(); wire it to the signal so an
    // in-flight request is actually cancelled in production. The GM path is the one that
    // runs in WME; the fetch path below only honors the signal in tests/Node.
    const handle = GM_xmlhttpRequest({
      method: "GET",
      url,
      responseType: "json",
      onload: (r) =>
        r.status >= 200 && r.status < 300
          ? resolve(r.response)
          : reject(new Error(`geo.admin.ch HTTP ${r.status}`)),
      onerror: () => reject(new Error("GM_xmlhttpRequest network error")),
      ontimeout: () => reject(new Error("GM_xmlhttpRequest timeout")),
    });
    signal?.addEventListener("abort", () => {
      handle.abort();
      reject(new DOMException("Scan aborted", "AbortError"));
    });
  });
}

export async function httpGetJson(url: string, signal?: AbortSignal): Promise<unknown> {
  // In WME the page Content-Security-Policy blocks `fetch()` to api3.geo.admin.ch
  // (it is not in `connect-src`); GM_xmlhttpRequest runs in the extension context and
  // bypasses it, so prefer it whenever Tampermonkey provides it. `fetch()` is kept for
  // environments without GM (unit tests / Node).
  if (typeof GM_xmlhttpRequest === "function") return gmGetJson(url, signal);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`geo.admin.ch HTTP ${res.status}`);
  return (await res.json()) as unknown;
}
