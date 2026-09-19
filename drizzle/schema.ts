import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("panex_manus_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  openId: text("open_id").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("login_method"),
  role: text("role").default("user").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in", { withTimezone: true }).defaultNow().notNull(),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0).notNull(),
});

export const products = pgTable("products", {
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orders = pgTable("orders", {
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const customerAccounts = pgTable("panex_customer_accounts", {
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
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const customerSessions = pgTable("panex_customer_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id"),
  customerName: text("customer_name").notNull(),
  orderId: uuid("order_id"),
  productId: uuid("product_id"),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  status: text("status").default("aprobada").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
export type Order = typeof orders.$inferInsert;
export type CustomerAccount = typeof customerAccounts.$inferSelect;
export type CustomerSession = typeof customerSessions.$inferSelect;
export type Review = typeof reviews.$inferSelect;
