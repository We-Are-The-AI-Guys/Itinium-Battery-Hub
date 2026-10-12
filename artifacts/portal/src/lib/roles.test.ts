import { describe, it, expect } from "vitest";
import { rolesOf, homePath, isWarehouseOnly, canSeeInvoiceTotal, canSeeSchedule, isUnassigned, isAdmin, isCollector } from "./roles";
import { validateAccess, primaryRole } from "../components/user-access-dialog";
import { customerStatusLabel } from "./v16-api";

const u = (roles: string[], clientId: number | null = 1, role = roles[0] || "") => ({ roles, role, clientId });

describe("roles union", () => {
  it("falls back to legacy role", () => {
    expect(rolesOf({ role: "team_leader", roles: [] })).toEqual(["team_leader"]);
    expect(rolesOf({ role: "depot_user", roles: ["team_leader", "depot_user"] })).toEqual(["team_leader", "depot_user"]);
  });
  it("routes each persona to its landing page", () => {
    expect(homePath(u(["head_office_admin"], null))).toBe("/dashboard");
    expect(homePath(u(["collection_company"], null))).toBe("/collections");
    expect(homePath(u(["depot_user"]))).toBe("/operational-overview");
    expect(homePath(u(["depot_user", "team_leader"]))).toBe("/dashboard");
    expect(homePath(u(["lead_client"]))).toBe("/dashboard");
  });
  it("restricts customer accounts without a client, including accounts", () => {
    expect(isUnassigned(u(["accounts"], null))).toBe(true);
    expect(homePath(u(["accounts"], null))).toBe("/");
    expect(isAdmin(u(["accounts"]))).toBe(false);
    expect(isUnassigned({ role: "", roles: [] })).toBe(true);
  });
  it("financial and schedule permissions", () => {
    expect(canSeeInvoiceTotal(u(["lead_client"]))).toBe(true);
    expect(canSeeInvoiceTotal(u(["accounts"]))).toBe(true);
    expect(canSeeInvoiceTotal(u(["team_leader"]))).toBe(false);
    expect(canSeeInvoiceTotal(u(["depot_user"]))).toBe(false);
    expect(canSeeSchedule(u(["team_leader"]))).toBe(true);
    expect(canSeeSchedule(u(["depot_user"]))).toBe(true);
    expect(isWarehouseOnly(u(["depot_user"]))).toBe(true);
    expect(isCollector(u(["collection_company"]))).toBe(true);
  });
  it("shows Requested for request status and hides invoice stages", () => {
    expect(customerStatusLabel("request")).toBe("Requested");
    expect(customerStatusLabel("awaiting_invoice")).toBe("Processing");
  });
});

describe("access validation", () => {
  const base = { role: "", clientId: 1, permittedLocationIds: [] as number[], locationId: null as number | null, collectionCompanyId: null as number | null };
  it("requires client for customer roles", () => {
    expect(validateAccess({ ...base, roles: ["team_leader"], clientId: null })).toMatch(/client/);
  });
  it("never combines admin or collector with customer roles", () => {
    expect(validateAccess({ ...base, roles: ["head_office_admin", "accounts"] })).toMatch(/cannot be combined/);
    expect(validateAccess({ ...base, roles: ["collection_company", "depot_user"], collectionCompanyId: 2 })).toMatch(/cannot be combined/);
  });
  it("requires company for collector", () => {
    expect(validateAccess({ ...base, roles: ["collection_company"], clientId: null })).toMatch(/company/);
  });
  it("default location must be within subset for scoped roles", () => {
    expect(validateAccess({ ...base, roles: ["depot_user"], permittedLocationIds: [3], locationId: 4 })).toMatch(/Default location/);
    expect(validateAccess({ ...base, roles: ["depot_user"], permittedLocationIds: [3], locationId: 3 })).toBe("");
    expect(validateAccess({ ...base, roles: ["lead_client"], locationId: 9 })).toBe("");
  });
  it("picks a legacy primary role", () => {
    expect(primaryRole(["depot_user", "lead_client"])).toBe("lead_client");
  });
});
