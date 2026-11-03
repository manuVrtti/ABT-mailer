import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Role } from "@prisma/client";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * The role in the sign-in cookie is only a snapshot from login. Every request
 * re-reads the person's role and active flag (cached for a few seconds), so a
 * role change or deactivation applies right away instead of at next login.
 */
const ROLE_TTL_MS = 10_000;
const freshRoles = new Map<string, { at: number; role: Role | null }>();

async function liveRole(uid: string): Promise<Role | null> {
  const hit = freshRoles.get(uid);
  if (hit && Date.now() - hit.at < ROLE_TTL_MS) return hit.role;
  const u = await db.user.findUnique({ where: { id: uid }, select: { role: true, isActive: true } });
  const role = u?.isActive ? u.role : null;
  freshRoles.set(uid, { at: Date.now(), role });
  return role;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8-hour sessions
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user || !user.isActive) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.hashedPassword);
        if (!ok) return null;

        // Fire-and-forget login timestamp
        db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role: Role }).role;
        token.revoked = false;
      } else if (token.uid) {
        const role = await liveRole(token.uid as string);
        if (role) token.role = role;
        else token.revoked = true; // deleted or deactivated
      }
      return token;
    },
    async session({ session, token }) {
      // A deactivated or deleted account has no user: every page treats it as signed out.
      if (token.revoked) return { ...session, user: undefined };
      if (session.user) {
        session.user.id = (token.uid as string) ?? session.user.id;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
};
