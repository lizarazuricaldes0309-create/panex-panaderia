import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";

function contextFor(role: "admin" | "user", openId = role === "admin" ? ENV.ownerOpenId : "panex-test-user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId,
      name: "Panex Test",
      email: role === "admin" && openId === ENV.ownerOpenId ? ENV.ownerEmail : "test@panex.local",
      loginMethod: "test",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("Panex admin access", () => {
  it("blocks catalog management for regular users", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.products.adminList()).rejects.toThrow("correo propietario");
  });

  it("accepts catalog management for admins before database access", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    await expect(caller.products.update({
      id: 0,
      name: "",
      slug: "",
      category: "",
      description: "",
      price: 0,
      unit: "",
      imageUrl: "",
      isFeatured: 0,
      isActive: 1,
    })).rejects.toThrow();
  });
});

describe("Panex admin ownership", () => {
  it("blocks an admin role that is not the owner account", async () => {
    const caller = appRouter.createCaller(contextFor("admin", "another-admin"));
    await expect(caller.products.adminList()).rejects.toThrow("correo propietario");
  });
});

describe("Panex order validation", () => {
  it("requires customer details and a positive total", async () => {
    const caller = appRouter.createCaller({
      ...contextFor("user"),
      user: null,
    });
    await expect(caller.orders.create({
      customerName: "",
      phone: "1",
      items: "",
      total: 0,
    })).rejects.toThrow();
  });
});
