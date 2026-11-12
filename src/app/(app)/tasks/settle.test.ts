import { describe, expect, it, vi } from "vitest";
import { settle } from "./settle";

describe("settle", () => {
  it("returns the resolved value", async () => {
    await expect(settle("ok", Promise.resolve(7), 0)).resolves.toEqual({ ok: true, value: 7 });
  });

  it("returns the fallback when the promise rejects", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(settle("customers", Promise.reject(new Error("statement timeout")), [])).resolves.toEqual({ ok: false, value: [] });
    expect(err).toHaveBeenCalledWith("[tasks] customers failed:", "statement timeout");
    err.mockRestore();
  });
});
