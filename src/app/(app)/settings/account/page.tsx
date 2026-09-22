import { requireUser } from "@/lib/auth/session";
import { PageHeader, Card } from "@/components/ui";
import { ChangePasswordForm } from "./_change-password";

export const metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <PageHeader title="Your account" description="Change your own password. Admin-side resets are on the Users page." />

      <Card>
        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Signed in as</div>
            <div className="mt-0.5">{user.email}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</div>
            <div className="mt-0.5">{user.name ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Role</div>
            <div className="mt-0.5">{user.role}</div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-medium">Change password</div>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
