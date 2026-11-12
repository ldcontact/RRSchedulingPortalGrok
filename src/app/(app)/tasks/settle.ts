/** Catch a failed data load so one slow or timed-out query cannot 500 the page. */
export async function settle<T>(label: string, promise: Promise<T>, fallback: T): Promise<{ ok: boolean; value: T }> {
  try {
    return { ok: true, value: await promise };
  } catch (e) {
    console.error(`[tasks] ${label} failed:`, e instanceof Error ? e.message : e);
    return { ok: false, value: fallback };
  }
}
