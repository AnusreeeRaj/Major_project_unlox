import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
const child = spawn(process.execPath, ["server.js"], {
  cwd: new URL("../unfazed-backend/", import.meta.url),
  stdio: "inherit",
  env: {
    ...process.env,
    MONGO_URI: "",
    DEMO_MODE: "true",
    PAYMENT_MODE: "demo",
    JWT_SECRET: randomBytes(48).toString("hex"),
    PORT: "5000",
    FRONTEND_ORIGIN: "http://localhost:5173",
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
