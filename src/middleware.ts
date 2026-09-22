import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = [
  "/login",
  "/403",
  "/api/auth", // NextAuth endpoints
  "/api/health", // liveness probe
  "/api/webhooks/ses", // SNS-signed, own auth
  "/api/emails/transactional", // HMAC-signed, own auth
  "/api/conversions", // HMAC-signed, own auth
  "/api/qstash", // QStash-signed worker endpoints, own auth
  "/unsubscribe", // signed-token, own auth
  "/favicon.ico",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Match everything except Next.js internals and static assets.
  matcher: ["/((?!_next/static|_next/image|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.webp$).*)"],
};
