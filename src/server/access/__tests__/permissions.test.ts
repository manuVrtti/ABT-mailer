import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERMISSIONS,
  EDIT_PERMISSIONS,
  PERMISSION_KEYS,
  effectiveAccess,
  effectivePermissions,
} from "../permission-defs";

describe("effectivePermissions", () => {
  it("gives admins everything, whatever is stored", () => {
    expect(effectivePermissions("ADMIN", []).size).toBe(PERMISSION_KEYS.length);
    expect(effectiveAccess("ADMIN", []).size).toBe(PERMISSION_KEYS.length);
  });

  it("falls back to the defaults when nothing is stored", () => {
    expect([...effectivePermissions("MARKETER", null)].sort()).toEqual([...DEFAULT_PERMISSIONS.MARKETER].sort());
    expect([...effectiveAccess("VIEWER", undefined)].sort()).toEqual([...DEFAULT_PERMISSIONS.VIEWER].sort());
  });

  it("uses the stored list, even when empty", () => {
    expect(effectiveAccess("VIEWER", []).size).toBe(0);
    expect([...effectivePermissions("MARKETER", ["templates.manage"])]).toEqual(["templates.manage"]);
  });

  it("drops unknown keys", () => {
    expect([...effectivePermissions("MARKETER", ["logs.view", "nuke.everything"])]).toEqual(["logs.view"]);
  });

  it("marketers can do everything in the sections they can open", () => {
    const stored = ["personal.manage", "templates.manage"];
    expect(effectivePermissions("MARKETER", stored)).toEqual(effectiveAccess("MARKETER", stored));
  });

  it("viewers can open ticked sections but never edit", () => {
    const stored = ["campaigns.manage", "logs.view", "logs.manage", "exports"];
    expect([...effectiveAccess("VIEWER", stored)].sort()).toEqual(["campaigns.manage", "exports", "logs.view"]);
    const can = effectivePermissions("VIEWER", stored);
    expect(EDIT_PERMISSIONS.some((p) => can.has(p))).toBe(false);
    expect([...can].sort()).toEqual(["exports", "logs.view"]);
  });
});
