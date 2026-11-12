/** Helpers for in-app navigation feedback (top bar + pressed links). */

export type Loc = { origin: string; pathname: string; search: string };

const SKIP_SCHEMES = /^(mailto:|tel:|sms:|javascript:)/i;

/** True when this anchor would trigger a same-origin App Router navigation. */
export function isAppNavigationAnchor(
  a: { href: string; target: string; hasAttribute: (n: string) => boolean; getAttribute: (n: string) => string | null },
  loc: Loc,
): boolean {
  if (a.target && a.target !== "_self") return false;
  if (a.hasAttribute("download")) return false;
  const raw = a.getAttribute("href");
  if (!raw || raw.startsWith("#") || SKIP_SCHEMES.test(raw)) return false;
  let url: URL;
  try {
    url = new URL(a.href, loc.origin);
  } catch {
    return false;
  }
  if (url.origin !== loc.origin) return false;
  if (url.pathname === loc.pathname && url.search === loc.search) return false;
  return true;
}

export function pathAndSearch(href: string, origin: string): string {
  const url = new URL(href, origin);
  return url.pathname + url.search;
}

export function isModifiedClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}
