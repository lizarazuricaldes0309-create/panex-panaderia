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
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  loyaltyPoints: number;
  welcomeCouponCode: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
};

function publicCustomer(account: typeof customerAccounts.$inferSelect): PublicCustomer {
  return {
    id: account.id,
    name: account.name,
    email: account.email ?? null,
    phone: account.phone ?? null,
    emailVerified: Boolean(account.emailVerified || account.phoneVerified),
    phoneVerified: Boolean(account.phoneVerified),
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

export function normalizePhone(input: string) {
  const raw = input.trim().replace(/[\s().-]/g, "");
  if (!raw) throw new Error("Escribe un número de teléfono.");
  if (raw.startsWith("00")) return `+${raw.slice(2)}`;
  if (raw.startsWith("+")) return raw;
  if (/^591\d{8}$/.test(raw)) return `+${raw}`;
  if (/^\d{8}$/.test(raw)) return `+591${raw}`;
  throw new Error("Usa un número válido, por ejemplo +591 70000000.");
}

function hasTwilioVerify() {
  return Boolean(ENV.twilioAccountSid && ENV.twilioAuthToken && ENV.twilioVerifyServiceSid);
}

async function twilioVerifyRequest(path: string, params: URLSearchParams) {
  if (!hasTwilioVerify()) throw new Error("La verificación por SMS todavía no está configurada.");
  const credentials = Buffer.from(`${ENV.twilioAccountSid}:${ENV.twilioAuthToken}`).toString("base64");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${ENV.twilioVerifyServiceSid}${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await response.json().catch(() => ({})) as { status?: string; message?: string };
  if (!response.ok) {
    console.error("[Twilio Verify] request failed", response.status, data);
    throw new Error(data.message || "No pudimos enviar o comprobar el código SMS.");
  }
  return data;
}

async function sendPhoneVerification(phone: string) {
  await twilioVerifyRequest("/Verifications", new URLSearchParams({ To: phone, Channel: "sms" }));
}

async function verifyPhoneCode(phone: string, code: string) {
  const result = await twilioVerifyRequest("/VerificationCheck", new URLSearchParams({ To: phone, Code: code }));
  if (result.status !== "approved") throw new Error("El código SMS no es correcto o ya venció.");
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
  if (!account.email) throw new Error("Esta cuenta no tiene correo para verificar.");
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

export async function registerCustomer(input: { name: string; email?: string; phone?: string; password: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (!email && !phone) throw new Error("Regístrate con un correo o un número de teléfono.");
  const existing = email
    ? (await db.select().from(customerAccounts).where(eq(customerAccounts.email, email)).limit(1))[0]
    : (await db.select().from(customerAccounts).where(eq(customerAccounts.phone, phone!)).limit(1))[0];
  if (existing) {
    if (existing.emailVerified || existing.phoneVerified) throw new Error(email ? "Ya existe una cuenta con ese correo." : "Ya existe una cuenta con ese teléfono.");
    if (phone) {
      await sendPhoneVerification(phone);
      return { requiresVerification: true as const, verificationMethod: "phone" as const, phone };
    }
    if (!ENV.resendApiKey || !ENV.resendFromEmail) throw new Error("La verificación por correo no está configurada.");
    await issueVerification(existing);
    return { requiresVerification: true as const, verificationMethod: "email" as const, email };
  }
  const result = await db.insert(customerAccounts).values({ name: input.name.trim(), email, phone, passwordHash: hashPassword(input.password), emailVerified: false, phoneVerified: false, verificationAttempts: 0, loyaltyPoints: 0 }).returning({ id: customerAccounts.id });
  const id = result[0]?.id;
  if (!id) throw new Error("No se pudo crear la cuenta.");
  const account = (await db.select().from(customerAccounts).where(eq(customerAccounts.id, id)).limit(1))[0];
  if (!account) throw new Error("No se pudo crear la cuenta.");
  if (phone) {
    await sendPhoneVerification(phone);
    return { requiresVerification: true as const, verificationMethod: "phone" as const, phone };
  }
  if (!ENV.resendApiKey || !ENV.resendFromEmail) throw new Error("La verificación por correo no está configurada.");
  await issueVerification(account);
  return { requiresVerification: true as const, verificationMethod: "email" as const, email };
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

export async function verifyCustomerPhone(phoneInput: string, code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const phone = normalizePhone(phoneInput);
  const account = (await db.select().from(customerAccounts).where(eq(customerAccounts.phone, phone)).limit(1))[0];
  if (!account) throw new Error("No encontramos una cuenta con ese teléfono.");
  if (account.phoneVerified) throw new Error("Este teléfono ya está verificado. Inicia sesión.");
  await verifyPhoneCode(phone, code.trim());
  await db.update(customerAccounts).set({ phoneVerified: true, verificationCodeHash: null, verificationExpiresAt: null, verificationAttempts: 0, loyaltyPoints: 100, welcomeCouponCode: account.welcomeCouponCode ?? couponCode() }).where(eq(customerAccounts.id, account.id));
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

export async function resendPhoneVerification(phoneInput: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const phone = normalizePhone(phoneInput);
  const account = (await db.select().from(customerAccounts).where(eq(customerAccounts.phone, phone)).limit(1))[0];
  if (!account) throw new Error("No encontramos una cuenta con ese teléfono.");
  if (account.phoneVerified) throw new Error("Este teléfono ya está verificado.");
  await sendPhoneVerification(phone);
  return { sent: true as const };
}

export async function loginCustomer(identifierInput: string, password: string, method: "email" | "phone") {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const identifier = method === "email" ? identifierInput.trim().toLowerCase() : normalizePhone(identifierInput);
  const account = (await db.select().from(customerAccounts).where(method === "email" ? eq(customerAccounts.email, identifier) : eq(customerAccounts.phone, identifier)).limit(1))[0];
  if (!account || !verifyPassword(password, account.passwordHash)) throw new Error("Datos de acceso incorrectos.");
  if (method === "email" && !account.emailVerified) throw new Error("Verifica tu correo antes de iniciar sesión.");
  if (method === "phone" && !account.phoneVerified) throw new Error("Verifica tu teléfono antes de iniciar sesión.");
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
  return account && (account.emailVerified || account.phoneVerified) ? publicCustomer(account) : null;
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

export async function updateCustomerByAdmin(input: { id: string; name: string; email?: string; phone?: string; password?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() ? normalizePhone(input.phone) : null;
  const account = (await db.select().from(customerAccounts).where(eq(customerAccounts.id, input.id)).limit(1))[0];
  if (!account) throw new Error("Cliente no encontrado.");
  const duplicate = email ? (await db.select({ id: customerAccounts.id }).from(customerAccounts).where(eq(customerAccounts.email, email)).limit(1))[0] : undefined;
  if (duplicate && duplicate.id !== input.id) throw new Error("Ese correo ya pertenece a otra cuenta.");
  const phoneDuplicate = phone ? (await db.select({ id: customerAccounts.id }).from(customerAccounts).where(eq(customerAccounts.phone, phone)).limit(1))[0] : undefined;
  if (phoneDuplicate && phoneDuplicate.id !== input.id) throw new Error("Ese teléfono ya pertenece a otra cuenta.");
  const emailChanged = email !== account.email;
  const values: Partial<typeof customerAccounts.$inferInsert> = {
    name: input.name.trim(),
    email,
    phone,
  };
  if (input.password?.trim()) values.passwordHash = hashPassword(input.password.trim());
  if (emailChanged) {
    values.emailVerified = false;
    values.verificationCodeHash = null;
    values.verificationExpiresAt = null;
    values.verificationAttempts = 0;
  }
  if (phone !== account.phone) values.phoneVerified = false;
  await db.update(customerAccounts).set(values).where(eq(customerAccounts.id, input.id));
  const updated = (await db.select().from(customerAccounts).where(eq(customerAccounts.id, input.id)).limit(1))[0];
  if (!updated) throw new Error("No se pudo actualizar el cliente.");
  if (emailChanged && email && ENV.resendApiKey && ENV.resendFromEmail) await issueVerification(updated);
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
