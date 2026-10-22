import { describe, expect, it } from "vitest";
import { DEFAULT_PERMISSIONS, PERMISSION_KEYS, effectivePermissions } from "../permission-defs";

describe("effectivePermissions", () => {
  it("gives admins everything, whatever is stored", () => {
    expect(effectivePermissions("ADMIN", []).size).toBe(PERMISSION_KEYS.length);
  });

  it("falls back to the defaults when nothing is stored", () => {
    expect([...effectivePermissions("MARKETER", null)].sort()).toEqual([...DEFAULT_PERMISSIONS.MARKETER].sort());
    expect([...effectivePermissions("VIEWER", undefined)].sort()).toEqual([...DEFAULT_PERMISSIONS.VIEWER].sort());
  });

  it("uses the stored list, even when empty", () => {
    expect(effectivePermissions("VIEWER", []).size).toBe(0);
    expect([...effectivePermissions("VIEWER", ["campaigns.manage"])]).toEqual(["campaigns.manage"]);
  });

  it("drops unknown keys", () => {
    expect([...effectivePermissions("MARKETER", ["logs.view", "nuke.everything"])]).toEqual(["logs.view"]);
  });
});
