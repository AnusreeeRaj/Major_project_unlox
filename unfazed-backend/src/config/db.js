import mongoose from "mongoose";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { models } from "../models/index.js";
const clone = (x) => structuredClone(x);
export function memoryStore() {
  const data = Object.fromEntries(Object.keys(models).map((k) => [k, []]));
  let lock = Promise.resolve();
  const match = (r, q) =>
    Object.entries(q).every(([k, v]) =>
      v && typeof v === "object"
        ? "$in" in v
          ? v.$in.includes(r[k])
          : "$ne" in v
            ? r[k] !== v.$ne
            : true
        : r[k] === v,
    );
  return {
    mode: "memory",
    data,
    async find(k, q = {}) {
      return clone(data[k].filter((r) => match(r, q)));
    },
    async one(k, q) {
      return (await this.find(k, q))[0] ?? null;
    },
    async add(k, v) {
      const r = {
        ...clone(v),
        _id: v._id ?? randomUUID(),
        createdAt: v.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data[k].push(r);
      return clone(r);
    },
    async update(k, id, v) {
      const r = data[k].find((x) => x._id === id);
      if (!r) return null;
      Object.assign(r, clone(v), { updatedAt: new Date().toISOString() });
      return clone(r);
    },
    async atomic(id, fn) {
      const before = lock;
      let release;
      lock = new Promise((r) => (release = r));
      await before;
      const snapshot = clone(data);
      try {
        return await fn();
      } catch (e) {
        for (const k in data) data[k] = snapshot[k];
        throw e;
      } finally {
        release();
      }
    },
  };
}
export async function mongoStore(uri) {
  await mongoose.connect(uri);
  await Promise.all(Object.values(models).map((m) => m.init()));
  const ctx = new AsyncLocalStorage();
  const opts = () => (ctx.getStore() ? { session: ctx.getStore() } : {});
  return {
    mode: "mongo",
    async find(k, q = {}) {
      return models[k].find(q, null, opts()).lean();
    },
    async one(k, q) {
      return models[k].findOne(q, null, opts()).lean();
    },
    async add(k, v) {
      return (
        await models[k].create([{ ...v, _id: v._id ?? randomUUID() }], opts())
      )[0].toObject();
    },
    async update(k, id, v) {
      return models[k]
        .findByIdAndUpdate(
          id,
          { $set: v },
          { ...opts(), new: true, runValidators: true },
        )
        .lean();
    },
    async atomic(therapistId, fn) {
      return mongoose.connection.transaction(async (session) =>
        ctx.run(session, async () => {
          if (therapistId)
            await models.therapists.updateOne(
              { _id: therapistId },
              { $inc: { bookingVersion: 1 } },
              { session },
            );
          return fn();
        }),
      );
    },
    async aggregate(k, pipeline) {
      return models[k].aggregate(pipeline);
    },
  };
}
