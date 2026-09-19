import { and, desc, eq, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import { InsertUser, categories, customerAccounts, orders, products, reviews, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && ENV.databaseUrl) {
    try { _db = drizzle(ENV.databaseUrl); }
    catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = {
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    role: user.role ?? (user.email?.trim().toLowerCase() === ENV.ownerEmail ? "admin" : "user"),
    lastSignedIn: user.lastSignedIn ?? new Date(),
    updatedAt: new Date(),
  };
  await db.insert(users).values(values).onConflictDoUpdate({
    target: users.openId,
    set: { name: values.name, email: values.email, loginMethod: values.loginMethod, role: values.role, lastSignedIn: values.lastSignedIn, updatedAt: new Date() },
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

function normalizeProduct(product: typeof products.$inferSelect & { categoryName?: string | null }) {
  return {
    ...product,
    slug: product.slug ?? product.id,
    category: product.categoryName ?? "Panes",
    description: product.description ?? "",
    unit: product.unit ?? "pieza",
    imageUrl: product.imageUrl ?? "",
    isFeatured: product.isFeatured ? 1 : 0,
    isActive: product.isActive ? 1 : 0,
  };
}

export async function getActiveProducts() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ product: products, categoryName: categories.name }).from(products).leftJoin(categories, eq(products.categoryId, categories.id)).where(eq(products.isActive, true)).orderBy(desc(products.isFeatured), desc(products.createdAt));
  return rows.map(row => normalizeProduct({ ...row.product, categoryName: row.categoryName }));
}

export async function getAllProducts() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ product: products, categoryName: categories.name }).from(products).leftJoin(categories, eq(products.categoryId, categories.id)).orderBy(desc(products.createdAt));
  return rows.map(row => normalizeProduct({ ...row.product, categoryName: row.categoryName }));
}

export async function insertProduct(input: any) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const id = randomUUID();
  await db.insert(products).values({ id, name: input.name, slug: input.slug, description: input.description, price: input.price, unit: input.unit, imageUrl: input.imageUrl, isFeatured: Boolean(input.isFeatured), isActive: Boolean(input.isActive), stock: 100 });
  return { id };
}

export async function updateProductById(id: string, input: any) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(products).set({ name: input.name, slug: input.slug, description: input.description, price: input.price, unit: input.unit, imageUrl: input.imageUrl, isFeatured: Boolean(input.isFeatured), isActive: Boolean(input.isActive), updatedAt: new Date() }).where(eq(products.id, id));
  return { success: true } as const;
}

export async function deleteProductById(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(products).where(eq(products.id, id));
  return { success: true } as const;
}

export async function insertOrder(input: any) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const id = randomUUID();
  await db.insert(orders).values({ id, customerName: input.customerName, phone: input.phone, deliveryAddress: input.deliveryAddress ?? null, notes: input.notes ?? null, items: { summary: input.items }, total: input.total, status: "pendiente" });
  return id;
}

export async function getAllOrders() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(orders).orderBy(desc(orders.createdAt));
}

export async function getReviewsByProduct(productId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: reviews.id, productId: reviews.productId, rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt, reviewerName: reviews.customerName })
    .from(reviews).where(and(eq(reviews.productId, productId), or(eq(reviews.status, "aprobada"), eq(reviews.status, "approved")))).orderBy(desc(reviews.createdAt));
}

export async function createCustomerReview(accountId: string, productId: string, rating: number, comment: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const account = (await db.select({ id: customerAccounts.id, name: customerAccounts.name, emailVerified: customerAccounts.emailVerified }).from(customerAccounts).where(eq(customerAccounts.id, accountId)).limit(1))[0];
  if (!account?.emailVerified) throw new Error("Verifica tu correo antes de publicar reseñas.");
  const product = (await db.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1))[0];
  if (!product) throw new Error("Producto no encontrado.");
  await db.insert(reviews).values({ userId: null, customerName: account.name, productId, rating, comment: comment.trim(), status: "aprobada" });
  return { success: true } as const;
}
