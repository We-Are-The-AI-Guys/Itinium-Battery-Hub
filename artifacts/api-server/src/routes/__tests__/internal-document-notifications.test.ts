import { beforeEach, expect, it, vi } from "vitest";
import { notifyAccountsStatementUploaded, notifyAdminsDocumentsComplete, dispatchNotification } from "../../lib/notifications";

const state = vi.hoisted(() => ({ filters: [] as unknown[][], rows: [] as unknown[][], notifications: [] as any[], email: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: state.email }; } }));
vi.mock("@workspace/db", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  return { db: {
    select: () => {
      const rows = state.rows.shift() ?? [];
      const query: any = { from: () => query, where: (filter: any) => {
        state.filters.push(dialect.sqlToQuery(filter).params); return query;
      }, then: (resolve: any) => Promise.resolve(rows).then(resolve) };
      return query;
    },
    insert: () => ({ values: async (row: any) => { state.notifications.push(row); } }),
  } };
});
beforeEach(() => {
  state.filters = []; state.notifications = []; state.email.mockClear();
  state.rows = [[{ id: 99001 }], [{ id: 99001, role: "head_office_admin", isActive: true }], [{ id: 99005 }], []];
});
it.each([
  ["statement", () => notifyAccountsStatementUploaded({ id: 99005, reference: "FIXTURE", clientName: "Fictional Client", depot: "Fictional Site" }, "fictional-statement.pdf")],
  ["completion", () => notifyAdminsDocumentsComplete({ id: 99005, reference: "FIXTURE", clientName: "Fictional Client", depot: "Fictional Site" })],
] as const)("keeps %s recipients Itinium-only and sends no real email", async (_type, notify) => {
  await notify();
  expect(state.filters[0]).toEqual(["head_office_admin", true]);
  expect(state.filters[0]).not.toContain("accounts");
  expect(state.notifications).toHaveLength(1);
  expect(state.notifications[0].userId).toBe(99001);
  expect(state.email).not.toHaveBeenCalled();
});
it.each(["statement_uploaded", "collection_documents_complete"])("denies direct dispatch of %s to client Accounts", async type => {
  state.rows = [[{ id: 99002, role: "accounts", roles: ["accounts"], clientId: 99010, isActive: true }]];
  await dispatchNotification(99002, { type, title: "Internal", body: "Internal content" });
  expect(state.notifications).toEqual([]);
  expect(state.email).not.toHaveBeenCalled();
});
