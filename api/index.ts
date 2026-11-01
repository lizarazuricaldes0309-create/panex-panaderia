import { createApiApp } from "../server/_core/app";

const app = createApiApp();

export default function handler(req: Parameters<typeof app>[0], res: Parameters<typeof app>[1]) {
  process.env.NODE_ENV = "production";
  return app(req, res);
}
