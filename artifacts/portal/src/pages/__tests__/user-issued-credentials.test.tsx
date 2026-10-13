import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UserManagementPage from "../user-management";
import LoginPage from "../login";
import { homePath } from "@/lib/roles";
vi.mock("@/components/sidebar-layout", () => ({ SidebarLayout: ({ children }: any) => children }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    let body: any = {};
    if (path === "/api/auth/me") body = { user: { role: "head_office_admin", clientId: null } };
    else if (path.startsWith("/api/users/stats")) body = { total: 0, depotUsers: 0, teamLeaders: 0, adminStaff: 0 };
    else if (path === "/api/clients") body = { clients: [{ id: 10, name: "Fictional Client" }] };
    else if (path === "/api/clients/10/locations") body = { locations: [{ id: 11, clientId: 10, name: "Fictional New Site" }] };
    else if (path === "/api/collection-companies") body = { companies: [] };
    else if (path === "/api/users" && init?.method === "POST") {
      const submitted = JSON.parse(String(init.body));
      expect(submitted).toMatchObject({ email: "NEW.SITE@EXAMPLE.TEST", clientId: 10, permittedLocationIds: [11], locationId: 11 });
      expect(submitted).not.toHaveProperty("password");
      body = { user: { email: "new.site@example.test" }, tempPassword: "Fixture-Only-Credential" };
    } else if (path.startsWith("/api/users")) body = { users: [], total: 0 };
    return { ok: true, json: async () => body };
  }));
});
it("passes the actual Add User response through to the one-time credential dialog", async () => {
  render(<UserManagementPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Add New User" }));
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Fictional User" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "NEW.SITE@EXAMPLE.TEST" } });
  fireEvent.click(screen.getByTestId("checkbox-role-depot_user"));
  await screen.findByRole("option", { name: "Fictional Client" });
  fireEvent.change(screen.getByTestId("select-access-client"), { target: { value: "10" } });
  fireEvent.click(await screen.findByLabelText("Fictional New Site"));
  fireEvent.change(screen.getByLabelText(/Default location/), { target: { value: "11" } });
  fireEvent.click(screen.getByTestId("button-save-access"));
  await waitFor(() => expect(screen.getByText("User Created")).toBeInTheDocument());
  expect(screen.getByText("new.site@example.test")).toBeInTheDocument();
  expect(screen.getByText("Fixture-Only-Credential")).toBeInTheDocument();
  expect(screen.getByText(/These credentials work only in the portal environment/)).toBeInTheDocument();
});
it("normalises only the sign-in email, preserves the issued password, and uses the warehouse landing page", async () => {
  const issuedPassword = "Fixture-Only-Credential";
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({
    user: { role: "depot_user", roles: ["depot_user"], clientId: 10, locationId: 11, permittedLocationIds: [11] },
  }) }));
  vi.stubGlobal("fetch", fetchMock);
  const { container } = render(<LoginPage />);
  fireEvent.change(screen.getByTestId("input-email"), { target: { value: "NEW.SITE@EXAMPLE.TEST" } });
  fireEvent.change(screen.getByTestId("input-password"), { target: { value: issuedPassword } });
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ email: "new.site@example.test", password: issuedPassword });
  expect(homePath({ role: "depot_user", roles: ["depot_user"], clientId: 10, permittedLocationIds: [11] })).toBe("/operational-overview");
});
