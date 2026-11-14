/** Parse a task description into paragraphs and numbered lists, keeping the author's numbering. */

export type DescriptionSpan = { type: "text"; text: string } | { type: "link"; text: string; href: string };

export type DescriptionBlock =
  | { type: "paragraph"; spans: DescriptionSpan[] }
  | { type: "list"; items: { number: string; spans: DescriptionSpan[] }[] };

const NUMBERED = /^(\d+)\.\s+(.*)$/;
/** http(s) URLs, trimming a trailing run of sentence punctuation from the href. */
const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCT = /[).,;:!?]+$/;

export function parseTaskDescription(raw: string | null | undefined): DescriptionBlock[] {
  const text = (raw ?? "").replace(/\r\n/g, "\n");
  if (!text.trim()) return [];

  const blocks: DescriptionBlock[] = [];
  let paragraph: string[] = [];
  let list: { number: string; lines: string[] }[] | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const body = paragraph.join("\n").trim();
    if (body) blocks.push({ type: "paragraph", spans: linkify(body) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list?.length) { list = null; return; }
    blocks.push({
      type: "list",
      items: list.map((item) => ({ number: item.number, spans: linkify(item.lines.join("\n")) })),
    });
    list = null;
  };

  for (const line of text.split("\n")) {
    const numbered = line.trimStart().match(NUMBERED);
    if (numbered) {
      flushParagraph();
      if (!list) list = [];
      list.push({ number: numbered[1], lines: [numbered[2]] });
      continue;
    }
    if (list) {
      if (line.trim() === "") { flushList(); continue; }
      list[list.length - 1].lines.push(line.trimStart());
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

export function linkify(text: string): DescriptionSpan[] {
  const spans: DescriptionSpan[] = [];
  let last = 0;
  const re = new RegExp(URL_RE.source, "gi");
  for (const match of text.matchAll(re)) {
    const raw = match[0];
    const trimmed = raw.replace(TRAILING_PUNCT, "");
    const punct = raw.slice(trimmed.length);
    const start = match.index ?? 0;
    if (start > last) spans.push({ type: "text", text: text.slice(last, start) });
    if (trimmed) spans.push({ type: "link", text: trimmed, href: trimmed });
    if (punct) spans.push({ type: "text", text: punct });
    last = start + raw.length;
  }
  if (last < text.length) spans.push({ type: "text", text: text.slice(last) });
  return spans.length ? spans : [{ type: "text", text }];
}
