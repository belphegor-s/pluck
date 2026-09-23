import { describe, expect, it } from "vitest";
import { can, ROLES, safeRedirect } from "./workspace.js";

describe("workspace permissions", () => {
  it("lets members use the product but not run the workspace", () => {
    expect(can.manageMembers("member")).toBe(false);
    expect(can.manageBilling("member")).toBe(false);
    expect(can.manageCredentials("member")).toBe(false);
    expect(can.revokeAnyKey("member")).toBe(false);
    expect(can.deleteWorkspace("member")).toBe(false);
  });

  it("lets admins run the workspace but not delete it or make owners", () => {
    expect(can.manageMembers("admin")).toBe(true);
    expect(can.manageBilling("admin")).toBe(true);
    expect(can.manageCredentials("admin")).toBe(true);
    expect(can.deleteWorkspace("admin")).toBe(false);
    expect(can.assignOwner("admin")).toBe(false);
  });

  it("gives owners everything", () => {
    for (const rule of Object.values(can)) expect(rule("owner")).toBe(true);
  });

  it("never grants a lower role something a higher one lacks", () => {
    for (const rule of Object.values(can)) {
      const allowed = ROLES.map((r) => rule(r));
      // ROLES runs owner, admin, member: once false, false all the way down.
      expect(allowed).toEqual([...allowed].sort((a, b) => Number(b) - Number(a)));
    }
  });
});

describe("safeRedirect", () => {
  it("keeps same-site paths", () => {
    expect(safeRedirect("/invite/abc")).toBe("/invite/abc");
    expect(safeRedirect("/dashboard/team?x=1")).toBe("/dashboard/team?x=1");
  });

  it("refuses anything that leaves the site", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "evil", ""])
      expect(safeRedirect(bad)).toBe("/dashboard");
    expect(safeRedirect(undefined, "/")).toBe("/");
  });
});
