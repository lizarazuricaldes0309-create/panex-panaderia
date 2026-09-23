import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { createCustomerReview, deleteProductById, getActiveProducts, getAllOrders, getAllProducts, getReviewsByProduct, insertOrder, insertProduct, updateProductById } from "./db";
import { storagePut } from "./storage";
import { clearCustomerCookie, deleteCustomerByAdmin, getCustomerFromRequest, listCustomers, loginCustomer, logoutCustomer, registerCustomer, resendVerification, setCustomerCookie, updateCustomerByAdmin, verifyCustomerEmail } from "./customerAuth";

const productInput = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  category: z.string().min(2),
  description: z.string().min(5),
  price: z.number().int().positive(),
  unit: z.string().min(2),
  imageUrl: z.string().min(5),
  isFeatured: z.number().int().min(0).max(1).default(0),
  isActive: z.number().int().min(0).max(1).default(1),
});

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" || (ctx.user.email ?? "").trim().toLowerCase() !== ENV.ownerEmail) throw new TRPCError({ code: "FORBIDDEN", message: "Solo el correo propietario puede administrar Panex." });
  return next();
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    adminAccess: publicProcedure.query(({ ctx }) => Boolean(ctx.user && ctx.user.role === "admin" && (ctx.user.email ?? "").trim().toLowerCase() === ENV.ownerEmail)),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  customers: router({
    me: publicProcedure.query(({ ctx }) => getCustomerFromRequest(ctx.req)),
    register: publicProcedure.input(z.object({
      name: z.string().trim().min(2).max(160),
      email: z.string().trim().email().max(320),
      phone: z.string().trim().min(7).max(40).optional(),
      password: z.string().min(8).max(128),
    })).mutation(async ({ ctx, input }) => {
      try {
        const result = await registerCustomer(input);
        if ("token" in result && result.token) setCustomerCookie(ctx.res, ctx.req, result.token);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo crear la cuenta.";
        throw new TRPCError({ code: message.includes("Ya existe") ? "CONFLICT" : "INTERNAL_SERVER_ERROR", message });
      }
    }),
    verifyEmail: publicProcedure.input(z.object({ email: z.string().trim().email().max(320), code: z.string().regex(/^\d{6}$/) })).mutation(async ({ ctx, input }) => {
      try {
        const result = await verifyCustomerEmail(input.email, input.code);
        setCustomerCookie(ctx.res, ctx.req, result.token);
        return result.customer;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "No se pudo verificar el correo." });
      }
    }),
    resendVerification: publicProcedure.input(z.object({ email: z.string().trim().email().max(320) })).mutation(async ({ input }) => {
      try { return await resendVerification(input.email); }
      catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "No se pudo reenviar el código." }); }
    }),
    login: publicProcedure.input(z.object({
      email: z.string().trim().email().max(320),
      password: z.string().min(8).max(128),
    })).mutation(async ({ ctx, input }) => {
      try {
        const result = await loginCustomer(input.email, input.password);
        setCustomerCookie(ctx.res, ctx.req, result.token);
        return result.customer;
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo iniciar sesión.";
        throw new TRPCError({ code: message.includes("incorrectos") ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR", message });
      }
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      await logoutCustomer(ctx.req);
      clearCustomerCookie(ctx.res, ctx.req);
      return { success: true } as const;
    }),
    adminList: adminProcedure.query(() => listCustomers()),
    adminUpdate: adminProcedure.input(z.object({ id: z.string().uuid(), name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(320), phone: z.string().trim().min(7).max(40).optional(), password: z.string().min(8).max(128).optional() })).mutation(async ({ input }) => {
      try { return await updateCustomerByAdmin(input); }
      catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "No se pudo actualizar el cliente." }); }
    }),
    adminDelete: adminProcedure.input(z.object({ id: z.string().uuid(), confirmation: z.literal("ELIMINAR") })).mutation(async ({ input }) => {
      try { return await deleteCustomerByAdmin(input.id); }
      catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "No se pudo eliminar el cliente." }); }
    }),
  }),
  reviews: router({
    list: publicProcedure.input(z.object({ productId: z.string().uuid() })).query(({ input }) => getReviewsByProduct(input.productId)),
    create: publicProcedure.input(z.object({ productId: z.string().uuid(), rating: z.number().int().min(1).max(5), comment: z.string().trim().min(8).max(500) })).mutation(async ({ ctx, input }) => {
      const customer = await getCustomerFromRequest(ctx.req);
      if (!customer) throw new TRPCError({ code: "UNAUTHORIZED", message: "Verifica tu correo e inicia sesión para publicar reseñas." });
      try { return await createCustomerReview(customer.id, input.productId, input.rating, input.comment); }
      catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "No se pudo publicar la reseña." }); }
    }),
  }),
  products: router({
    list: publicProcedure.query(() => getActiveProducts()),
    adminList: adminProcedure.query(() => getAllProducts()),
    delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ input }) => deleteProductById(input.id)),
    create: adminProcedure.input(productInput).mutation(({ input }) => insertProduct(input)),
    update: adminProcedure.input(productInput.extend({ id: z.string().uuid() })).mutation(({ input }) => {
      const { id, ...values } = input;
      return updateProductById(id, values);
    }),
    uploadImage: adminProcedure.input(z.object({
      fileName: z.string().regex(/\.(jpe?g|png|webp)$/i),
      contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      data: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/),
    })).mutation(async ({ input }) => {
      const base64 = input.data.split(",")[1] ?? "";
      const bytes = Buffer.from(base64, "base64");
      if (bytes.length > 8 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "La imagen no puede superar 8 MB." });
      const result = await storagePut(`panex-products/${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-")}`, bytes, input.contentType);
      return { url: result.url };
    }),
  }),
  orders: router({
    create: publicProcedure.input(z.object({
      customerName: z.string().min(2),
      phone: z.string().min(7),
      deliveryAddress: z.string().optional(),
      notes: z.string().optional(),
      items: z.string().min(2),
      total: z.number().int().positive(),
    })).mutation(({ input }) => insertOrder({ ...input, status: "nuevo" })),
    list: adminProcedure.query(() => getAllOrders()),
  }),
});

export type AppRouter = typeof appRouter;
