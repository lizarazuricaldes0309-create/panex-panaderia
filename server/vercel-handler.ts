import { createApiApp } from "./_core/app";

const app = createApiApp();

export default function handler(req: any, res: any) {
  process.env.NODE_ENV = "production";
  return app(req, res);
}
