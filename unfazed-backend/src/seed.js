import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";
import { plans } from "./config/plans.js";
import { fixtures } from "../../shared/fixtures.js";
export async function seed(db, { demo = false } = {}) {
  for (const p of plans)
    if (!(await db.one("tiers", { _id: p.id }))) {
      const { id, ...rest } = p;
      await db.add("tiers", { _id: id, ...rest });
    }
  if (demo && !(await db.one("therapists", { _id: "therapist-demo" }))) {
    const hash = await bcrypt.hash("UnfazedDemo2026!", 12);
    for (const [table, rows] of Object.entries(fixtures()))
      for (const record of rows)
        await db.add(table, {
          ...record,
          ...(["therapists", "clients"].includes(table)
            ? { password_hash: hash }
            : {}),
        });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await import("dotenv/config");
  const { mongoStore } = await import("./config/db.js");
  if (!process.env.MONGO_URI) throw Error("Set MONGO_URI first");
  const db = await mongoStore(process.env.MONGO_URI);
  await seed(db, { demo: process.env.DEMO_MODE === "true" });
  console.log("Seed complete");
  process.exit(0);
}
