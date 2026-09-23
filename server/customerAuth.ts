import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { customerAccounts, customerSessions, reviews } from "../drizzle/schema";
import { getDb } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";

export const CUSTOMER_COOKIE = "panex_customer_session";
const SESSION_DAYS = 30;
const CODE_MINUTES = 15;
const MAX_VERIFICATION_ATTEMPTS = 5;

type PublicCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  loyaltyPoints: number;
  welcomeCouponCode: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
};

function publicCustomer(account: typeof customerAccounts.$inferSelect): PublicCustomer {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    phone: account.phone ?? null,
    emailVerified: Boolean(account.emailVerified),
    loyaltyPoints: account.loyaltyPoints ?? 0,
    welcomeCouponCode: account.welcomeCouponCode ?? null,
    createdAt: account.createdAt,
    lastLoginAt: account.lastLoginAt ?? null,
  };
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && timingSafeEqual(actual, expectedBuffer);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function verificationCode() {
  return randomInt(100000, 1000000).toString();
}

function verificationExpiry() {
  return new Date(Date.now() + CODE_MINUTES * 60 * 1000);
}

function couponCode() {
  return `PANEX-${randomBytes(4).toString("hex").toUpperCase()}`;
}

async function sendVerificationEmail(email: string, name: string, code: string) {
  if (!ENV.resendApiKey || !ENV.resendFromEmail) throw new Error("El correo de verificación no está configurado.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Panex <${ENV.resendFromEmail}>`,
      to: [email],
      subject: "Tu código de verificación Panex",
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#30251f"><h1 style="color:#a64b2a">Bienvenido a Panex</h1><p>Hola ${name}, confirma tu correo para activar tu cuenta.</p><div style="font-size:36px;letter-spacing:10px;font-weight:700;color:#a64b2a;background:#f7efe7;border-radius:16px;padding:20px;text-align:center">${code}</div><p>Este código vence en ${CODE_MINUTES} minutos. Si no solicitaste esta cuenta, puedes ignorar este mensaje.</p></div>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[Resend] verification email failed", response.status, detail);
    throw new Error("No pudimos enviar el código. Revisa la configuración del correo remitente.");
  }
}

function parseCookie(header: string | undefined, name: string) {
  const value = header?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : null;
}

export function getCustomerToken(req: { headers: { cookie?: string } }) {
  return parseCookie(req.headers.cookie, CUSTOMER_COOKIE);
}

export function setCustomerCookie(res: { cookie: Function }, req: { protocol: string; headers: Record<string, unknown> }, token: string) {
  res.cookie(CUSTOMER_COOKIE, token, { ...getSessionCookieOptions(req as never), maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
}

export function clearCustomerCookie(res: { clearCookie: Function }, req: { protocol: string; headers: Record<string, unknown> }) {
  res.clearCookie(CUSTOMER_COOKIE, { ...getSessionCookieOptions(req as never), maxAge: 0 });
}

async function createSession(accountId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(customerSessions).values({ accountId, tokenHash: tokenHash(token), expiresAt });
  return token;
}

async function issueVerification(account: typeof customerAccounts.$inferSelect) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const code = verificationCode();
  await db.update(customerAccounts).set({ verificationCodeHash: tokenHash(code), verificationExpiresAt: verificationExpiry(), verificationAttempts: 0 }).where(eq(customerAccounts.id, account.id));
  await sendVerificationEmail(account.email, account.name, code);
}

async function activateWithoutEmail(account: typeof customerAccounts.$inferSelect) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(customerAccounts).set({ emailVerified: true, verificationCodeHash: null, verificationExpiresAt: null, verificationAttempts: 0, loyaltyPoints: 100, welcomeCouponCode: couponCode() }).where(eq(customerAccounts.id, account.id));
  const activated = (await db.select().from(customerAccounts).where(eq(customerAccounts.id, account.id)).limit(1))[0];
  if (!activated) throw new Error("No se pudo activar la cuenta.");
  return { customer: publicCustomer(activated), token: await createSession(activated.id) };
}

export async function registerCustomer(input: { name: string; email: string; phone?: string; password: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = input.email.trim().toLowerCase();
  const existing = (await db.select().from(customerAccounts).where(eq(customerAccounts.email, email)).limit(1))[0];
  if (existing) {
    if (existing.emailVerified) throw new Error("Ya existe una cuenta con ese correo.");
    if (!ENV.resendApiKey || !ENV.resendFromEmail) {
      const activated = await activateWithoutEmail(existing);
      return { requiresVerification: false as const, email, ...activated };
    }
    await issueVerification(existing);
    return { requiresVerification: true as const, email };
  }
  const result = await db.insert(customerAccounts).values({ name: input.name.trim(), email, phone: input.phone?.trim() || null, passwordHash: hashPassword(input.password), emailVerified: false, verificationAttempts: 0, loyaltyPoints: 0 }).returning({ id: customerAccounts.id });
  const id = result[0]?.id;
  if (!id) throw new Error("No se pudo crear la cuenta.");
  const account = (await db.select().from(customerAccounts).where(eq(customerAccounts.id, id)).limit(1))[0];
  if (!account) throw new Error("No se pudo crear la cuenta.");
  if (!ENV.resendApiKey || !ENV.resendFromEmail) {
    const activated = await activateWithoutEmail(account);
    return { requiresVerification: false as const, email, ...activated };
  }
  try {
    await issueVerification(account);
  } catch (error) {
    // Conservamos la cuenta aunque el proveedor de correo falle. El cliente
    // puede corregir la configuración y solicitar el código nuevamente.
    throw error;
  }
  return { requiresVerification: true as const, email };
}

export async function verifyCustomerEmail(emailInput: string, code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = emailInput.trim().toLowerCase();
  const account = (await db.select().from(customerAccounts).where(eq(customerAccounts.email, email)).limit(1))[0];
  if (!account) throw new Error("No encontramos esa cuenta.");
  if (account.emailVerified) throw new Error("Este correo ya está verificado. Inicia sesión.");
  if ((account.verificationAttempts ?? 0) >= MAX_VERIFICATION_ATTEMPTS) throw new Error("Superaste los intentos. Solicita un código nuevo.");
  if (!account.verificationExpiresAt || account.verificationExpiresAt.getTime() < Date.now()) throw new Error("El código venció. Solicita uno nuevo.");
  const expected = Buffer.from(account.verificationCodeHash ?? "", "hex");
  const actual = Buffer.from(tokenHash(code.trim()), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    await db.update(customerAccounts).set({ verificationAttempts: (account.verificationAttempts ?? 0) + 1 }).where(eq(customerAccounts.id, account.id));
    throw new Error("El código no es correcto.");
  }
  await db.update(customerAccounts).set({ emailVerified: true, verificationCodeHash: null, verificationExpiresAt: null, verificationAttempts: 0, loyaltyPoints: 100, welcomeCouponCode: couponCode() }).where(eq(customerAccounts.id, account.id));
  const verified = (await db.select().from(customerAccounts).where(eq(customerAccounts.id, account.id)).limit(1))[0];
  if (!verified) throw new Error("No se pudo activar la cuenta.");
  return { customer: publicCustomer(verified), token: await createSession(verified.id) };
}

export async function resendVerification(emailInput: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = emailInput.trim().toLowerCase();
  const account = (await db.select().from(customerAccounts).where(eq(customerAccounts.email, email)).limit(1))[0];
  if (!account) throw new Error("No encontramos esa cuenta.");
  if (account.emailVerified) throw new Error("Este correo ya está verificado.");
  await issueVerification(account);
  return { sent: true as const };
}

export async function loginCustomer(emailInput: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = emailInput.trim().toLowerCase();
  const account = (await db.select().from(customerAccounts).where(eq(customerAccounts.email, email)).limit(1))[0];
  if (!account || !verifyPassword(password, account.passwordHash)) throw new Error("Correo o contraseña incorrectos.");
  if (!account.emailVerified) throw new Error("Verifica tu correo antes de iniciar sesión.");
  await db.update(customerAccounts).set({ lastLoginAt: new Date() }).where(eq(customerAccounts.id, account.id));
  return { customer: publicCustomer({ ...account, lastLoginAt: new Date() }), token: await createSession(account.id) };
}

export async function getCustomerFromRequest(req: { headers: { cookie?: string } }) {
  const token = getCustomerToken(req);
  if (!token) return null;
  const db = await getDb();
  if (!db) return null;
  const session = (await db.select().from(customerSessions).where(and(eq(customerSessions.tokenHash, tokenHash(token)), gt(customerSessions.expiresAt, new Date()))).limit(1))[0];
  if (!session) return null;
  const account = (await db.select().from(customerAccounts).where(eq(customerAccounts.id, session.accountId)).limit(1))[0];
  return account?.emailVerified ? publicCustomer(account) : null;
}

export async function logoutCustomer(req: { headers: { cookie?: string } }) {
  const token = getCustomerToken(req);
  const db = await getDb();
  if (token && db) await db.delete(customerSessions).where(eq(customerSessions.tokenHash, tokenHash(token)));
}

export async function listCustomers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: customerAccounts.id, name: customerAccounts.name, email: customerAccounts.email, phone: customerAccounts.phone, emailVerified: customerAccounts.emailVerified, loyaltyPoints: customerAccounts.loyaltyPoints, createdAt: customerAccounts.createdAt, lastLoginAt: customerAccounts.lastLoginAt }).from(customerAccounts).orderBy(customerAccounts.createdAt);
}

export async function updateCustomerByAdmin(input: { id: string; name: string; email: string; phone?: string; password?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = input.email.trim().toLowerCase();
  const account = (await db.select().from(customerAccounts).where(eq(customerAccounts.id, input.id)).limit(1))[0];
  if (!account) throw new Error("Cliente no encontrado.");
  const duplicate = (await db.select({ id: customerAccounts.id }).from(customerAccounts).where(eq(customerAccounts.email, email)).limit(1))[0];
  if (duplicate && duplicate.id !== input.id) throw new Error("Ese correo ya pertenece a otra cuenta.");
  const emailChanged = email !== account.email;
  const values: Partial<typeof customerAccounts.$inferInsert> = {
    name: input.name.trim(),
    email,
    phone: input.phone?.trim() || null,
  };
  if (input.password?.trim()) values.passwordHash = hashPassword(input.password.trim());
  if (emailChanged) {
    values.emailVerified = false;
    values.verificationCodeHash = null;
    values.verificationExpiresAt = null;
    values.verificationAttempts = 0;
  }
  await db.update(customerAccounts).set(values).where(eq(customerAccounts.id, input.id));
  const updated = (await db.select().from(customerAccounts).where(eq(customerAccounts.id, input.id)).limit(1))[0];
  if (!updated) throw new Error("No se pudo actualizar el cliente.");
  if (emailChanged) await issueVerification(updated);
  return publicCustomer(updated);
}

export async function deleteCustomerByAdmin(accountId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const account = (await db.select({ id: customerAccounts.id }).from(customerAccounts).where(eq(customerAccounts.id, accountId)).limit(1))[0];
  if (!account) throw new Error("Cliente no encontrado.");
  await db.delete(customerSessions).where(eq(customerSessions.accountId, accountId));
  await db.delete(customerAccounts).where(eq(customerAccounts.id, accountId));
  return { success: true as const };
}
