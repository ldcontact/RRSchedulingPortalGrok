import { describe, expect, it } from "vitest";
import { linkify, parseTaskDescription } from "./task-description";

const PORTAL = `1. Schedule open as a default monthly or save it to the profile of the user
2. Also the filter Everyone should be defaulted to the logged in user and have a filter for the type of the project
3. Any address box should do the address look up
4. New project screen
5. Customer can be selected by typing in the address and it is searchable by address, phone and customer name
6. When adding the new project for the customer, customer info should be pre filed already based on the parent customer information
7. New project have to have ability to add attachments
8. Required photos for project Schuld be set up on the level of the visit not on the level of the project
9. When service is ready to be billed gets sent for billing queue
10. Tasks page to handle things
11. Add warranty for manufacturer
11. DONE - Delete button for project, schedule, customer
12. Photo requirement, scope of work pre end post photos has to be added to site visit`;

describe("parseTaskDescription", () => {
  it("returns nothing for empty input", () => {
    expect(parseTaskDescription(null)).toEqual([]);
    expect(parseTaskDescription("   \n  ")).toEqual([]);
  });

  it("keeps a plain paragraph and original line breaks", () => {
    const [block] = parseTaskDescription("First line\nSecond line");
    expect(block).toEqual({ type: "paragraph", spans: [{ type: "text", text: "First line\nSecond line" }] });
  });

  it("renders numbered lines as a list and preserves duplicate numbers", () => {
    const blocks = parseTaskDescription(PORTAL);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("list");
    if (blocks[0].type !== "list") return;
    expect(blocks[0].items.map((i) => i.number)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "11", "12"]);
    expect(blocks[0].items[11].spans).toEqual([{ type: "text", text: "DONE - Delete button for project, schedule, customer" }]);
    expect(blocks[0].items[0].spans).toEqual([{ type: "text", text: "Schedule open as a default monthly or save it to the profile of the user" }]);
  });

  it("appends wrapped lines to the current item without dropping text", () => {
    const [block] = parseTaskDescription("1. First item\ncontinues here\n2. Second");
    expect(block.type).toBe("list");
    if (block.type !== "list") return;
    expect(block.items).toEqual([
      { number: "1", spans: [{ type: "text", text: "First item\ncontinues here" }] },
      { number: "2", spans: [{ type: "text", text: "Second" }] },
    ]);
  });

  it("keeps intro text, a list, and a closing paragraph as separate blocks", () => {
    const blocks = parseTaskDescription("Please cover:\n\n1. Lights\n2. Sensors\n\nThanks — see https://example.com/scope.");
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "list", "paragraph"]);
    if (blocks[1].type !== "list" || blocks[2].type !== "paragraph") return;
    expect(blocks[1].items.map((i) => i.number)).toEqual(["1", "2"]);
    expect(blocks[2].spans).toEqual([
      { type: "text", text: "Thanks — see " },
      { type: "link", text: "https://example.com/scope", href: "https://example.com/scope" },
      { type: "text", text: "." },
    ]);
  });
});

describe("linkify", () => {
  it("keeps trailing punctuation out of the href", () => {
    expect(linkify("See https://rr-scheduling-portal-grokv1.vercel.app/tasks/t1.")).toEqual([
      { type: "text", text: "See " },
      { type: "link", text: "https://rr-scheduling-portal-grokv1.vercel.app/tasks/t1", href: "https://rr-scheduling-portal-grokv1.vercel.app/tasks/t1" },
      { type: "text", text: "." },
    ]);
  });

  it("passes through text with no URLs", () => {
    expect(linkify("No links here")).toEqual([{ type: "text", text: "No links here" }]);
  });
});
