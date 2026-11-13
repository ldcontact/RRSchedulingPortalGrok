import { describe, expect, it } from "vitest";
import { absoluteUpdateLink, buildUpdateEmail } from "./email";

describe("update notification email", () => {
  it("renders one email per event with a thread link and no customer copy", () => {
    const mail = buildUpdateEmail({
      actorName: "Ronan O'Connor",
      contextTitle: "Karla Gonzalez",
      kind: "mention",
      body: "Aaron, can we confirm the attic baffles before we schedule?",
      link: "/sales/deals/mon-11633298670#update-u-live-1",
      postedAt: "2026-07-23T18:49:08.000Z",
    });
    expect(mail.subject).toBe("Ronan O'Connor mentioned you on Karla Gonzalez");
    expect(mail.text).toContain("Open the thread:");
    expect(mail.text).toContain("Customers are never copied");
    expect(mail.html).toContain("Aaron, can we confirm the attic baffles before we schedule?");
    expect(mail.html).toContain(absoluteUpdateLink("/sales/deals/mon-11633298670#update-u-live-1"));
    expect(mail.html).not.toContain("Karla Gonzalez</a>"); // not a mailto to the customer
  });
});
