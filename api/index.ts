import type { Request, Response } from "express";
import { createApp } from "../server/_core/index";

let appPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: Request, res: Response) {
  process.env.NODE_ENV = "production";
  appPromise ??= createApp({ serveFrontend: false });
  const { app } = await appPromise;
  return app(req, res);
}
