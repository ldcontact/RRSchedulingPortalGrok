/** Parse and serialize a project's free-text scope as a simple # / qty / work-item table. */

export type ScopeItem = { qty: number | null; work_item: string };

const QTY_LINE = /^(?:(\d+(?:\.\d+)?)\s*[x×]\s+|(?:(\d+(?:\.\d+)?)\s+))(.+)$/i;

/** Split scope text into rows. Leading "12 x " or "12 " becomes qty; other lines have no qty. */
export function parseScopeItems(scope: string): ScopeItem[] {
  return scope
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(QTY_LINE);
      if (!m) return { qty: null, work_item: line };
      const qty = Number(m[1] ?? m[2]);
      const rest = (m[3] ?? "").trim();
      // "2x4 troffers" should stay a work item, not qty 2 of "4 troffers"
      if (!Number.isFinite(qty) || qty <= 0 || !rest) return { qty: null, work_item: line };
      return { qty, work_item: rest };
    });
}

/** Render rows back to the same human-readable text techs already see on a visit. */
export function serializeScopeItems(items: ScopeItem[]): string {
  return items
    .map((i) => i.work_item.trim())
    .filter(Boolean)
    .map((text, idx) => {
      const qty = items[idx]?.qty;
      return qty != null && Number.isFinite(qty) && qty > 0 ? `${Number.isInteger(qty) ? qty : qty} × ${text}` : text;
    })
    .join("\n");
}

/** Read repeating qty[] / work_item[] fields from a form. */
export function scopeItemsFromForm(fd: FormData): ScopeItem[] {
  const qtys = fd.getAll("qty").map((v) => String(v).trim());
  const items = fd.getAll("work_item").map((v) => String(v).trim());
  const rows: ScopeItem[] = [];
  const n = Math.max(qtys.length, items.length);
  for (let i = 0; i < n; i++) {
    const work_item = items[i] ?? "";
    if (!work_item) continue;
    const raw = qtys[i] ?? "";
    const qty = raw === "" ? null : Number(raw);
    rows.push({ qty: qty != null && Number.isFinite(qty) && qty > 0 ? qty : null, work_item });
  }
  return rows;
}
