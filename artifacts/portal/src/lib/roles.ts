export const ROLE_KEYS = [
  "head_office_admin",
  "lead_client",
  "accounts",
  "team_leader",
  "depot_user",
  "collection_company",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const CUSTOMER_ROLES: string[] = ["lead_client", "accounts", "team_leader", "depot_user"];
export const CLIENT_WIDE_ROLES: string[] = ["lead_client", "accounts"];
export const LOCATION_SCOPED_ROLES: string[] = ["team_leader", "depot_user"];

export const ROLE_LABELS: Record<string, string> = {
  head_office_admin: "Head Office Admin",
  lead_client: "Lead Client",
  accounts: "Accounts",
  team_leader: "Team Leader",
  depot_user: "Warehouse Team",
  collection_company: "Collection Company",
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  head_office_admin: "Itinium internal. Full access to users, clients, finance and settings.",
  lead_client: "All locations for one client. Sees Total Invoice Value.",
  accounts: "All locations for one client. Sees Total Invoice Value.",
  team_leader: "Assigned locations only. Read-only schedule, no financials.",
  depot_user: "Assigned locations only. Operational Overview and read-only schedule.",
  collection_company: "Assigned collection schedule only.",
};

export interface RoleBearer {
  role?: string | null;
  roles?: string[] | null;
  clientId?: number | null;
}

export function rolesOf(user: RoleBearer | null | undefined): string[] {
  if (!user) return [];
  const list = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : user.role ? [user.role] : [];
  return Array.from(new Set(list.filter(Boolean)));
}

export function hasRole(user: RoleBearer | null | undefined, ...roles: string[]): boolean {
  const mine = rolesOf(user);
  return roles.some((r) => mine.includes(r));
}

export const isAdmin = (u: RoleBearer | null | undefined) => hasRole(u, "head_office_admin");
export const isCollector = (u: RoleBearer | null | undefined) => !isAdmin(u) && hasRole(u, "collection_company");
export const isCustomer = (u: RoleBearer | null | undefined) => !isAdmin(u) && hasRole(u, ...CUSTOMER_ROLES);
export const canSeeInvoiceTotal = (u: RoleBearer | null | undefined) => isCustomer(u) && hasRole(u, ...CLIENT_WIDE_ROLES);
export const canSeeSchedule = (u: RoleBearer | null | undefined) => isCustomer(u) && hasRole(u, "lead_client", "accounts", "team_leader", "depot_user");
export const isWarehouseOnly = (u: RoleBearer | null | undefined) =>
  isCustomer(u) && rolesOf(u).filter((r) => CUSTOMER_ROLES.includes(r)).every((r) => r === "depot_user");

/** Customer account missing a client assignment, or account with no recognised role at all. */
export function isUnassigned(u: RoleBearer | null | undefined): boolean {
  if (!u) return false;
  const mine = rolesOf(u).filter((r) => (ROLE_KEYS as readonly string[]).includes(r));
  if (mine.length === 0) return true;
  if (isCustomer(u) && !u.clientId) return true;
  return false;
}

export function homePath(u: RoleBearer | null | undefined): string {
  if (!u) return "/login";
  if (isAdmin(u)) return "/dashboard";
  if (isCollector(u)) return "/collections";
  if (isUnassigned(u)) return "/";
  if (isWarehouseOnly(u)) return "/operational-overview";
  if (isCustomer(u)) return "/dashboard";
  return "/";
}

export function roleSummary(u: RoleBearer | null | undefined): string {
  const r = rolesOf(u);
  if (r.length === 0) return "No role assigned";
  return r.map((k) => ROLE_LABELS[k] || k.replace(/_/g, " ")).join(" · ");
}
