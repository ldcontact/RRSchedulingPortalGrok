import { describe, expect, it } from "vitest";
import { highlightChunks, tokensFromQuery } from "./highlight-match";

describe("tokensFromQuery", () => {
  it("splits on whitespace and drops empties", () => {
    expect(tokensFromQuery("  Irving  Park ")).toEqual(["Irving", "Park"]);
    expect(tokensFromQuery("")).toEqual([]);
    expect(tokensFromQuery("   ")).toEqual([]);
  });
  it("dedupes repeated tokens", () => {
    expect(tokensFromQuery("Park Park")).toEqual(["Park"]);
  });
});

describe("highlightChunks", () => {
  it("returns the full string unmatched when the query is empty", () => {
    expect(highlightChunks("2250 Lunt Ave", "")).toEqual([{ text: "2250 Lunt Ave", match: false }]);
  });
  it("returns no chunks for empty text", () => {
    expect(highlightChunks("", "Lunt")).toEqual([]);
  });
  it("highlights a case-insensitive substring", () => {
    expect(highlightChunks("2250 Lunt Ave Elk Grove Village", "lunt")).toEqual([
      { text: "2250 ", match: false },
      { text: "Lunt", match: true },
      { text: " Ave Elk Grove Village", match: false },
    ]);
  });
  it("highlights every token in name or address", () => {
    expect(highlightChunks("122 E Irving Park Rd, Roselle, IL 60172", "Irving Park")).toEqual([
      { text: "122 E ", match: false },
      { text: "Irving", match: true },
      { text: " ", match: false },
      { text: "Park", match: true },
      { text: " Rd, Roselle, IL 60172", match: false },
    ]);
  });
  it("escapes regex metacharacters in the query", () => {
    expect(highlightChunks("Room (2x4) troffers", "(2x4)")).toEqual([
      { text: "Room ", match: false },
      { text: "(2x4)", match: true },
      { text: " troffers", match: false },
    ]);
  });
});
