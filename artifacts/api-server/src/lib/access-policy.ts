export const CUSTOMER_ROLES = ["lead_client", "accounts", "team_leader", "depot_user"];
export const ALL_ROLES = ["head_office_admin", ...CUSTOMER_ROLES, "collection_company"];
export interface Principal {
  role: string; roles?: string[] | null; clientId: number | null;
  permittedLocationIds?: number[]; collectionCompanyId?: number | null;
}
export function rolesOf(user: Principal): string[] {
  return user.roles?.length ? user.roles : [user.role];
}
export function hasRole(user: Principal, ...roles: string[]) {
  return rolesOf(user).some(r => roles.includes(r));
}
export const isAdmin = (user: Principal) => hasRole(user, "head_office_admin");
export const isCustomer = (user: Principal) => !isAdmin(user) && hasRole(user, ...CUSTOMER_ROLES);
export const clientWide = (user: Principal) => hasRole(user, "lead_client", "accounts");
export const canSeeFinance = (user: Principal) => isAdmin(user) || (isCustomer(user) && !!user.clientId && clientWide(user));

export function validateRoles(roles: string[], clientId: number | null, companyId: number | null): string | null {
  if (!roles.length || roles.some(r => !ALL_ROLES.includes(r))) return "Select valid roles";
  if (roles.includes("head_office_admin") || roles.includes("collection_company")) {
    if (roles.length !== 1) return "Admin and Collection Co cannot be combined with other roles";
    if (clientId !== null) return "Admin and Collection Co must not have a customer client assignment";
    if (roles[0] === "collection_company" && !companyId) return "Collection company is required";
  } else if (!clientId) return "Customer users must belong to exactly one client";
  return null;
}

// Allowlisted customer representations: adding a new internal column cannot leak it.
const JOB_FIELDS = new Set([
  "id", "reference", "clientId", "locationId", "clientName", "depot", "collectionPoint",
  "collectionDate", "submittedAt", "status", "tonnage", "palletCount", "notes",
  "siteContacts", "siteContactName", "siteContactPhone", "siteContact2Name", "siteContact2Phone",
  "siteContact3Name", "siteContact3Phone", "siteHours", "specialInstructions", "scheduleStatus",
   "signedDocumentTypes", "createdAt",
]);
const BATTERY_FIELDS = new Set([
  "id", "jobId", "palletNumber", "assetNumber", "batterySerial", "manufacture", "cellType",
  "voltage", "looseCellsQty", "isLooseCells", "notes", "rowPhoto",
]);
export function customerJob(job: Record<string, any>) {
  return Object.fromEntries(Object.entries(job).filter(([key]) => JOB_FIELDS.has(key)));
}
export function customerBattery(row: Record<string, any>) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => BATTERY_FIELDS.has(key)));
}

/** Restrictions applied even to routes whose older role allowlists were broader. */
export function policyAllows(user: Principal, method: string, path: string): boolean {
  if (isAdmin(user)) return true;
  const get = method === "GET";
  // Collectors need their own fleet to propose schedules. Route handlers enforce
  // company ownership; keep company administration and other fleet methods closed.
  if (hasRole(user, "collection_company") && user.collectionCompanyId &&
    ((get && path === "/collection-companies/fleet") ||
     (method === "POST" && ["/collection-companies/vehicles", "/collection-companies/drivers"].includes(path)) ||
     (method === "PATCH" && ["/collection-companies/vehicles/:id", "/collection-companies/drivers/:id"].includes(path)))) return true;
  if (/^\/(users|settings|v16\/settings|action-requests|correction-audit|collection-companies|lme)(\/|$)/.test(path)) return false;
  if (/^\/clients/.test(path) && !(get && path === "/clients/:clientId/locations")) return false;
  if (path === "/collection/schedule/confirm" || /\/confirm-schedule$/.test(path)) return false;
  if (/^\/schedule\/audit-log/.test(path)) return false;
  if (path === "/access-audit") return false;
  if (/^\/jobs/.test(path)) {
    if (path === "/jobs/:id/collection-sheet.pdf") return get && hasRole(user, "collection_company") && !!user.collectionCompanyId;
    if (path === "/jobs/:id/requests" || path.startsWith("/jobs/:id/requests/")) return isCustomer(user) || hasRole(user, "collection_company");
    if (path.includes("/documents")) return true; // dedicated object and release checks
    if (hasRole(user, "collection_company")) return false;
    if (!isCustomer(user) || !user.clientId) return false;
    if (path === "/jobs" && method === "POST") return true;
    if (!get) return false;
    if (path === "/jobs/schedule") return hasRole(user, "lead_client", "accounts", "team_leader", "depot_user");
    return path === "/jobs" || path === "/jobs/:id";
  }
  if (path === "/dashboard/stats") return isCustomer(user) && !!user.clientId && hasRole(user, "lead_client", "accounts", "team_leader");
  if (path === "/operational-overview") return isCustomer(user) && !!user.clientId;
  if (/^\/collection\//.test(path)) return hasRole(user, "collection_company");
  if (/^\/stillages(\/|$)/.test(path)) return get && isCustomer(user) && !!user.clientId;
  if (/^\/(job-drafts|depots)(\/|$)/.test(path)) return isCustomer(user) && !!user.clientId;
  return true;
}
