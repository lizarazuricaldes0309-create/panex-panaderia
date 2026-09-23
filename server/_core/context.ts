import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { parse as parseCookieHeader } from "cookie";
import { jwtVerify } from "jose";

const ADMIN_COOKIE = "panex_admin_session";

async function authenticateAdminCookie(cookieHeader: string | undefined): Promise<User | null> {
  if (!cookieHeader || !ENV.cookieSecret) return null;
  const token = parseCookieHeader(cookieHeader)[ADMIN_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(ENV.cookieSecret), { algorithms: ["HS256"] });
    if (payload.type !== "panex-admin") return null;
    return { id: "00000000-0000-0000-0000-000000000001", openId: "panex-password-admin", name: "Administrador Panex", email: ENV.ownerEmail, loginMethod: "password", role: "admin", createdAt: new Date(0), updatedAt: new Date(), lastSignedIn: new Date() } as User;
  } catch {
    return null;
  }
}

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = await authenticateAdminCookie(opts.req.headers.cookie);
  if (!user) {
    try { user = await sdk.authenticateRequest(opts.req); } catch { user = null; }
  }
  return { req: opts.req, res: opts.res, user };
}
