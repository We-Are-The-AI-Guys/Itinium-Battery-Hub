import { describe, it, expect } from "vitest";
import { policyAllows, validateRoles, customerJob, customerBattery, canSeeFinance } from "../access-policy";
import { mayAccessDepot, jobScope } from "../depot-access";
import { PgDialect } from "drizzle-orm/pg-core";
const user = (roles: string[], clientId: number | null = 1) => ({ role: roles[0], roles, clientId, permittedLocationIds: [10] });
describe("V16 access boundaries", () => {
  it("Warehouse can read its site schedule but cannot manage it or gain finance access", () => {
    const p = user(["depot_user"]);
    expect(policyAllows(p, "GET", "/jobs/schedule")).toBe(true);
    expect(policyAllows(user(["depot_user"], null), "GET", "/jobs/schedule")).toBe(false);
    expect(policyAllows(p, "POST", "/jobs/:id/schedule/confirm")).toBe(false);
    expect(policyAllows(p, "PATCH", "/jobs/:id/admin")).toBe(false);
    expect(policyAllows(p, "GET", "/dashboard/stats")).toBe(false);
    expect(canSeeFinance(p)).toBe(false);
    expect(mayAccessDepot(p, { clientId: 1, locationId: 10 })).toBe(true);
    expect(mayAccessDepot(p, { clientId: 1, locationId: 11 })).toBe(false);
    expect(mayAccessDepot(p, { clientId: 2, locationId: 10 })).toBe(false);
    const query = new PgDialect().sqlToQuery(jobScope(p));
    expect(query.sql).toContain('"jobs"."client_id"');
    expect(query.sql).toContain('"jobs"."location_id"');
    expect(query.params).toEqual([1, 10]);
    expect(new PgDialect().sqlToQuery(jobScope({ ...p, permittedLocationIds: [] })).sql).toBe("false");
  });
  it.each(["lead_client", "accounts", "team_leader", "depot_user"])("%s cannot cross clients or mutate jobs", role => {
    const p = user([role]);
    expect(mayAccessDepot(p, { clientId: 2, locationId: 10 })).toBe(false);
    for (const route of ["/jobs/:id/status", "/jobs/:id/admin", "/users/:id", "/clients/:clientId/locations/:id"]) {
      expect(policyAllows(p, "PATCH", route)).toBe(false);
    }
    expect(policyAllows(p, "POST", "/jobs")).toBe(true);
    expect(policyAllows(p, "GET", "/jobs")).toBe(true);
  });
  it("combines feature permissions without crossing client scope", () => {
    const p = user(["depot_user", "accounts"]);
    expect(mayAccessDepot(p, { clientId: 1, locationId: 99 })).toBe(true);
    expect(mayAccessDepot(p, { clientId: 2, locationId: 99 })).toBe(false);
    expect(canSeeFinance(p)).toBe(true);
    expect(policyAllows(p, "GET", "/settings")).toBe(false);
    expect(policyAllows(p, "GET", "/correction-audit")).toBe(false);
  });
  it.each(["team_leader", "depot_user"])("%s restricted to permitted locations without finance", role => {
    expect(mayAccessDepot(user([role]), { clientId: 1, locationId: 99 })).toBe(false);
    expect(canSeeFinance(user([role]))).toBe(false);
  });
  it("fails closed for legacy accounts without a client", () => {
    const p = user(["accounts"], null);
    expect(canSeeFinance(p)).toBe(false);
    expect(policyAllows(p, "GET", "/dashboard/stats")).toBe(false);
    expect(mayAccessDepot(p, { clientId: 1, locationId: 10 })).toBe(false);
  });
  it("warehouse cannot open dashboard and collector cannot use customer workflow", () => {
    expect(policyAllows(user(["depot_user"]), "GET", "/dashboard/stats")).toBe(false);
    for (const path of ["/dashboard/stats", "/jobs", "/stillages", "/job-drafts"]) {
      expect(policyAllows(user(["collection_company"], null), "GET", path)).toBe(false);
    }
  });
  it("requires one client and rejects mixed internal/customer roles", () => {
    expect(validateRoles(["accounts"], null, null)).toBeTruthy();
    expect(validateRoles(["head_office_admin", "accounts"], 1, null)).toBeTruthy();
    expect(validateRoles(["team_leader", "accounts"], 1, null)).toBeNull();
  });
  it("allowlists customer records instead of exposing new internal fields", () => {
    expect(customerJob({ id: 1, tonnage: "2", grossProfit: "5", totalInvoiceValue: "10", pbContentKgSum: "7", futureSecret: "x" })).toEqual({ id: 1, tonnage: "2" });
    expect(customerBattery({ id: 1, cellType: "X", estimatedWeightKg: "5", resolvedByName: "secret", pbContentKg: "9" })).toEqual({ id: 1, cellType: "X" });
  });
});
