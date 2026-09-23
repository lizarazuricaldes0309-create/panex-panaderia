import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { SignJWT } from "jose";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV } from "./env";

const ADMIN_COOKIE = "panex_admin_session";

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.post("/api/admin/login", async (req, res) => {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!ENV.adminPassword || !ENV.cookieSecret || password !== ENV.adminPassword) {
      res.status(401).json({ error: "Contraseña incorrecta" });
      return;
    }
    const token = await new SignJWT({ type: "panex-admin" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(new TextEncoder().encode(ENV.cookieSecret));
    res.cookie(ADMIN_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 12 * 60 * 60 * 1000 });
    res.json({ ok: true });
  });
  app.post("/api/admin/logout", (_req, res) => { res.clearCookie(ADMIN_COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" }); res.json({ ok: true }); });
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  return app;
}
