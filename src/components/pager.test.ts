import { describe, expect, it } from "vitest";
import { showingText } from "./pager";
import { LIST_PAGE_SIZE } from "@/lib/types";

describe("Customers/Projects list paging at 25 rows", () => {
  it("is 25 rows per page", () => {
    expect(LIST_PAGE_SIZE).toBe(25);
  });
  it("computes the showing range and last page from total and size", () => {
    expect(showingText(1, LIST_PAGE_SIZE, 4600)).toBe("Showing 1–25 of 4,600");
    expect(showingText(2, LIST_PAGE_SIZE, 4600)).toBe("Showing 26–50 of 4,600");
    expect(showingText(184, LIST_PAGE_SIZE, 4600)).toBe("Showing 4,576–4,600 of 4,600");
    expect(Math.ceil(4600 / LIST_PAGE_SIZE)).toBe(184);
    expect(Math.ceil(8000 / LIST_PAGE_SIZE)).toBe(320);
    expect(showingText(1, LIST_PAGE_SIZE, 0)).toBe("Showing 0 of 0");
    expect(showingText(1, LIST_PAGE_SIZE, 8)).toBe("Showing 1–8 of 8");
  });
});
