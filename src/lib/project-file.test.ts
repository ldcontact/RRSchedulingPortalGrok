import { describe, expect, it } from "vitest";
import {
  formatFileSize,
  kindForFile,
  mimeForFile,
  PROJECT_FILE_MAX_BYTES,
  sanitizeFilename,
  storageExtFor,
  validateProjectFile,
} from "./project-file";

const f = (name: string, type: string, size = 1024) => ({ name, type, size });

describe("kindForFile / mimeForFile", () => {
  it("recognizes PDF, Excel, CSV, and images", () => {
    expect(kindForFile(f("scope.pdf", "application/pdf"))).toBe("pdf");
    expect(kindForFile(f("schedule.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))).toBe("xlsx");
    expect(kindForFile(f("old.xls", "application/vnd.ms-excel"))).toBe("xls");
    expect(kindForFile(f("rebate.csv", "text/csv"))).toBe("csv");
    expect(kindForFile(f("panel.jpg", "image/jpeg"))).toBe("image");
    expect(kindForFile(f("shot.heic", "image/heic"))).toBe("image");
  });

  it("falls back to the extension when the MIME is missing or generic", () => {
    expect(kindForFile(f("scope.PDF", ""))).toBe("pdf");
    expect(kindForFile(f("sheet.xlsx", "application/octet-stream"))).toBe("xlsx");
    expect(mimeForFile(f("notes.csv", ""))).toBe("text/csv");
  });

  it("rejects types that are not on the allow-list", () => {
    expect(kindForFile(f("malware.exe", "application/x-msdownload"))).toBeNull();
    expect(kindForFile(f("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).toBeNull();
    expect(kindForFile(f("archive.zip", "application/zip"))).toBeNull();
  });
});

describe("validateProjectFile", () => {
  it("accepts an allowed file under 25 MB", () => {
    expect(validateProjectFile(f("scope.pdf", "application/pdf", 1_200_000))).toBeNull();
  });

  it("rejects empty, oversized, and disallowed files", () => {
    expect(validateProjectFile(f("scope.pdf", "application/pdf", 0))).toMatch(/empty/);
    expect(validateProjectFile(f("huge.pdf", "application/pdf", PROJECT_FILE_MAX_BYTES + 1))).toMatch(/25 MB/);
    expect(validateProjectFile(f("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 10))).toMatch(/not a PDF/);
  });

  it("strips path components from the display name", () => {
    expect(sanitizeFilename("../../secret/scope.pdf")).toBe("scope.pdf");
    expect(sanitizeFilename("a".repeat(300)).length).toBe(255);
  });
});

describe("formatFileSize and storage extension", () => {
  it("formats bytes, KB, and MB", () => {
    expect(formatFileSize(200)).toBe("200 B");
    expect(formatFileSize(84 * 1024)).toBe("84 KB");
    expect(formatFileSize(1.2 * 1024 * 1024)).toBe("1.2 MB");
  });

  it("keeps the original extension", () => {
    expect(storageExtFor(f("Scope.PDF", "application/pdf"))).toBe(".pdf");
    expect(storageExtFor(f("sheet.xlsx", ""))).toBe(".xlsx");
    expect(storageExtFor(f("pic.heic", "image/heic"))).toBe(".heic");
  });
});
