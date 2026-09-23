// api/index.ts
import "dotenv/config";

// server/_core/app.ts
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { SignJWT as SignJWT2 } from "jose";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { and, desc, eq, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";

// drizzle/schema.ts
import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
var users = pgTable("panex_manus_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  openId: text("open_id").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("login_method"),
  role: text("role").default("user").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in", { withTimezone: true }).defaultNow().notNull()
});
var categories = pgTable("categories", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0).notNull()
});
var products = pgTable("products", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug"),
  description: text("description"),
  categoryId: uuid("category_id"),
  price: numeric("price", { mode: "number" }).notNull(),
  unit: text("unit"),
  imageUrl: text("image_url"),
  isFeatured: boolean("is_featured").default(false).notNull(),
  stock: integer("stock").default(100).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
var orders = pgTable("orders", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id"),
  customerName: text("customer_name").notNull(),
  phone: text("customer_phone"),
  deliveryAddress: text("delivery_address"),
  notes: text("notes"),
  items: jsonb("items").notNull(),
  total: numeric("total", { mode: "number" }).notNull(),
  paymentMethod: text("payment_method"),
  status: text("status").default("pendiente").notNull(),
  whatsappSent: boolean("whatsapp_sent").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
var customerAccounts = pgTable("panex_customer_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  verificationCodeHash: text("verification_code_hash"),
  verificationExpiresAt: timestamp("verification_expires_at", { withTimezone: true }),
  verificationAttempts: integer("verification_attempts").default(0).notNull(),
  loyaltyPoints: integer("loyalty_points").default(0).notNull(),
  welcomeCouponCode: text("welcome_coupon_code").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true })
});
var customerSessions = pgTable("panex_customer_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
var reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id"),
  customerName: text("customer_name").notNull(),
  orderId: uuid("order_id"),
  productId: uuid("product_id"),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  status: text("status").default("aprobada").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  ownerEmail: (process.env.OWNER_EMAIL ?? "lizarazuricaldes0309@gmail.com").trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && ENV.databaseUrl) {
    try {
      _db = drizzle(ENV.databaseUrl);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values = {
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    role: user.role ?? (user.email?.trim().toLowerCase() === ENV.ownerEmail ? "admin" : "user"),
    lastSignedIn: user.lastSignedIn ?? /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  };
  await db.insert(users).values(values).onConflictDoUpdate({
    target: users.openId,
    set: { name: values.name, email: values.email, loginMethod: values.loginMethod, role: values.role, lastSignedIn: values.lastSignedIn, updatedAt: /* @__PURE__ */ new Date() }
  });
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}
function normalizeProduct(product) {
  return {
    ...product,
    slug: product.slug ?? product.id,
    category: product.categoryName ?? "Panes",
    description: product.description ?? "",
    unit: product.unit ?? "pieza",
    imageUrl: product.imageUrl ?? "",
    isFeatured: product.isFeatured ? 1 : 0,
    isActive: product.isActive ? 1 : 0
  };
}
async function getActiveProducts() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ product: products, categoryName: categories.name }).from(products).leftJoin(categories, eq(products.categoryId, categories.id)).where(eq(products.isActive, true)).orderBy(desc(products.isFeatured), desc(products.createdAt));
  return rows.map((row) => normalizeProduct({ ...row.product, categoryName: row.categoryName }));
}
async function getAllProducts() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ product: products, categoryName: categories.name }).from(products).leftJoin(categories, eq(products.categoryId, categories.id)).orderBy(desc(products.createdAt));
  return rows.map((row) => normalizeProduct({ ...row.product, categoryName: row.categoryName }));
}
async function insertProduct(input) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const id = randomUUID();
  await db.insert(products).values({ id, name: input.name, slug: input.slug, description: input.description, price: input.price, unit: input.unit, imageUrl: input.imageUrl, isFeatured: Boolean(input.isFeatured), isActive: Boolean(input.isActive), stock: 100 });
  return { id };
}
async function updateProductById(id, input) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(products).set({ name: input.name, slug: input.slug, description: input.description, price: input.price, unit: input.unit, imageUrl: input.imageUrl, isFeatured: Boolean(input.isFeatured), isActive: Boolean(input.isActive), updatedAt: /* @__PURE__ */ new Date() }).where(eq(products.id, id));
  return { success: true };
}
async function deleteProductById(id) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(products).where(eq(products.id, id));
  return { success: true };
}
async function insertOrder(input) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const id = randomUUID();
  await db.insert(orders).values({ id, customerName: input.customerName, phone: input.phone, deliveryAddress: input.deliveryAddress ?? null, notes: input.notes ?? null, items: { summary: input.items }, total: input.total, status: "pendiente" });
  return id;
}
async function getAllOrders() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(orders).orderBy(desc(orders.createdAt));
}
async function getReviewsByProduct(productId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: reviews.id, productId: reviews.productId, rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt, reviewerName: reviews.customerName }).from(reviews).where(and(eq(reviews.productId, productId), or(eq(reviews.status, "aprobada"), eq(reviews.status, "approved")))).orderBy(desc(reviews.createdAt));
}
async function createCustomerReview(accountId, productId, rating, comment) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const account = (await db.select({ id: customerAccounts.id, name: customerAccounts.name, emailVerified: customerAccounts.emailVerified }).from(customerAccounts).where(eq(customerAccounts.id, accountId)).limit(1))[0];
  if (!account?.emailVerified) throw new Error("Verifica tu correo antes de publicar rese\xF1as.");
  const product = (await db.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1))[0];
  if (!product) throw new Error("Producto no encontrado.");
  await db.insert(reviews).values({ userId: null, customerName: account.name, productId, rating, comment: comment.trim(), status: "aprobada" });
  return { success: true };
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: "00000000-0000-4000-8000-000000000000",
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { z as z2 } from "zod";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/storage.ts
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}

// server/customerAuth.ts
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { and as and2, eq as eq2, gt } from "drizzle-orm";
var CUSTOMER_COOKIE = "panex_customer_session";
var SESSION_DAYS = 30;
var CODE_MINUTES = 15;
var MAX_VERIFICATION_ATTEMPTS = 5;
function publicCustomer(account) {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    phone: account.phone ?? null,
    emailVerified: Boolean(account.emailVerified),
    loyaltyPoints: account.loyaltyPoints ?? 0,
    welcomeCouponCode: account.welcomeCouponCode ?? null,
    createdAt: account.createdAt,
    lastLoginAt: account.lastLoginAt ?? null
  };
}
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}
function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && timingSafeEqual(actual, expectedBuffer);
}
function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}
function verificationCode() {
  return randomInt(1e5, 1e6).toString();
}
function verificationExpiry() {
  return new Date(Date.now() + CODE_MINUTES * 60 * 1e3);
}
function couponCode() {
  return `PANEX-${randomBytes(4).toString("hex").toUpperCase()}`;
}
async function sendVerificationEmail(email, name, code) {
  if (!ENV.resendApiKey || !ENV.resendFromEmail) throw new Error("El correo de verificaci\xF3n no est\xE1 configurado.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Panex <${ENV.resendFromEmail}>`,
      to: [email],
      subject: "Tu c\xF3digo de verificaci\xF3n Panex",
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#30251f"><h1 style="color:#a64b2a">Bienvenido a Panex</h1><p>Hola ${name}, confirma tu correo para activar tu cuenta.</p><div style="font-size:36px;letter-spacing:10px;font-weight:700;color:#a64b2a;background:#f7efe7;border-radius:16px;padding:20px;text-align:center">${code}</div><p>Este c\xF3digo vence en ${CODE_MINUTES} minutos. Si no solicitaste esta cuenta, puedes ignorar este mensaje.</p></div>`
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[Resend] verification email failed", response.status, detail);
    throw new Error("No pudimos enviar el c\xF3digo. Revisa la configuraci\xF3n del correo remitente.");
  }
}
function parseCookie(header, name) {
  const value = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : null;
}
function getCustomerToken(req) {
  return parseCookie(req.headers.cookie, CUSTOMER_COOKIE);
}
function setCustomerCookie(res, req, token) {
  res.cookie(CUSTOMER_COOKIE, token, { ...getSessionCookieOptions(req), maxAge: SESSION_DAYS * 24 * 60 * 60 * 1e3 });
}
function clearCustomerCookie(res, req) {
  res.clearCookie(CUSTOMER_COOKIE, { ...getSessionCookieOptions(req), maxAge: 0 });
}
async function createSession(accountId) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1e3);
  await db.insert(customerSessions).values({ accountId, tokenHash: tokenHash(token), expiresAt });
  return token;
}
async function issueVerification(account) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const code = verificationCode();
  await db.update(customerAccounts).set({ verificationCodeHash: tokenHash(code), verificationExpiresAt: verificationExpiry(), verificationAttempts: 0 }).where(eq2(customerAccounts.id, account.id));
  await sendVerificationEmail(account.email, account.name, code);
}
async function activateWithoutEmail(account) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(customerAccounts).set({ emailVerified: true, verificationCodeHash: null, verificationExpiresAt: null, verificationAttempts: 0, loyaltyPoints: 100, welcomeCouponCode: couponCode() }).where(eq2(customerAccounts.id, account.id));
  const activated = (await db.select().from(customerAccounts).where(eq2(customerAccounts.id, account.id)).limit(1))[0];
  if (!activated) throw new Error("No se pudo activar la cuenta.");
  return { customer: publicCustomer(activated), token: await createSession(activated.id) };
}
async function registerCustomer(input) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = input.email.trim().toLowerCase();
  const existing = (await db.select().from(customerAccounts).where(eq2(customerAccounts.email, email)).limit(1))[0];
  if (existing) {
    if (existing.emailVerified) throw new Error("Ya existe una cuenta con ese correo.");
    if (!ENV.resendApiKey || !ENV.resendFromEmail) {
      const activated = await activateWithoutEmail(existing);
      return { requiresVerification: false, email, ...activated };
    }
    await issueVerification(existing);
    return { requiresVerification: true, email };
  }
  const result = await db.insert(customerAccounts).values({ name: input.name.trim(), email, phone: input.phone?.trim() || null, passwordHash: hashPassword(input.password), emailVerified: false, verificationAttempts: 0, loyaltyPoints: 0 }).returning({ id: customerAccounts.id });
  const id = result[0]?.id;
  if (!id) throw new Error("No se pudo crear la cuenta.");
  const account = (await db.select().from(customerAccounts).where(eq2(customerAccounts.id, id)).limit(1))[0];
  if (!account) throw new Error("No se pudo crear la cuenta.");
  if (!ENV.resendApiKey || !ENV.resendFromEmail) {
    const activated = await activateWithoutEmail(account);
    return { requiresVerification: false, email, ...activated };
  }
  try {
    await issueVerification(account);
  } catch (error) {
    throw error;
  }
  return { requiresVerification: true, email };
}
async function verifyCustomerEmail(emailInput, code) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = emailInput.trim().toLowerCase();
  const account = (await db.select().from(customerAccounts).where(eq2(customerAccounts.email, email)).limit(1))[0];
  if (!account) throw new Error("No encontramos esa cuenta.");
  if (account.emailVerified) throw new Error("Este correo ya est\xE1 verificado. Inicia sesi\xF3n.");
  if ((account.verificationAttempts ?? 0) >= MAX_VERIFICATION_ATTEMPTS) throw new Error("Superaste los intentos. Solicita un c\xF3digo nuevo.");
  if (!account.verificationExpiresAt || account.verificationExpiresAt.getTime() < Date.now()) throw new Error("El c\xF3digo venci\xF3. Solicita uno nuevo.");
  const expected = Buffer.from(account.verificationCodeHash ?? "", "hex");
  const actual = Buffer.from(tokenHash(code.trim()), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    await db.update(customerAccounts).set({ verificationAttempts: (account.verificationAttempts ?? 0) + 1 }).where(eq2(customerAccounts.id, account.id));
    throw new Error("El c\xF3digo no es correcto.");
  }
  await db.update(customerAccounts).set({ emailVerified: true, verificationCodeHash: null, verificationExpiresAt: null, verificationAttempts: 0, loyaltyPoints: 100, welcomeCouponCode: couponCode() }).where(eq2(customerAccounts.id, account.id));
  const verified = (await db.select().from(customerAccounts).where(eq2(customerAccounts.id, account.id)).limit(1))[0];
  if (!verified) throw new Error("No se pudo activar la cuenta.");
  return { customer: publicCustomer(verified), token: await createSession(verified.id) };
}
async function resendVerification(emailInput) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = emailInput.trim().toLowerCase();
  const account = (await db.select().from(customerAccounts).where(eq2(customerAccounts.email, email)).limit(1))[0];
  if (!account) throw new Error("No encontramos esa cuenta.");
  if (account.emailVerified) throw new Error("Este correo ya est\xE1 verificado.");
  await issueVerification(account);
  return { sent: true };
}
async function loginCustomer(emailInput, password) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = emailInput.trim().toLowerCase();
  const account = (await db.select().from(customerAccounts).where(eq2(customerAccounts.email, email)).limit(1))[0];
  if (!account || !verifyPassword(password, account.passwordHash)) throw new Error("Correo o contrase\xF1a incorrectos.");
  if (!account.emailVerified) throw new Error("Verifica tu correo antes de iniciar sesi\xF3n.");
  await db.update(customerAccounts).set({ lastLoginAt: /* @__PURE__ */ new Date() }).where(eq2(customerAccounts.id, account.id));
  return { customer: publicCustomer({ ...account, lastLoginAt: /* @__PURE__ */ new Date() }), token: await createSession(account.id) };
}
async function getCustomerFromRequest(req) {
  const token = getCustomerToken(req);
  if (!token) return null;
  const db = await getDb();
  if (!db) return null;
  const session = (await db.select().from(customerSessions).where(and2(eq2(customerSessions.tokenHash, tokenHash(token)), gt(customerSessions.expiresAt, /* @__PURE__ */ new Date()))).limit(1))[0];
  if (!session) return null;
  const account = (await db.select().from(customerAccounts).where(eq2(customerAccounts.id, session.accountId)).limit(1))[0];
  return account?.emailVerified ? publicCustomer(account) : null;
}
async function logoutCustomer(req) {
  const token = getCustomerToken(req);
  const db = await getDb();
  if (token && db) await db.delete(customerSessions).where(eq2(customerSessions.tokenHash, tokenHash(token)));
}
async function listCustomers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: customerAccounts.id, name: customerAccounts.name, email: customerAccounts.email, phone: customerAccounts.phone, emailVerified: customerAccounts.emailVerified, loyaltyPoints: customerAccounts.loyaltyPoints, createdAt: customerAccounts.createdAt, lastLoginAt: customerAccounts.lastLoginAt }).from(customerAccounts).orderBy(customerAccounts.createdAt);
}
async function updateCustomerByAdmin(input) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = input.email.trim().toLowerCase();
  const account = (await db.select().from(customerAccounts).where(eq2(customerAccounts.id, input.id)).limit(1))[0];
  if (!account) throw new Error("Cliente no encontrado.");
  const duplicate = (await db.select({ id: customerAccounts.id }).from(customerAccounts).where(eq2(customerAccounts.email, email)).limit(1))[0];
  if (duplicate && duplicate.id !== input.id) throw new Error("Ese correo ya pertenece a otra cuenta.");
  const emailChanged = email !== account.email;
  const values = {
    name: input.name.trim(),
    email,
    phone: input.phone?.trim() || null
  };
  if (input.password?.trim()) values.passwordHash = hashPassword(input.password.trim());
  if (emailChanged) {
    values.emailVerified = false;
    values.verificationCodeHash = null;
    values.verificationExpiresAt = null;
    values.verificationAttempts = 0;
  }
  await db.update(customerAccounts).set(values).where(eq2(customerAccounts.id, input.id));
  const updated = (await db.select().from(customerAccounts).where(eq2(customerAccounts.id, input.id)).limit(1))[0];
  if (!updated) throw new Error("No se pudo actualizar el cliente.");
  if (emailChanged) await issueVerification(updated);
  return publicCustomer(updated);
}
async function deleteCustomerByAdmin(accountId) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const account = (await db.select({ id: customerAccounts.id }).from(customerAccounts).where(eq2(customerAccounts.id, accountId)).limit(1))[0];
  if (!account) throw new Error("Cliente no encontrado.");
  await db.delete(customerSessions).where(eq2(customerSessions.accountId, accountId));
  await db.delete(customerAccounts).where(eq2(customerAccounts.id, accountId));
  return { success: true };
}

// server/routers.ts
var productInput = z2.object({
  name: z2.string().min(2),
  slug: z2.string().min(2),
  category: z2.string().min(2),
  description: z2.string().min(5),
  price: z2.number().int().positive(),
  unit: z2.string().min(2),
  imageUrl: z2.string().min(5),
  isFeatured: z2.number().int().min(0).max(1).default(0),
  isActive: z2.number().int().min(0).max(1).default(1)
});
var adminProcedure2 = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" || (ctx.user.email ?? "").trim().toLowerCase() !== ENV.ownerEmail) throw new TRPCError3({ code: "FORBIDDEN", message: "Solo el correo propietario puede administrar Panex." });
  return next();
});
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    adminAccess: publicProcedure.query(({ ctx }) => Boolean(ctx.user && ctx.user.role === "admin" && (ctx.user.email ?? "").trim().toLowerCase() === ENV.ownerEmail)),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  customers: router({
    me: publicProcedure.query(({ ctx }) => getCustomerFromRequest(ctx.req)),
    register: publicProcedure.input(z2.object({
      name: z2.string().trim().min(2).max(160),
      email: z2.string().trim().email().max(320),
      phone: z2.string().trim().min(7).max(40).optional(),
      password: z2.string().min(8).max(128)
    })).mutation(async ({ ctx, input }) => {
      try {
        const result = await registerCustomer(input);
        if ("token" in result && result.token) setCustomerCookie(ctx.res, ctx.req, result.token);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo crear la cuenta.";
        throw new TRPCError3({ code: message.includes("Ya existe") ? "CONFLICT" : "INTERNAL_SERVER_ERROR", message });
      }
    }),
    verifyEmail: publicProcedure.input(z2.object({ email: z2.string().trim().email().max(320), code: z2.string().regex(/^\d{6}$/) })).mutation(async ({ ctx, input }) => {
      try {
        const result = await verifyCustomerEmail(input.email, input.code);
        setCustomerCookie(ctx.res, ctx.req, result.token);
        return result.customer;
      } catch (error) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "No se pudo verificar el correo." });
      }
    }),
    resendVerification: publicProcedure.input(z2.object({ email: z2.string().trim().email().max(320) })).mutation(async ({ input }) => {
      try {
        return await resendVerification(input.email);
      } catch (error) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "No se pudo reenviar el c\xF3digo." });
      }
    }),
    login: publicProcedure.input(z2.object({
      email: z2.string().trim().email().max(320),
      password: z2.string().min(8).max(128)
    })).mutation(async ({ ctx, input }) => {
      try {
        const result = await loginCustomer(input.email, input.password);
        setCustomerCookie(ctx.res, ctx.req, result.token);
        return result.customer;
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo iniciar sesi\xF3n.";
        throw new TRPCError3({ code: message.includes("incorrectos") ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR", message });
      }
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      await logoutCustomer(ctx.req);
      clearCustomerCookie(ctx.res, ctx.req);
      return { success: true };
    }),
    adminList: adminProcedure2.query(() => listCustomers()),
    adminUpdate: adminProcedure2.input(z2.object({ id: z2.string().uuid(), name: z2.string().trim().min(2).max(160), email: z2.string().trim().email().max(320), phone: z2.string().trim().min(7).max(40).optional(), password: z2.string().min(8).max(128).optional() })).mutation(async ({ input }) => {
      try {
        return await updateCustomerByAdmin(input);
      } catch (error) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "No se pudo actualizar el cliente." });
      }
    }),
    adminDelete: adminProcedure2.input(z2.object({ id: z2.string().uuid(), confirmation: z2.literal("ELIMINAR") })).mutation(async ({ input }) => {
      try {
        return await deleteCustomerByAdmin(input.id);
      } catch (error) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "No se pudo eliminar el cliente." });
      }
    })
  }),
  reviews: router({
    list: publicProcedure.input(z2.object({ productId: z2.string().uuid() })).query(({ input }) => getReviewsByProduct(input.productId)),
    create: publicProcedure.input(z2.object({ productId: z2.string().uuid(), rating: z2.number().int().min(1).max(5), comment: z2.string().trim().min(8).max(500) })).mutation(async ({ ctx, input }) => {
      const customer = await getCustomerFromRequest(ctx.req);
      if (!customer) throw new TRPCError3({ code: "UNAUTHORIZED", message: "Verifica tu correo e inicia sesi\xF3n para publicar rese\xF1as." });
      try {
        return await createCustomerReview(customer.id, input.productId, input.rating, input.comment);
      } catch (error) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "No se pudo publicar la rese\xF1a." });
      }
    })
  }),
  products: router({
    list: publicProcedure.query(() => getActiveProducts()),
    adminList: adminProcedure2.query(() => getAllProducts()),
    delete: adminProcedure2.input(z2.object({ id: z2.string().uuid() })).mutation(({ input }) => deleteProductById(input.id)),
    create: adminProcedure2.input(productInput).mutation(({ input }) => insertProduct(input)),
    update: adminProcedure2.input(productInput.extend({ id: z2.string().uuid() })).mutation(({ input }) => {
      const { id, ...values } = input;
      return updateProductById(id, values);
    }),
    uploadImage: adminProcedure2.input(z2.object({
      fileName: z2.string().regex(/\.(jpe?g|png|webp)$/i),
      contentType: z2.enum(["image/jpeg", "image/png", "image/webp"]),
      data: z2.string().regex(/^data:image\/(jpeg|png|webp);base64,/)
    })).mutation(async ({ input }) => {
      const base64 = input.data.split(",")[1] ?? "";
      const bytes = Buffer.from(base64, "base64");
      if (bytes.length > 8 * 1024 * 1024) throw new TRPCError3({ code: "PAYLOAD_TOO_LARGE", message: "La imagen no puede superar 8 MB." });
      const result = await storagePut(`panex-products/${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-")}`, bytes, input.contentType);
      return { url: result.url };
    })
  }),
  orders: router({
    create: publicProcedure.input(z2.object({
      customerName: z2.string().min(2),
      phone: z2.string().min(7),
      deliveryAddress: z2.string().optional(),
      notes: z2.string().optional(),
      items: z2.string().min(2),
      total: z2.number().int().positive()
    })).mutation(({ input }) => insertOrder({ ...input, status: "nuevo" })),
    list: adminProcedure2.query(() => getAllOrders())
  })
});

// server/_core/context.ts
import { parse as parseCookieHeader3 } from "cookie";
import { jwtVerify as jwtVerify2 } from "jose";
var ADMIN_COOKIE = "panex_admin_session";
async function authenticateAdminCookie(cookieHeader) {
  if (!cookieHeader || !ENV.cookieSecret) return null;
  const token = parseCookieHeader3(cookieHeader)[ADMIN_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify2(token, new TextEncoder().encode(ENV.cookieSecret), { algorithms: ["HS256"] });
    if (payload.type !== "panex-admin") return null;
    return { id: "00000000-0000-0000-0000-000000000001", openId: "panex-password-admin", name: "Administrador Panex", email: ENV.ownerEmail, loginMethod: "password", role: "admin", createdAt: /* @__PURE__ */ new Date(0), updatedAt: /* @__PURE__ */ new Date(), lastSignedIn: /* @__PURE__ */ new Date() };
  } catch {
    return null;
  }
}
async function createContext(opts) {
  let user = await authenticateAdminCookie(opts.req.headers.cookie);
  if (!user) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      user = null;
    }
  }
  return { req: opts.req, res: opts.res, user };
}

// server/_core/app.ts
var ADMIN_COOKIE2 = "panex_admin_session";
function createApiApp() {
  const app2 = express();
  app2.use(express.json({ limit: "50mb" }));
  app2.use(express.urlencoded({ limit: "50mb", extended: true }));
  app2.post("/api/admin/login", async (req, res) => {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!ENV.adminPassword || !ENV.cookieSecret || password !== ENV.adminPassword) {
      res.status(401).json({ error: "Contrase\xF1a incorrecta" });
      return;
    }
    const token = await new SignJWT2({ type: "panex-admin" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(new TextEncoder().encode(ENV.cookieSecret));
    res.cookie(ADMIN_COOKIE2, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 12 * 60 * 60 * 1e3 });
    res.json({ ok: true });
  });
  app2.post("/api/admin/logout", (_req, res) => {
    res.clearCookie(ADMIN_COOKIE2, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
    res.json({ ok: true });
  });
  registerStorageProxy(app2);
  registerOAuthRoutes(app2);
  app2.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  return app2;
}

// api/index.ts
var app = createApiApp();
function handler(req, res) {
  process.env.NODE_ENV = "production";
  return app(req, res);
}
export {
  handler as default
};
