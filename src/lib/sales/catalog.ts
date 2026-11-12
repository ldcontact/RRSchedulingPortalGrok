/** Canonical pipelines and stages. Stage names follow the Monday boards; "Job" is labeled "Project". */

export type PipelineSlug = "single_family_whe" | "multifamily_whe" | "led_lighting" | "hvac";

export type StageDef = {
  slug: string;
  name: string;
  color: string;
  bg: string;
  terminal?: boolean;
  sort: number;
};

export const PIPELINE_DEFS: { slug: PipelineSlug; name: string; stages: StageDef[] }[] = [
  {
    slug: "single_family_whe",
    name: "Single Family WHE",
    stages: [
      { slug: "potential_lead", name: "Potential Lead", color: "#8a9390", bg: "#e8eae8", sort: 0 },
      { slug: "contacted_comed", name: "Contacted ComEd Verification", color: "#c2410c", bg: "#ffedd5", sort: 1 },
      { slug: "declined", name: "Declined By Projects", color: "#be185d", bg: "#fce7f3", terminal: true, sort: 2 },
      { slug: "ready_for_assessment", name: "Ready For Assessment", color: "#1d4ed8", bg: "#dbeafe", sort: 3 },
      { slug: "assessment_scheduled", name: "Assessment Scheduled", color: "#9f1239", bg: "#ffe4e6", sort: 4 },
      { slug: "assessment_completed", name: "Assessment Completed", color: "#047857", bg: "#d1fae5", sort: 5 },
      { slug: "rise_data_entered", name: "RISE - Project Assessment Data Entered", color: "#6d28d9", bg: "#ede9fe", sort: 6 },
      { slug: "approved_ready", name: "Approved - Ready to Schedule", color: "#0369a1", bg: "#e0f2fe", sort: 7 },
      { slug: "project_scheduled", name: "Project Scheduled", color: "#1e40af", bg: "#dbeafe", sort: 8 },
      { slug: "project_completed", name: "Project Completed", color: "#115e59", bg: "#ccfbf1", sort: 9 },
      { slug: "permit_pending", name: "City Permit Final Pending", color: "#a16207", bg: "#fef3c7", sort: 10 },
      { slug: "permit_final", name: "City Permit Final Completed", color: "#1f2937", bg: "#e5e7eb", terminal: true, sort: 11 },
    ],
  },
  {
    slug: "multifamily_whe",
    name: "Multifamily WHE",
    stages: [
      { slug: "potential_lead", name: "Potential Lead", color: "#8a9390", bg: "#e8eae8", sort: 0 },
      { slug: "contacted_comed", name: "Contacted ComEd Verification", color: "#c2410c", bg: "#ffedd5", sort: 1 },
      { slug: "ready_for_assessment", name: "Ready For Assessment", color: "#1d4ed8", bg: "#dbeafe", sort: 2 },
      { slug: "assessment_scheduled", name: "Assessment Scheduled", color: "#9f1239", bg: "#ffe4e6", sort: 3 },
      { slug: "assessment_completed", name: "Assessment Completed", color: "#047857", bg: "#d1fae5", sort: 4 },
      { slug: "rise_data_entered", name: "RISE - Project Assessment Data Entered", color: "#6d28d9", bg: "#ede9fe", sort: 5 },
      { slug: "approved_ready", name: "Approved - Ready to Schedule", color: "#0369a1", bg: "#e0f2fe", sort: 6 },
      { slug: "project_scheduled", name: "Project Scheduled", color: "#1e40af", bg: "#dbeafe", sort: 7 },
      { slug: "project_completed", name: "Project Completed", color: "#115e59", bg: "#ccfbf1", sort: 8 },
      { slug: "not_feasible", name: "Project Not Feasible", color: "#1f2937", bg: "#e5e7eb", terminal: true, sort: 9 },
    ],
  },
  {
    slug: "led_lighting",
    name: "LED Lighting",
    stages: genericStages(),
  },
  {
    slug: "hvac",
    name: "HVAC",
    stages: genericStages(),
  },
];

function genericStages(): StageDef[] {
  return [
    { slug: "potential_lead", name: "Potential Lead", color: "#8a9390", bg: "#e8eae8", sort: 0 },
    { slug: "contacted", name: "Contacted", color: "#c2410c", bg: "#ffedd5", sort: 1 },
    { slug: "assessment_scheduled", name: "Assessment Scheduled", color: "#9f1239", bg: "#ffe4e6", sort: 2 },
    { slug: "assessment_completed", name: "Assessment Completed", color: "#047857", bg: "#d1fae5", sort: 3 },
    { slug: "approved_ready", name: "Approved - Ready to Schedule", color: "#0369a1", bg: "#e0f2fe", sort: 4 },
    { slug: "project_scheduled", name: "Project Scheduled", color: "#1e40af", bg: "#dbeafe", sort: 5 },
    { slug: "project_completed", name: "Project Completed", color: "#115e59", bg: "#ccfbf1", sort: 6 },
    { slug: "declined", name: "Declined", color: "#be185d", bg: "#fce7f3", terminal: true, sort: 7 },
  ];
}

export const PRIORITIES = ["High", "Medium", "Low"] as const;
export type SalesPriority = (typeof PRIORITIES)[number];

export const LEAD_SOURCES = ["web_form", "xagent", "email", "manual", "monday"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  web_form: "Web form",
  xagent: "xAgent phone",
  email: "Inbound email",
  manual: "Manual",
  monday: "Monday import",
};

export function pipelineBySlug(slug: string) {
  return PIPELINE_DEFS.find((p) => p.slug === slug);
}

export function stageBySlug(pipelineSlug: string, stageSlug: string) {
  return pipelineBySlug(pipelineSlug)?.stages.find((s) => s.slug === stageSlug);
}

export const APPROVED_SLUG = "approved_ready";
export const ASSESSMENT_SCHEDULED_SLUG = "assessment_scheduled";
export const PROJECT_SCHEDULED_SLUG = "project_scheduled";
