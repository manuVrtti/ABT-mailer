import { db } from "@/lib/db";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { PageHeader, Card, Input, Label, Select, Button, Table, THead, TR, TH, TD, Badge } from "@/components/ui";
import { createUser } from "./actions";
import { UserRowActions } from "./_row-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users & roles" };

export default async function UsersPage() {
  await requireRole([Role.ADMIN]);
  const users = await db.user.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6">
      <PageHeader title="Users & roles" description="Only admins can create or modify accounts. Marketers can send; viewers are read-only." />

      <Card>
        <div className="mb-2 text-sm font-medium">Add teammate</div>
        <form action={createUser} className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div>
            <Label htmlFor="role">Role</Label>
            <Select id="role" name="role" defaultValue={Role.MARKETER}>
              <option value={Role.ADMIN}>Admin</option>
              <option value={Role.MARKETER}>Marketer</option>
              <option value={Role.VIEWER}>Viewer</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="password">Initial password</Label>
            <Input id="password" name="password" type="password" minLength={10} required />
          </div>
          <div className="md:col-span-5 flex justify-end">
            <Button type="submit">Create user</Button>
          </div>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Share the password with the user out-of-band, then require them to change it on first sign-in (self-serve reset UI is a follow-up).
        </p>
      </Card>

      <Table>
        <THead>
          <TR>
            <TH>Email</TH>
            <TH>Name</TH>
            <TH>Role</TH>
            <TH>Status</TH>
            <TH>Last sign-in</TH>
            <TH />
          </TR>
        </THead>
        <tbody>
          {users.map((u) => (
            <TR key={u.id}>
              <TD>{u.email}</TD>
              <TD>{u.name}</TD>
              <TD>
                <Badge tone={u.role === Role.ADMIN ? "info" : u.role === Role.MARKETER ? "muted" : "warning"}>
                  {u.role}
                </Badge>
              </TD>
              <TD>
                {u.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="destructive">Disabled</Badge>}
              </TD>
              <TD className="text-xs text-muted-foreground">
                {u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 16).replace("T", " ") : "—"}
              </TD>
              <TD className="text-right">
                <UserRowActions id={u.id} role={u.role} isActive={u.isActive} />
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
