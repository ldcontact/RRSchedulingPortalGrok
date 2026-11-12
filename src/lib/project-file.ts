/** Project and visit documents: allowed types, size, icons, and display helpers. */

export const PROJECT_FILE_MAX_BYTES = 25 * 1024 * 1024;

export const PROJECT_FILE_ACCEPT = [
  ".pdf",
  ".xlsx",
  ".xls",
  ".csv",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
].join(",");

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

export type ProjectFileKind = "pdf" | "xlsx" | "xls" | "csv" | "image";

export const PROJECT_FILE_KIND_LABEL: Record<ProjectFileKind, string> = {
  pdf: "PDF",
  xlsx: "Excel",
  xls: "Excel",
  csv: "CSV",
  image: "Image",
};

export const PROJECT_FILE_KIND_COLOR: Record<ProjectFileKind, string> = {
  pdf: "#dc2626",
  xlsx: "#15803d",
  xls: "#15803d",
  csv: "#0e7490",
  image: "#d97706",
};

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/csv",
  ...IMAGE_MIME,
]);

export function fileExtension(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function sanitizeFilename(name: string): string {
  const base = (name.split(/[/\\]/).pop() ?? "file").replace(/[\u0000-\u001f\u007f]/g, "").trim() || "file";
  return base.slice(0, 255);
}

export function mimeForFile(file: { name: string; type?: string }): string {
  const mime = (file.type || "").toLowerCase().split(";")[0].trim();
  if (ALLOWED_MIME.has(mime) && mime !== "application/octet-stream") return mime === "application/csv" ? "text/csv" : mime;
  const mapped = MIME_BY_EXT[fileExtension(file.name)];
  return mapped ?? mime;
}

export function kindForFile(file: { name: string; type?: string }): ProjectFileKind | null {
  const ext = fileExtension(file.name);
  const mime = mimeForFile(file);
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "xlsx" || mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (ext === "xls" || mime === "application/vnd.ms-excel") return "xls";
  if (ext === "csv" || mime === "text/csv" || mime === "application/csv") return "csv";
  if (IMAGE_MIME.has(mime) || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)) return "image";
  return null;
}

export function isImageFile(file: { name?: string; filename?: string; type?: string; mime?: string }): boolean {
  return kindForFile({ name: file.name ?? file.filename ?? "", type: file.mime ?? file.type }) === "image";
}

export function validateProjectFile(file: { name: string; type?: string; size: number }): string | null {
  const name = sanitizeFilename(file.name);
  if (!name) return "That file needs a name.";
  if (!kindForFile({ name, type: file.type })) {
    return `${name} is not a PDF, Excel, CSV, or image.`;
  }
  if (file.size <= 0) return `${name} is empty.`;
  if (file.size > PROJECT_FILE_MAX_BYTES) return `${name} is larger than 25 MB.`;
  return null;
}

export function storageExtFor(file: { name: string; type?: string }): string {
  const ext = fileExtension(sanitizeFilename(file.name));
  if (ext && MIME_BY_EXT[ext]) return `.${ext}`;
  const kind = kindForFile(file);
  if (kind === "pdf") return ".pdf";
  if (kind === "xlsx") return ".xlsx";
  if (kind === "xls") return ".xls";
  if (kind === "csv") return ".csv";
  if (kind === "image") {
    const mime = mimeForFile(file);
    if (mime === "image/png") return ".png";
    if (mime === "image/webp") return ".webp";
    if (mime === "image/heic") return ".heic";
    if (mime === "image/heif") return ".heif";
    return ".jpg";
  }
  return "";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return kb >= 10 ? `${Math.round(kb)} KB` : `${kb.toFixed(1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export function projectFileStoragePath(projectId: string, jobId: string | null, ext: string): string {
  const id = crypto.randomUUID();
  const suffix = ext.startsWith(".") ? ext : ext ? `.${ext}` : "";
  return jobId ? `${projectId}/visit/${jobId}/${id}${suffix}` : `${projectId}/project/${id}${suffix}`;
}
