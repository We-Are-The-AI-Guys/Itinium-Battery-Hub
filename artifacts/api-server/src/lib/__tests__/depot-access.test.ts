import { describe, expect, it } from "vitest";
import { mayAccessDepot } from "../depot-access";

describe("explicit depot access", () => {
  const user = { role: "team_leader", clientId: 1, permittedLocationIds: [10, 11] };
  it("allows every explicitly assigned site", () => {
    expect(mayAccessDepot(user, { clientId: 1, locationId: 10 })).toBe(true);
    expect(mayAccessDepot(user, { clientId: 1, locationId: 11 })).toBe(true);
  });
  it("rejects other depots in the same client", () => {
    expect(mayAccessDepot(user, { clientId: 1, locationId: 12 })).toBe(false);
  });
  it("requires the client as well as the location", () => {
    expect(mayAccessDepot(user, { clientId: 2, locationId: 10 })).toBe(false);
  });
  it("denies missing memberships and legacy ownership", () => {
    expect(mayAccessDepot({ ...user, permittedLocationIds: [] }, { clientId: 1, locationId: 10 })).toBe(false);
    expect(mayAccessDepot(user, { clientId: null, locationId: 10 })).toBe(false);
    expect(mayAccessDepot(user, { clientId: 1, locationId: null })).toBe(false);
  });
  it("keeps staff access separate from collectors", () => {
    expect(mayAccessDepot({ ...user, role: "head_office_admin" }, { clientId: null, locationId: null })).toBe(true);
    expect(mayAccessDepot({ ...user, role: "accounts" }, { clientId: null, locationId: null })).toBe(false);
    expect(mayAccessDepot({ ...user, role: "collection_company" }, { clientId: 1, locationId: 10 })).toBe(false);
  });
});
