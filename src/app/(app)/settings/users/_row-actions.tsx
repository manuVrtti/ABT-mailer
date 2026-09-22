"use client";

import { useState, useTransition } from "react";
import { Role } from "@prisma/client";
import { setUserRole, toggleUserActive, resetUserPassword } from "./actions";

export function UserRowActions({ id, role, isActive }: { id: string; role: Role; isActive: boolean }) {
  const [pending, start] = useTransition();
  const [showReset, setShowReset] = useState(false);
  const [pw, setPw] = useState("");

  return (
    <div className="flex flex-wrap justify-end gap-3 text-xs">
      <select
        value={role}
        disabled={pending}
        onChange={(e) => start(() => setUserRole(id, e.target.value as Role))}
        className="rounded border border-input bg-background px-1.5 py-0.5"
      >
        <option value={Role.ADMIN}>Admin</option>
        <option value={Role.MARKETER}>Marketer</option>
        <option value={Role.VIEWER}>Viewer</option>
      </select>
      <button
        type="button"
        onClick={() => start(() => toggleUserActive(id, !isActive))}
        disabled={pending}
        className="underline underline-offset-4"
      >
        {isActive ? "Deactivate" : "Activate"}
      </button>
      {showReset ? (
        <span className="inline-flex items-center gap-1">
          <input
            type="password"
            placeholder="New password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="rounded border border-input bg-background px-1.5 py-0.5 text-xs"
          />
          <button
            type="button"
            disabled={pending || pw.length < 10}
            onClick={() =>
              start(async () => {
                await resetUserPassword(id, pw);
                setPw("");
                setShowReset(false);
              })
            }
            className="underline underline-offset-4"
          >
            Save
          </button>
          <button type="button" onClick={() => setShowReset(false)} className="text-muted-foreground">
            Cancel
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setShowReset(true)} className="underline underline-offset-4">
          Reset password
        </button>
      )}
    </div>
  );
}
