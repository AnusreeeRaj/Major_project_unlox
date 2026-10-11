import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  ["../node_modules/vite/bin/vite.js", "--host", "0.0.0.0"],
  {
    cwd: new URL("../unfazed-frontend/", import.meta.url),
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_DEMO_MODE: "false",
      VITE_API_BASE_URL: "http://localhost:5000/api",
    },
  },
);
child.on("exit", (code) => process.exit(code ?? 0));
