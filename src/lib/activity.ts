/** Derive a customer activity feed from real records — no invented events. */

export type ActivityKind = "profile_created" | "project_created" | "note_added" | "message" | "photo" | "visit";

export type ActivityEvent = {
  id: string;
  at: string;
  kind: ActivityKind;
  title: string;
  detail?: string;
  href?: string;
  hrefLabel?: string;
};

type ProjectRef = { id: string; name: string; created_at: string };
type NoteRef = { id: string; body: string; created_at: string; author_name: string; job_id?: string | null; project_id?: string | null };
type MessageRef = { id: string; created_at: string; channel: string; subject: string | null; direction: string };
type PhotoRef = { id: string; created_at: string; kind: string; project_id: string };
type VisitRef = { id: string; title: string; created_at?: string; starts_at: string; status: string; project_id: string };

export function deriveCustomerActivity(input: {
  customerId: string;
  createdAt: string;
  projects: ProjectRef[];
  notes: NoteRef[];
  messages: MessageRef[];
  photos?: PhotoRef[];
  visits?: VisitRef[];
}): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  events.push({
    id: `cust-created-${input.customerId}`,
    at: input.createdAt,
    kind: "profile_created",
    title: "Customer profile created",
  });
  for (const p of input.projects) {
    events.push({
      id: `proj-${p.id}`,
      at: p.created_at,
      kind: "project_created",
      title: "Project created",
      detail: p.name,
      href: `/projects/${p.id}`,
      hrefLabel: "Open project",
    });
  }
  for (const n of input.notes) {
    const snippet = n.body.trim().split(/\s+/).slice(0, 16).join(" ");
    events.push({
      id: `note-${n.id}`,
      at: n.created_at,
      kind: "note_added",
      title: n.job_id || n.project_id ? "Note added" : "Private note added",
      detail: `${n.author_name}: ${snippet}${snippet.length < n.body.trim().length ? "…" : ""}`,
    });
  }
  for (const m of input.messages) {
    events.push({
      id: `msg-${m.id}`,
      at: m.created_at,
      kind: "message",
      title: `${m.direction === "inbound" ? "Inbound" : "Outbound"} ${m.channel}`,
      detail: m.subject ?? undefined,
    });
  }
  for (const ph of input.photos ?? []) {
    events.push({
      id: `photo-${ph.id}`,
      at: ph.created_at,
      kind: "photo",
      title: ph.kind === "before" ? "Before photo added" : "Completion photo added",
    });
  }
  for (const v of input.visits ?? []) {
    events.push({
      id: `visit-${v.id}`,
      at: v.created_at ?? v.starts_at,
      kind: "visit",
      title: "Visit scheduled",
      detail: v.title,
      href: `/jobs/${v.id}`,
      hrefLabel: "Open visit",
    });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
