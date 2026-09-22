"use client";

import { useState, useTransition } from "react";
import { Input, Label, Button } from "@/components/ui";
import { changeMyPassword } from "./actions";

export function ChangePasswordForm() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    if (newPassword !== confirm) {
      setMessage({ tone: "error", text: "New password and confirmation must match." });
      return;
    }
    const fd = new FormData();
    fd.set("currentPassword", currentPassword);
    fd.set("newPassword", newPassword);
    start(async () => {
      const res = await changeMyPassword(fd);
      if (res.ok) {
        setMessage({ tone: "success", text: "Password updated." });
        setCurrentPassword("");
        setNewPassword("");
        setConfirm("");
      } else {
        setMessage({ tone: "error", text: res.error });
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:max-w-lg">
      <div>
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">At least 10 characters.</p>
      </div>
      <div>
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>
      {message && (
        <p
          className={
            "rounded-md px-3 py-2 text-xs " +
            (message.tone === "success"
              ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
              : "bg-destructive/10 text-destructive")
          }
        >
          {message.text}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Updating…" : "Update password"}
        </Button>
      </div>
    </form>
  );
}
