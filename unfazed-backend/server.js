import "dotenv/config";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { mongoStore, memoryStore } from "./src/config/db.js";
import { createApp } from "./src/app.js";
import { seed } from "./src/seed.js";
import { configureChat } from "./src/sockets/chatSocket.js";
import { notificationService } from "./src/services/notificationService.js";
const env = process.env;
if (!env.MONGO_URI && env.DEMO_MODE !== "true")
  throw Error("Set MONGO_URI or explicitly set DEMO_MODE=true");
const db = env.MONGO_URI ? await mongoStore(env.MONGO_URI) : memoryStore();
await seed(db, { demo: env.DEMO_MODE === "true" });
const app = createApp(db, env),
  server = createServer(app),
  io = new Server(server, {
    cors: { origin: env.FRONTEND_ORIGIN ?? "http://localhost:5173" },
  });
app.set("io", io);
configureChat(io, db, env.JWT_SECRET);
server.listen(env.PORT ?? 5000, () =>
  console.log(
    `Unfazed API ready. Database: ${db.mode}. Payments: ${env.PAYMENT_MODE}`,
  ),
);
setInterval(
  () =>
    notificationService(db)
      .reminders()
      .catch((e) => console.error("Reminder job failed", e.message)),
  60000,
).unref();
