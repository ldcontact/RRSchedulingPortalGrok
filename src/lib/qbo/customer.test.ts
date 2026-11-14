import { describe, expect, it } from "vitest";
import {
  buildCustomerCreatePayload, desiredCustomerFromPortal, isCompanyCustomer, isValidEmail,
  sparseCustomerPatch, splitPersonName,
} from "./customer";

describe("portal → QuickBooks customer mapping", () => {
  it("treats 2626 N Lincoln Corporation + Rodney Rajnauth as a company with given/family names", () => {
    expect(isCompanyCustomer("2626 N Lincoln Corporation", "Rodney Rajnauth")).toBe(true);
    const d = desiredCustomerFromPortal({
      id: "c-lincoln", name: "2626 N Lincoln Corporation",
      email: "rjrajnauth@gmail.com", phone: "(312) 618-4349",
      address: "2626 N Lincoln Ave", city: "Chicago", state: "IL", zip: "60614",
      contactName: "Rodney Rajnauth", contactEmail: "rjrajnauth@gmail.com", contactPhone: "(312) 618-4349",
      siteAddress: "2626 N Lincoln Ave", siteCity: "Chicago", siteState: "IL", siteZip: "60614",
    });
    expect(d).toMatchObject({
      displayName: "2626 N Lincoln Corporation", companyName: "2626 N Lincoln Corporation",
      givenName: "Rodney", familyName: "Rajnauth", email: "rjrajnauth@gmail.com", phone: "(312) 618-4349", mobile: null,
      notes: "RR Scheduler customer c-lincoln",
    });
    expect(d.billAddr).toEqual({ line1: "2626 N Lincoln Ave", city: "Chicago", state: "IL", zip: "60614", country: "US" });
    expect(d.shipAddr).toEqual(d.billAddr);
    const body = buildCustomerCreatePayload(d);
    expect(body.GivenName).toBe("Rodney");
    expect(body.CompanyName).toBe("2626 N Lincoln Corporation");
    expect((body.BillAddr as { Country: string }).Country).toBe("US");
    expect((body.ShipAddr as { Country: string }).Country).toBe("US");
  });
  it("does not invent first/last names for a company with no separate contact", () => {
    const d = desiredCustomerFromPortal({ id: "c2", name: "Golf Road Auto Body", address: "905 E Golf Rd", city: "Schaumburg", state: "IL", zip: "60173" });
    expect(d.companyName).toBeNull();
    expect(d.givenName).toBeNull();
    expect(d.familyName).toBeNull();
  });
  it("splits a person customer name and only sets Mobile when the contact phone is different", () => {
    expect(splitPersonName("Dr. Ken Yamamoto")).toEqual({ given: "Ken", family: "Yamamoto" });
    const d = desiredCustomerFromPortal({
      id: "c8", name: "Ken Yamamoto", phone: "847-555-0100", contactName: "Ken Yamamoto", contactPhone: "847-555-0199",
    });
    expect(d).toMatchObject({ companyName: null, givenName: "Ken", familyName: "Yamamoto", phone: "847-555-0100", mobile: "847-555-0199" });
  });
  it("never overwrites a non-blank QuickBooks address field when filling Country", () => {
    const patch = sparseCustomerPatch({
      Id: "1",
      BillAddr: { Line1: "2626 N Lincoln Ave", City: "Chicago", CountrySubDivisionCode: "IL", PostalCode: "60614" },
    }, desiredCustomerFromPortal({
      id: "c", name: "2626 N Lincoln Corporation", contactName: "Rodney Rajnauth",
      address: "SHOULD NOT APPLY", city: "X", state: "YY", zip: "00000",
    }));
    expect(patch?.BillAddr).toEqual({ Line1: "2626 N Lincoln Ave", City: "Chicago", CountrySubDivisionCode: "IL", PostalCode: "60614", Country: "US" });
    expect(patch?.GivenName).toBe("Rodney");
    expect(patch?.CompanyName).toBe("2626 N Lincoln Corporation");
  });
  it("validates send-to emails", () => {
    expect(isValidEmail("office@example.com")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});
