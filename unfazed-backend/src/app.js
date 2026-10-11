import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import PDFDocument from "pdfkit";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { assert, entitlementService } from "./services/entitlementService.js";
import { notificationService } from "./services/notificationService.js";
import {
  schedulingService,
  defaultAvailability,
} from "./services/schedulingService.js";
import { paymentService, verifySignature } from "./services/paymentService.js";
import { analytics } from "./services/analyticsService.js";
import {
  authMiddleware,
  therapistOnly,
  issueToken,
} from "./middleware/authMiddleware.js";
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const safe = (r) => {
  if (!r) return r;
  const { password_hash, invitationHash, bookingVersion, ...s } = r;
  return s;
};
const email = (x) =>
  typeof x === "string" &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) &&
  x.length < 255;
const str = (x, max = 5000) =>
  typeof x === "string" && x.trim().length > 0 && x.length <= max;
export function createApp(db, env) {
  assert(
    env.JWT_SECRET?.length >= 32,
    "JWT_SECRET must contain at least 32 characters",
  );
  const app = express(),
    ent = entitlementService(db),
    notify = notificationService(db),
    schedule = schedulingService(db, ent, notify),
    pay = paymentService(db, ent, notify, env);
  app.disable("x-powered-by");
  app.use(cors({ origin: env.FRONTEND_ORIGIN ?? "http://localhost:5173" }));
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.post(
    "/api/payments/webhook",
    express.raw({ type: "application/json", limit: "100kb" }),
    wrap(async (req, res) => {
      assert(
        verifySignature(
          req.body,
          req.headers["x-razorpay-signature"],
          env.RAZORPAY_WEBHOOK_SECRET,
        ),
        "Invalid webhook signature",
        401,
      );
      const e = JSON.parse(req.body);
      if (e.event === "payment.captured") {
        const p = e.payload.payment.entity;
        assert(
          p.currency === "INR" && p.status === "captured",
          "Invalid payment",
        );
        await pay.settle(p.order_id, p.id, p.amount);
      }
      res.json({ received: true });
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.get("/api/health", (req, res) =>
    res.json({
      ok: true,
      database: db.mode,
      payments: pay.demo ? "demo" : "razorpay",
    }),
  );
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 60,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  const session = (record, role) => ({
    user: { ...safe(record), role },
    token: issueToken(
      {
        id: record._id,
        role,
        therapistId: role === "therapist" ? record._id : record.therapistId,
      },
      env.JWT_SECRET,
    ),
  });
  app.post(
    "/api/auth/register",
    wrap(async (req, res) => {
      const { name, password } = req.body,
        mail = req.body.email?.trim().toLowerCase();
      assert(
        str(name, 100) &&
          email(mail) &&
          str(password, 72) &&
          Buffer.byteLength(password) <= 72 &&
          password.length >= 10,
        "Enter a name, valid email and password of 10–72 bytes",
      );
      assert(
        !(await db.one("therapists", { email: mail })),
        "Email already registered",
        409,
      );
      const slug =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") +
        "-" +
        randomUUID().slice(0, 6);
      const t = await db.add("therapists", {
        name,
        email: mail,
        password_hash: await bcrypt.hash(password, 12),
        slug,
        bio: "",
        specializations: [],
        languages: ["English"],
        tier: "starter",
        timezone: "Asia/Kolkata",
      });
      await db.add("availability", defaultAvailability(t._id));
      res.status(201).json(session(t, "therapist"));
    }),
  );
  app.post(
    "/api/auth/login",
    wrap(async (req, res) => {
      const role = req.body.role === "client" ? "client" : "therapist";
      const q = { email: String(req.body.email ?? "").toLowerCase() };
      if (role === "client") {
        const t = await db.one("therapists", { slug: req.body.slug });
        assert(t, "Invalid sign-in details", 401);
        q.therapistId = t._id;
      }
      const u = await db.one(role === "client" ? "clients" : "therapists", q);
      assert(
        u?.password_hash &&
          typeof req.body.password === "string" &&
          (await bcrypt.compare(req.body.password, u.password_hash)),
        "Invalid sign-in details",
        401,
      );
      res.json(session(u, role));
    }),
  );
  app.get(
    "/api/public/:slug",
    wrap(async (req, res) => {
      const t = await db.one("therapists", { slug: req.params.slug });
      assert(t, "Practice not found", 404);
      const p = await ent.config(t._id);
      res.json({
        therapist: {
          _id: t._id,
          name: t.name,
          slug: t.slug,
          bio: t.bio,
          specializations: t.specializations,
          languages: t.languages,
          timezone: t.timezone,
        },
        pricePaise: p.sessionPricePaise,
        packages: (await ent.canAccess(t._id, "packages"))
          ? await db.find("packages", { therapistId: t._id })
          : [],
      });
    }),
  );
  app.get(
    "/api/public/:slug/slots",
    wrap(async (req, res) => {
      const t = await db.one("therapists", { slug: req.params.slug });
      assert(t, "Practice not found", 404);
      res.json(await schedule.slots(t._id, req.query.date));
    }),
  );
  app.post(
    "/api/public/:slug/intake",
    wrap(async (req, res) => {
      const t = await db.one("therapists", { slug: req.params.slug });
      assert(t, "Practice not found", 404);
      const { name, password, concern, history, age, consent } = req.body,
        mail = req.body.email?.trim().toLowerCase();
      assert(
        str(name, 100) &&
          email(mail) &&
          str(password, 72) &&
          password.length >= 10 &&
          Buffer.byteLength(password) <= 72 &&
          str(concern) &&
          consent === true,
        "Complete required fields and accept consent. Password needs 10–72 bytes.",
      );
      assert(
        Number(age) >= 18 && Number(age) <= 120,
        "This intake supports adults aged 18 and over",
      );
      const result = await db.atomic(t._id, async () => {
        const existing = await db.one("clients", {
          therapistId: t._id,
          email: mail,
        });
        const details = {
          name,
          password_hash: await bcrypt.hash(password, 12),
          intake: {
            concern,
            history: String(history ?? "").slice(0, 5000),
            age: Number(age),
          },
          consent: {
            accepted: true,
            at: new Date().toISOString(),
            version: "intake-v1",
          },
          invitationHash: null,
        };
        if (existing) {
          assert(
            !existing.password_hash &&
              existing.invitationHash &&
              req.body.invitationToken &&
              createHash("sha256")
                .update(String(req.body.invitationToken))
                .digest("hex") === existing.invitationHash,
            "Email already registered; use your invitation link or sign in",
            409,
          );
          return db.update("clients", existing._id, details);
        }
        await ent.requireAccess(t._id, "addClient");
        return db.add("clients", {
          therapistId: t._id,
          email: mail,
          status: "active",
          tags: ["New client"],
          ...details,
        });
      });
      res.status(201).json(session(result, "client"));
    }),
  );
  app.use("/api", authMiddleware(env.JWT_SECRET));
  app.get(
    "/api/me",
    wrap(async (req, res) => {
      const u = await db.one(
        req.user.role === "therapist" ? "therapists" : "clients",
        { _id: req.user.id },
      );
      assert(u, "Account not found", 401);
      res.json({
        ...safe(u),
        role: req.user.role,
        ...(req.user.role === "client"
          ? {
              therapistSlug: (
                await db.one("therapists", { _id: u.therapistId })
              ).slug,
            }
          : {}),
      });
    }),
  );
  app.get(
    "/api/entitlements",
    wrap(async (req, res) => {
      const p = await ent.config(req.user.therapistId);
      res.json({
        ...p,
        canAddClient: await ent.canAccess(req.user.therapistId, "addClient"),
      });
    }),
  );
  app.get(
    "/api/plans",
    wrap(async (req, res) => res.json(await db.find("tiers"))),
  );
  app.get(
    "/api/sessions",
    wrap(async (req, res) =>
      res.json(
        await db.find("sessions", {
          therapistId: req.user.therapistId,
          ...(req.user.role === "client" ? { clientId: req.user.id } : {}),
        }),
      ),
    ),
  );
  app.post(
    "/api/sessions",
    wrap(async (req, res) => {
      const clientId =
        req.user.role === "client" ? req.user.id : req.body.clientId;
      res
        .status(201)
        .json(
          await schedule.book(
            req.user.therapistId,
            clientId,
            req.body.start,
            req.body.clientPackageId,
          ),
        );
    }),
  );
  app.patch(
    "/api/sessions/:id",
    wrap(async (req, res) => {
      const s = await db.one("sessions", {
        _id: req.params.id,
        therapistId: req.user.therapistId,
      });
      assert(
        s && (req.user.role === "therapist" || s.clientId === req.user.id),
        "Session not found",
        404,
      );
      const status = req.body.status;
      assert(
        req.user.role === "therapist"
          ? ["completed", "no-show", "cancelled"].includes(status)
          : status === "cancelled",
        "Invalid status",
      );
      const out = await db.atomic(s.therapistId, async () => {
        const current = await db.one("sessions", { _id: s._id });
        assert(
          current.status === "confirmed",
          "Only confirmed sessions can be changed",
          409,
        );
        if (current.clientPackageId && status === "cancelled") {
          const credit = await db.one("clientPackages", {
            _id: current.clientPackageId,
          });
          if (credit)
            await db.update("clientPackages", credit._id, {
              remaining: credit.remaining + 1,
            });
        }
        return db.update("sessions", s._id, { status });
      });
      await notify.emit(
        status === "completed" ? "session.followup" : "session.updated",
        s.therapistId,
        s.clientId,
        {
          sessionId: s._id,
          status,
          refundReview: s.paymentStatus === "paid" && status === "cancelled",
        },
      );
      res.json(out);
    }),
  );
  app.get(
    "/api/notes",
    wrap(async (req, res) => {
      const q = { therapistId: req.user.therapistId };
      if (req.user.role === "client") {
        q.clientId = req.user.id;
        q.type = "shared";
      } else if (req.query.clientId) q.clientId = req.query.clientId;
      res.json(await db.find("notes", q));
    }),
  );
  app.post(
    "/api/notes",
    therapistOnly,
    wrap(async (req, res) => {
      const { clientId, sessionId, type, format, body, soap } = req.body;
      assert(
        await db.one("clients", { _id: clientId, therapistId: req.user.id }),
        "Client not found",
        404,
      );
      assert(
        ["private", "shared"].includes(type) &&
          ["freeform", "soap", "dap"].includes(format),
        "Invalid note type or format",
      );
      assert(str(body, 20000), "Write a note before saving");
      if (format !== "freeform") await ent.requireAccess(req.user.id, "soap");
      if (sessionId)
        assert(
          await db.one("sessions", {
            _id: sessionId,
            therapistId: req.user.id,
            clientId,
          }),
          "Session not found",
          404,
        );
      res
        .status(201)
        .json(
          await db.add("notes", {
            therapistId: req.user.id,
            clientId,
            sessionId,
            type,
            format,
            body,
            soap,
          }),
        );
    }),
  );
  app.get(
    "/api/payments",
    wrap(async (req, res) =>
      res.json(
        await db.find("payments", {
          therapistId: req.user.therapistId,
          ...(req.user.role === "client" ? { clientId: req.user.id } : {}),
        }),
      ),
    ),
  );
  app.post(
    "/api/payments/order",
    wrap(async (req, res) => {
      assert(req.user.role === "client", "Client access required", 403);
      res.status(201).json(await pay.order(req.user, req.body));
    }),
  );
  app.post(
    "/api/payments/:id/demo-confirm",
    wrap(async (req, res) => {
      assert(pay.demo, "Demo payments are disabled", 403);
      const p = await db.one("payments", {
        _id: req.params.id,
        clientId: req.user.id,
        therapistId: req.user.therapistId,
        provider: "demo",
      });
      assert(p, "Order not found", 404);
      res.json(
        await pay.settle(p.gatewayOrderId, "demo_tx_" + p._id, p.amountPaise),
      );
    }),
  );
  app.get(
    "/api/payments/:id/invoice",
    wrap(async (req, res) => {
      const p = await db.one("payments", {
        _id: req.params.id,
        therapistId: req.user.therapistId,
        status: "paid",
      });
      assert(
        p && (req.user.role === "therapist" || p.clientId === req.user.id),
        "Invoice not found",
        404,
      );
      const t = await db.one("therapists", { _id: p.therapistId }),
        c = await db.one("clients", { _id: p.clientId });
      res.type("pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="invoice-${p.receipt}.pdf"`,
      );
      const doc = new PDFDocument({ margin: 60 });
      doc.pipe(res);
      doc.fontSize(28).text("unfazed.");
      doc
        .moveDown()
        .fontSize(18)
        .text(
          p.provider === "demo" ? "DEMO PAYMENT RECEIPT" : "Payment receipt",
        );
      doc
        .moveDown()
        .fontSize(11)
        .text(
          `Receipt: ${p.receipt}\nDate: ${new Date(p.createdAt).toLocaleDateString("en-IN")}\nProvider: ${t.name}\nClient: ${c.name}\nService: ${p.packageId ? "Session package" : "Therapy session"}\nAmount: INR ${(p.amountPaise / 100).toFixed(2)}\nConfigured GST component: INR ${(p.gstPaise / 100).toFixed(2)}\nStatus: Paid`,
        );
      doc
        .moveDown()
        .text(
          "GST-style educational receipt. Configure provider GST registration and tax treatment before issuing a statutory tax invoice.",
        );
      doc.end();
    }),
  );
  app.get(
    "/api/packages",
    wrap(async (req, res) =>
      res.json(
        (await ent.canAccess(req.user.therapistId, "packages"))
          ? await db.find("packages", { therapistId: req.user.therapistId })
          : [],
      ),
    ),
  );
  app.get(
    "/api/client-packages",
    wrap(async (req, res) =>
      res.json(
        await db.find("clientPackages", {
          therapistId: req.user.therapistId,
          ...(req.user.role === "client" ? { clientId: req.user.id } : {}),
        }),
      ),
    ),
  );
  const clientFor = (req) =>
    req.user.role === "client"
      ? req.user.id
      : (req.query.clientId ?? req.body.clientId);
  app.get(
    "/api/messages",
    wrap(async (req, res) => {
      const id = clientFor(req);
      assert(
        await db.one("clients", { _id: id, therapistId: req.user.therapistId }),
        "Client not found",
        404,
      );
      res.json(
        await db.find("messages", {
          therapistId: req.user.therapistId,
          clientId: id,
        }),
      );
    }),
  );
  app.post(
    "/api/messages",
    wrap(async (req, res) => {
      const clientId = clientFor(req);
      assert(
        await db.one("clients", {
          _id: clientId,
          therapistId: req.user.therapistId,
        }),
        "Client not found",
        404,
      );
      assert(str(req.body.body, 4000), "Message must be 1–4000 characters");
      const message = await db.add("messages", {
        therapistId: req.user.therapistId,
        clientId,
        body: req.body.body.trim(),
        senderRole: req.user.role,
      });
      app
        .get("io")
        ?.to(`${req.user.therapistId}:${clientId}`)
        .emit("message", message);
      res.status(201).json(message);
    }),
  );
  app.use("/api", therapistOnly);
  app.get(
    "/api/clients",
    wrap(async (req, res) =>
      res.json(
        (await db.find("clients", { therapistId: req.user.id })).map(safe),
      ),
    ),
  );
  app.post(
    "/api/clients",
    wrap(async (req, res) => {
      const { name, tags = [] } = req.body,
        mail = req.body.email?.toLowerCase();
      assert(
        str(name, 100) && email(mail) && Array.isArray(tags),
        "Enter name and valid email",
      );
      const invitationToken = randomBytes(24).toString("hex");
      const c = await db.atomic(req.user.id, async () => {
        await ent.requireAccess(req.user.id, "addClient");
        assert(
          !(await db.one("clients", { therapistId: req.user.id, email: mail })),
          "Client already exists",
          409,
        );
        return db.add("clients", {
          therapistId: req.user.id,
          name,
          email: mail,
          status: "active",
          tags: tags.filter((x) => str(x, 50)),
          invitationHash: createHash("sha256")
            .update(invitationToken)
            .digest("hex"),
          consent: { accepted: false },
        });
      });
      res.status(201).json({ ...safe(c), invitationToken });
    }),
  );
  app.patch(
    "/api/clients/:id",
    wrap(async (req, res) => {
      const c = await db.one("clients", {
        _id: req.params.id,
        therapistId: req.user.id,
      });
      assert(c, "Client not found", 404);
      assert(
        ["active", "inactive"].includes(req.body.status),
        "Invalid client status",
      );
      res.json(
        await db.atomic(req.user.id, async () => {
          if (c.status !== "active" && req.body.status === "active")
            await ent.requireAccess(req.user.id, "addClient");
          return safe(
            await db.update("clients", c._id, { status: req.body.status }),
          );
        }),
      );
    }),
  );
  app.patch(
    "/api/profile",
    wrap(async (req, res) => {
      const { name, bio, specializations, languages, slug } = req.body;
      assert(
        str(name, 100) &&
          typeof bio === "string" &&
          bio.length <= 5000 &&
          Array.isArray(specializations) &&
          Array.isArray(languages) &&
          specializations.every((x) => str(x, 100)) &&
          languages.every((x) => str(x, 100)),
        "Invalid profile",
      );
      assert(
        /^[a-z][a-z0-9-]{2,60}$/.test(slug),
        "Use a slug with 3–61 lowercase letters, numbers or hyphens",
      );
      const owner = await db.one("therapists", { slug });
      assert(
        !owner || owner._id === req.user.id,
        "This branded link is already taken",
        409,
      );
      res.json(
        safe(
          await db.update("therapists", req.user.id, {
            name,
            bio,
            specializations,
            languages,
            slug,
          }),
        ),
      );
    }),
  );
  app.get(
    "/api/availability",
    wrap(async (req, res) =>
      res.json(await db.one("availability", { therapistId: req.user.id })),
    ),
  );
  app.put(
    "/api/availability",
    wrap(async (req, res) => {
      const {
        weekly,
        overrides = {},
        blocked = [],
        duration,
        buffer,
        timezone,
      } = req.body;
      assert(
        [30, 45, 60, 90].includes(duration) &&
          Number.isInteger(buffer) &&
          buffer >= 0 &&
          buffer <= 60,
        "Invalid duration or buffer",
      );
      try {
        new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
      } catch {
        assert(false, "Invalid timezone");
      }
      const good = (hours) =>
        Array.isArray(hours) &&
        (hours.length === 0 ||
          (hours.length === 2 &&
            hours.every((x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x)) &&
            hours[0] < hours[1]));
      assert(
        weekly &&
          typeof weekly === "object" &&
          Object.entries(weekly).every(
            ([day, h]) => /^[1-7]$/.test(day) && good(h),
          ) &&
          Object.entries(overrides).every(
            ([d, h]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && good(h),
          ) &&
          Array.isArray(blocked) &&
          blocked.every(
            (x) => typeof x === "string" && Number.isFinite(Date.parse(x)),
          ),
        "Invalid availability",
      );
      const a = await db.one("availability", { therapistId: req.user.id });
      res.json(
        await db.update("availability", a._id, {
          weekly,
          overrides,
          blocked,
          duration,
          buffer,
          timezone,
        }),
      );
    }),
  );
  app.get(
    "/api/analytics",
    wrap(async (req, res) => {
      await ent.requireAccess(req.user.id, "advancedAnalytics");
      res.json(await analytics(db, req.user.id));
    }),
  );
  app.get(
    "/api/overview",
    wrap(async (req, res) => {
      const a = await analytics(db, req.user.id);
      res.json({
        activeClients: a.activeClients,
        sessions: a.sessions,
        totalRevenue: a.totalRevenue,
        noShowRate: a.noShowRate,
      });
    }),
  );
  app.get(
    "/api/notifications",
    wrap(async (req, res) =>
      res.json(await db.find("notifications", { therapistId: req.user.id })),
    ),
  );
  app.post(
    "/api/subscription/demo",
    wrap(async (req, res) => {
      assert(
        env.DEMO_MODE === "true",
        "Subscription billing is not configured; contact the operator",
        503,
      );
      assert(await db.one("tiers", { _id: req.body.tier }), "Unknown plan");
      res.json(
        safe(
          await db.update("therapists", req.user.id, { tier: req.body.tier }),
        ),
      );
    }),
  );
  app.post(
    "/api/packages",
    wrap(async (req, res) => {
      await ent.requireAccess(req.user.id, "packages");
      const cfg = await ent.config(req.user.id);
      const { count, name } = req.body;
      assert(
        cfg.packageSizes.includes(count) && str(name, 100),
        "Invalid package",
      );
      res
        .status(201)
        .json(
          await db.add("packages", {
            therapistId: req.user.id,
            name,
            count,
            amountPaise: cfg.sessionPricePaise * count,
            expiryDays: cfg.packageExpiryDays,
          }),
        );
    }),
  );
  app.use((req, res) => res.status(404).json({ message: "Route not found" }));
  app.use((error, req, res, next) => {
    const status = error.code === 11000 ? 409 : (error.status ?? 500);
    res
      .status(status)
      .json({
        message:
          status === 500
            ? "Something went wrong. Try again."
            : error.code === 11000
              ? "This record already exists"
              : error.message,
        code: error.code ?? "SERVER_ERROR",
      });
  });
  return app;
}
