import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import crypto from "node:crypto";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { io as connect } from "socket.io-client";
import { memoryStore } from "../src/config/db.js";
import { createApp } from "../src/app.js";
import { seed } from "../src/seed.js";
import { configureChat } from "../src/sockets/chatSocket.js";
import { notificationService } from "../src/services/notificationService.js";
const env = {
  JWT_SECRET: "test-only-secret-of-more-than-32-characters",
  DEMO_MODE: "true",
  PAYMENT_MODE: "demo",
  RAZORPAY_WEBHOOK_SECRET: "test-webhook-secret",
};
async function setup() {
  const db = memoryStore();
  await seed(db, { demo: true });
  const app = createApp(db, env),
    agent = request(app);
  const login = async (role = "therapist") => {
    const r = await agent
      .post("/api/auth/login")
      .send({
        email:
          role === "therapist" ? "mira@example.com" : "client1@example.com",
        password: "UnfazedDemo2026!",
        role,
        slug: "dr-mira-sharma",
      });
    assert.equal(r.status, 200);
    return r.body.token;
  };
  return { db, app, agent, login };
}
const auth = (token) => ({ Authorization: `Bearer ${token}` });
function futureDate() {
  let d = new Date();
  d.setDate(d.getDate() + 8);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

test("authentication, unique registration and profile editing", async () => {
  const { agent } = await setup();
  assert.equal((await agent.get("/api/clients")).status, 401);
  const r = await agent
    .post("/api/auth/register")
    .send({
      name: "Test Therapist",
      email: "test@example.com",
      password: "LongStrongPass123",
    });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.password_hash, undefined);
  assert.equal(
    (
      await agent
        .post("/api/auth/register")
        .send({
          name: "Other",
          email: "test@example.com",
          password: "LongStrongPass123",
        })
    ).status,
    409,
  );
  const update = await agent
    .patch("/api/profile")
    .set(auth(r.body.token))
    .send({
      name: "Dr Test",
      bio: "Practice description",
      slug: "dr-test",
      specializations: ["Stress"],
      languages: ["English"],
    });
  assert.equal(update.status, 200);
  const p = await agent.get("/api/public/dr-test");
  assert.equal(p.status, 200);
  assert.equal(p.body.therapist.password_hash, undefined);
  assert.equal(p.body.therapist.email, undefined);
});

test("private notes and other clients are isolated at API boundary", async () => {
  const { agent, login } = await setup();
  const therapist = await login(),
    client = await login("client");
  const privateResult = await agent
    .post("/api/notes")
    .set(auth(therapist))
    .send({
      clientId: "client-1",
      type: "private",
      format: "freeform",
      body: "Secret never sent to client",
    });
  assert.equal(privateResult.status, 201);
  const visible = await agent
    .get("/api/notes?clientId=client-2&type=private")
    .set(auth(client));
  assert.equal(visible.status, 200);
  assert.ok(visible.body.length > 0);
  assert.ok(
    visible.body.every((n) => n.type === "shared" && n.clientId === "client-1"),
  );
  assert.ok(!JSON.stringify(visible.body).includes("Secret never"));
  assert.equal((await agent.get("/api/clients").set(auth(client))).status, 403);
  assert.equal(
    (
      await agent
        .post("/api/notes")
        .set(auth(client))
        .send({
          clientId: "client-1",
          type: "shared",
          format: "freeform",
          body: "forbidden",
        })
    ).status,
    403,
  );
  const sessions = await agent.get("/api/sessions").set(auth(client));
  assert.ok(sessions.body.every((s) => s.clientId === "client-1"));
  assert.equal(
    (
      await agent
        .patch("/api/sessions/session-2")
        .set(auth(client))
        .send({ status: "cancelled" })
    ).status,
    404,
  );
});

test("concurrent booking accepts one, rejects duplicates; buffer and cancellation release slots", async () => {
  const { agent, login } = await setup();
  const token = await login("client");
  const date = futureDate();
  const slots = (
    await agent.get(`/api/public/dr-mira-sharma/slots?date=${date}`)
  ).body;
  assert.ok(slots.length > 2);
  assert.equal(
    Date.parse(slots[1].start) - Date.parse(slots[0].end),
    15 * 60000,
  );
  const results = await Promise.all(
    [1, 2].map(() =>
      agent
        .post("/api/sessions")
        .set(auth(token))
        .send({ start: slots[0].start }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const booked = results.find((r) => r.status === 201).body;
  const after = (
    await agent.get(`/api/public/dr-mira-sharma/slots?date=${date}`)
  ).body;
  assert.ok(!after.some((s) => s.start === booked.start));
  assert.equal(
    (
      await agent
        .patch(`/api/sessions/${booked._id}`)
        .set(auth(token))
        .send({ status: "cancelled" })
    ).status,
    200,
  );
  const released = (
    await agent.get(`/api/public/dr-mira-sharma/slots?date=${date}`)
  ).body;
  assert.ok(released.some((s) => s.start === booked.start));
});

test("intake validates consent, duplicate email and records timestamp", async () => {
  const { agent } = await setup();
  const body = {
    name: "New Client",
    email: "new@example.com",
    password: "LongStrongPass123",
    concern: "Study stress",
    age: 22,
  };
  assert.equal(
    (await agent.post("/api/public/dr-mira-sharma/intake").send(body)).status,
    400,
  );
  const good = await agent
    .post("/api/public/dr-mira-sharma/intake")
    .send({ ...body, consent: true });
  assert.equal(good.status, 201);
  assert.equal(good.body.user.consent.accepted, true);
  assert.ok(good.body.user.consent.at);
  assert.equal(good.body.user.password_hash, undefined);
  assert.equal(
    (
      await agent
        .post("/api/public/dr-mira-sharma/intake")
        .send({ ...body, consent: true })
    ).status,
    409,
  );
});

test("entitlement service enforces cap, templates, analytics and packages on server", async () => {
  const { agent, login } = await setup();
  const token = await login();
  assert.equal(
    (
      await agent
        .post("/api/subscription/demo")
        .set(auth(token))
        .send({ tier: "starter" })
    ).status,
    200,
  );
  for (const [method, path, body] of [
    ["post", "/api/clients", { name: "New", email: "limit@example.com" }],
    [
      "post",
      "/api/notes",
      {
        clientId: "client-1",
        type: "private",
        format: "soap",
        body: "SOAP note",
      },
    ],
    ["get", "/api/analytics"],
    ["post", "/api/packages", { name: "Package", count: 3 }],
  ]) {
    const r = await agent[method](path).set(auth(token)).send(body);
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "UPGRADE_REQUIRED");
  }
  assert.equal(
    (
      await agent
        .post("/api/notes")
        .set(auth(token))
        .send({
          clientId: "client-1",
          type: "private",
          format: "freeform",
          body: "Allowed note",
        })
    ).status,
    201,
  );
});

test("packages settle idempotently, redeem atomically, and invoice PDF is available", async () => {
  const { db, agent, login } = await setup();
  const token = await login("client");
  const order = await agent
    .post("/api/payments/order")
    .set(auth(token))
    .send({ packageId: "package-3" });
  assert.equal(order.status, 201);
  const p = order.body;
  const first = await agent
    .post(`/api/payments/${p._id}/demo-confirm`)
    .set(auth(token));
  assert.equal(first.status, 200);
  assert.equal(
    (await agent.post(`/api/payments/${p._id}/demo-confirm`).set(auth(token)))
      .status,
    200,
  );
  const credits = (await agent.get("/api/client-packages").set(auth(token)))
    .body;
  assert.equal(credits.length, 1);
  assert.equal(credits[0].remaining, 3);
  const slot = (
    await agent.get(`/api/public/dr-mira-sharma/slots?date=${futureDate()}`)
  ).body[0];
  const booking = await agent
    .post("/api/sessions")
    .set(auth(token))
    .send({ start: slot.start, clientPackageId: credits[0]._id });
  assert.equal(booking.status, 201);
  assert.equal(booking.body.paymentStatus, "package");
  assert.equal(
    (await db.one("clientPackages", { _id: credits[0]._id })).remaining,
    2,
  );
  const invoice = await agent
    .get(`/api/payments/${p._id}/invoice`)
    .set(auth(token));
  assert.equal(invoice.status, 200);
  assert.match(invoice.headers["content-type"], /pdf/);
  assert.equal(invoice.body.subarray(0, 4).toString(), "%PDF");
  await db.update("clientPackages", credits[0]._id, {
    expiresAt: "2000-01-01T00:00:00Z",
  });
  const next = (
    await agent.get(`/api/public/dr-mira-sharma/slots?date=${futureDate()}`)
  ).body[0];
  assert.equal(
    (
      await agent
        .post("/api/sessions")
        .set(auth(token))
        .send({ start: next.start, clientPackageId: credits[0]._id })
    ).status,
    400,
  );
});

test("webhook rejects bad signatures and confirms trusted payment exactly once", async () => {
  const { agent, login, db } = await setup();
  const client = await login("client");
  const order = (
    await agent
      .post("/api/payments/order")
      .set(auth(client))
      .send({ packageId: "package-6" })
  ).body;
  const event = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_verified",
          order_id: order.gatewayOrderId,
          amount: order.amountPaise,
          currency: "INR",
          status: "captured",
        },
      },
    },
  };
  const json = JSON.stringify(event),
    signature = crypto
      .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
      .update(json)
      .digest("hex");
  assert.equal(
    (
      await agent
        .post("/api/payments/webhook")
        .set("Content-Type", "application/json")
        .set("x-razorpay-signature", "bad")
        .send(json)
    ).status,
    401,
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await agent
          .post("/api/payments/webhook")
          .set("Content-Type", "application/json")
          .set("x-razorpay-signature", signature)
          .send(json)
      ).status,
      200,
    );
  assert.equal(
    (await db.find("clientPackages", { paymentId: order._id })).length,
    1,
  );
});

test("date overrides close a day and reject invalid hours", async () => {
  const { agent, login } = await setup();
  const token = await login();
  const a = (await agent.get("/api/availability").set(auth(token))).body;
  const date = futureDate();
  assert.equal(
    (
      await agent
        .put("/api/availability")
        .set(auth(token))
        .send({ ...a, overrides: { [date]: [] } })
    ).status,
    200,
  );
  assert.deepEqual(
    (await agent.get(`/api/public/dr-mira-sharma/slots?date=${date}`)).body,
    [],
  );
  assert.equal(
    (
      await agent
        .put("/api/availability")
        .set(auth(token))
        .send({ ...a, weekly: { 1: ["17:00", "09:00"] } })
    ).status,
    400,
  );
});

test("Socket.IO sends authenticated messages and restricts rooms", async () => {
  const { app, db, agent, login } = await setup();
  const therapist = await login(),
    client = await login("client");
  const server = createServer(app),
    io = new Server(server);
  app.set("io", io);
  configureChat(io, db, env.JWT_SECRET);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const socket = connect(base, {
    auth: { token: client },
    transports: ["websocket"],
  });
  try {
    await new Promise((resolve, reject) => {
      socket.on("connect", resolve);
      socket.on("connect_error", reject);
    });
    const joined = await new Promise((r) =>
      socket.emit("join", { clientId: "client-2" }, r),
    );
    assert.equal(joined.ok, true); // Client-supplied ID is ignored; joined own room.
    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Message timed out")), 2000);
      socket.once("message", (m) => {
        clearTimeout(timer);
        resolve(m);
      });
    });
    const result = await agent
      .post("/api/messages")
      .set(auth(therapist))
      .send({ clientId: "client-1", body: "Secure test message" });
    assert.equal(result.status, 201);
    assert.equal((await received).body, "Secure test message");
    const clientMsgs = (
      await agent.get("/api/messages?clientId=client-2").set(auth(client))
    ).body;
    assert.ok(clientMsgs.every((m) => m.clientId === "client-1"));
  } finally {
    socket.close();
    await new Promise((r) => io.close(r));
    server.close();
  }
});

test("notification reminders deduplicate per session", async () => {
  const { db } = await setup();
  const s = await db.add("sessions", {
    therapistId: "therapist-demo",
    clientId: "client-1",
    start: new Date(Date.now() + 3600000).toISOString(),
    status: "confirmed",
  });
  const notify = notificationService(db);
  await notify.reminders();
  await notify.reminders();
  const events = await db.find("notifications", { event: "session.reminder" });
  assert.equal(events.filter((e) => e.payload.sessionId === s._id).length, 1);
});

test("therapist-created client needs a one-time invitation to claim intake", async () => {
  const { agent, login } = await setup();
  const token = await login();
  const created = await agent
    .post("/api/clients")
    .set(auth(token))
    .send({ name: "Invited Person", email: "invited@example.com" });
  assert.equal(created.status, 201);
  assert.ok(created.body.invitationToken);
  assert.equal(created.body.invitationHash, undefined);
  const body = {
    name: "Invited Person",
    email: "invited@example.com",
    age: 25,
    password: "InvitedStrong123",
    concern: "Stress",
    consent: true,
  };
  assert.equal(
    (await agent.post("/api/public/dr-mira-sharma/intake").send(body)).status,
    409,
  );
  const accepted = await agent
    .post("/api/public/dr-mira-sharma/intake")
    .send({ ...body, invitationToken: created.body.invitationToken });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.user._id, created.body._id);
  assert.equal(accepted.body.user.invitationHash, undefined);
  assert.equal(
    (
      await agent
        .post("/api/public/dr-mira-sharma/intake")
        .send({ ...body, invitationToken: created.body.invitationToken })
    ).status,
    409,
  );
});

test("package cancellation restores credit once even with concurrent requests", async () => {
  const { agent, db, login } = await setup();
  const client = await login("client");
  const credit = await db.add("clientPackages", {
    therapistId: "therapist-demo",
    clientId: "client-1",
    packageId: "package-3",
    paymentId: "unique-cancel-payment",
    remaining: 3,
    expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
  });
  const slot = (
    await agent.get(`/api/public/dr-mira-sharma/slots?date=${futureDate()}`)
  ).body[0];
  const s = (
    await agent
      .post("/api/sessions")
      .set(auth(client))
      .send({ start: slot.start, clientPackageId: credit._id })
  ).body;
  assert.equal(
    (await db.one("clientPackages", { _id: credit._id })).remaining,
    2,
  );
  const responses = await Promise.all(
    [1, 2].map(() =>
      agent
        .patch(`/api/sessions/${s._id}`)
        .set(auth(client))
        .send({ status: "cancelled" }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await db.one("clientPackages", { _id: credit._id })).remaining,
    3,
  );
});
