import { describe, expect, it, vi } from "vitest";
import { mayProposeCollectionSchedule } from "../collection-companies";
import { mayAccessCollectionConversation } from "../collection-communication";
import { requireRole } from "../../middlewares/auth";

const job = { collectionCompanyId: 5, status: "request", scheduleStatus: "unassigned" };

describe("collection company access", () => {
  it("accepts the collector role at the scheduling middleware", () => {
    const next = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    requireRole("collection_company")({ user: { role: "collection_company" } } as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a non-collector at the scheduling middleware", () => {
    const next = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    requireRole("collection_company")({ user: { role: "accounts" } } as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("proposes schedules and schedule changes only for the linked company", () => {
    expect(mayProposeCollectionSchedule({ role: "collection_company", collectionCompanyId: 5 }, job)).toBe(true);
    expect(mayProposeCollectionSchedule({ role: "collection_company", collectionCompanyId: 8 }, job)).toBe(false);
    expect(mayProposeCollectionSchedule({ role: "collection_company", collectionCompanyId: null }, job)).toBe(false);
    expect(mayProposeCollectionSchedule({ role: "accounts", collectionCompanyId: 5 }, job)).toBe(false);
    expect(mayProposeCollectionSchedule({ role: "collection_company", collectionCompanyId: 5 }, { ...job, scheduleStatus: "confirmed" })).toBe(true);
  });

  it("hides other companies' conversations and assignment history", () => {
    expect(mayAccessCollectionConversation({ role: "collection_company", collectionCompanyId: 5 }, job)).toBe(true);
    expect(mayAccessCollectionConversation({ role: "collection_company", collectionCompanyId: 8 }, job)).toBe(false);
    expect(mayAccessCollectionConversation({ role: "collection_company", collectionCompanyId: null }, job)).toBe(false);
    expect(mayAccessCollectionConversation({ role: "accounts", collectionCompanyId: null }, job)).toBe(true);
  });
});