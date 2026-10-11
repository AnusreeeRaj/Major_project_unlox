import { fixtures } from "../../../shared/fixtures.js";
import { plans } from "../../../unfazed-backend/src/config/plans.js";
const data = fixtures();
let role = "therapist",
  clientId = "client-1";
const clone = (x) => structuredClone(x),
  id = () => crypto.randomUUID(),
  t = () => data.therapists[0],
  cfg = () => plans.find((p) => p.id === t().tier),
  error = (message, code) => {
    throw Object.assign(Error(message), { code });
  };
const add = (key, v) => {
  const r = { _id: id(), createdAt: new Date().toISOString(), ...v };
  data[key].push(r);
  return r;
};
const gate = (feature) => {
  if (!cfg().features[feature])
    error(
      "This feature is available on Growth and Practice.",
      "UPGRADE_REQUIRED",
    );
};
function stats() {
  const paid = data.payments.filter((p) => p.status === "paid"),
    group = {};
  paid.forEach((p) => {
    const m = p.createdAt.slice(0, 7);
    group[m] = (group[m] ?? 0) + p.amountPaise;
  });
  const done = data.sessions.filter((s) =>
    ["completed", "no-show"].includes(s.status),
  );
  return {
    activeClients: data.clients.filter((c) => c.status === "active").length,
    sessions: data.sessions.length,
    totalRevenue: paid.reduce((a, b) => a + b.amountPaise, 0),
    noShowRate: done.length
      ? Math.round(
          (done.filter((s) => s.status === "no-show").length / done.length) *
            100,
        )
      : 0,
    revenue: Object.entries(group).map(([_id, amountPaise]) => ({
      _id,
      amountPaise,
    })),
  };
}
function slots(date) {
  const a = data.availability[0],
    day = new Date(date + "T12:00:00+05:30").getDay() || 7,
    hours = Object.hasOwn(a.overrides, date)
      ? a.overrides[date]
      : a.weekly[day];
  if (!hours?.length) return [];
  let start = new Date(`${date}T${hours[0]}:00+05:30`).getTime(),
    end = new Date(`${date}T${hours[1]}:00+05:30`).getTime();
  const out = [];
  while (start + a.duration * 60000 <= end) {
    const finish = start + a.duration * 60000,
      iso = new Date(start).toISOString();
    if (
      start > Date.now() &&
      !a.blocked.includes(iso) &&
      !data.sessions.some(
        (s) =>
          s.status !== "cancelled" &&
          Date.parse(s.start) < finish + a.buffer * 60000 &&
          Date.parse(s.end) + a.buffer * 60000 > start,
      )
    )
      out.push({
        start: iso,
        end: new Date(finish).toISOString(),
        duration: a.duration,
      });
    start += (a.duration + a.buffer) * 60000;
  }
  return out;
}
export async function demoRequest(method, path, body = {}) {
  const [base, query = ""] = path.split("?"),
    q = new URLSearchParams(query);
  let result;
  if (base === "/auth/login") {
    role = body.role ?? "therapist";
    if (role === "client") clientId = "client-1";
    result = {
      token: "demo",
      user: {
        ...(role === "therapist"
          ? t()
          : data.clients.find((c) => c._id === clientId)),
        role,
      },
    };
  } else if (base === "/auth/register") {
    error(
      "Use the included demo practice. Create your own account when running the full backend.",
    );
  } else if (base === "/me")
    result = {
      ...(role === "therapist"
        ? t()
        : data.clients.find((c) => c._id === clientId)),
      role,
      therapistSlug: t().slug,
    };
  else if (base === "/entitlements")
    result = {
      ...cfg(),
      _id: cfg().id,
      canAddClient:
        data.clients.filter((c) => c.status === "active").length <
        cfg().activeClientCap,
    };
  else if (base === "/plans") result = plans.map((p) => ({ ...p, _id: p.id }));
  else if (base.startsWith("/public/") && base.endsWith("/slots"))
    result = slots(q.get("date"));
  else if (base.startsWith("/public/") && base.endsWith("/intake")) {
    if (
      data.clients.filter((c) => c.status === "active").length >=
      cfg().activeClientCap
    )
      error("The practice has reached its client limit.", "UPGRADE_REQUIRED");
    const existing = data.clients.find((c) => c.email === body.email);
    if (
      existing &&
      (!existing.invitationToken ||
        body.invitationToken !== existing.invitationToken)
    )
      error(
        "This email is already registered. Use the invitation link or sign in.",
      );
    if (!body.consent || !body.name || !body.concern || Number(body.age) < 18)
      error("Complete the intake and accept consent.");
    const c = existing
      ? Object.assign(existing, {
          intake: {
            concern: body.concern,
            history: body.history,
            age: body.age,
          },
          consent: {
            accepted: true,
            at: new Date().toISOString(),
            version: "intake-v1",
          },
          invitationToken: null,
        })
      : add("clients", {
          therapistId: t()._id,
          name: body.name,
          email: body.email,
          status: "active",
          tags: ["New client"],
          intake: {
            age: body.age,
            concern: body.concern,
            history: body.history,
          },
          consent: {
            accepted: true,
            at: new Date().toISOString(),
            version: "intake-v1",
          },
        });
    role = "client";
    clientId = c._id;
    result = { token: "demo", user: { ...c, role } };
  } else if (base.startsWith("/public/"))
    result = {
      therapist: t(),
      pricePaise: cfg().sessionPricePaise,
      packages: cfg().features.packages ? data.packages : [],
    };
  else if (base === "/clients" && method === "GET") result = data.clients;
  else if (base === "/clients" && method === "POST") {
    if (
      data.clients.filter((c) => c.status === "active").length >=
      cfg().activeClientCap
    )
      error(
        "Your plan’s active-client limit has been reached.",
        "UPGRADE_REQUIRED",
      );
    if (data.clients.some((c) => c.email === body.email))
      error("Client already exists");
    result = add("clients", {
      ...body,
      therapistId: t()._id,
      status: "active",
      invitationToken: id(),
      consent: { accepted: false },
    });
  } else if (base.startsWith("/clients/") && method === "PATCH") {
    const c = data.clients.find((c) => c._id === base.split("/")[2]);
    if (
      body.status === "active" &&
      c.status !== "active" &&
      data.clients.filter((c) => c.status === "active").length >=
        cfg().activeClientCap
    )
      error("Active-client limit reached.", "UPGRADE_REQUIRED");
    Object.assign(c, body);
    result = c;
  } else if (base === "/sessions" && method === "GET")
    result = data.sessions.filter(
      (s) => role === "therapist" || s.clientId === clientId,
    );
  else if (base === "/sessions" && method === "POST") {
    const cid = role === "client" ? clientId : body.clientId;
    const c = data.clients.find((c) => c._id === cid);
    if (!c?.consent?.accepted)
      error("This client must complete intake and consent first.");
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(body.start));
    const slot = slots(date).find((s) => s.start === body.start);
    if (!slot) error("This slot is no longer available.");
    let credit;
    if (body.clientPackageId) {
      credit = data.clientPackages.find(
        (p) => p._id === body.clientPackageId && p.clientId === cid,
      );
      if (
        !credit ||
        credit.remaining < 1 ||
        Date.parse(credit.expiresAt) < Date.now()
      )
        error("No usable package credits");
      credit.remaining--;
    }
    result = add("sessions", {
      ...slot,
      therapistId: t()._id,
      clientId: cid,
      clientPackageId: credit?._id,
      status: "confirmed",
      paymentStatus: credit ? "package" : "pending",
      amountPaise: credit ? 0 : cfg().sessionPricePaise,
      mode: "Video consultation",
    });
    add("notifications", {
      event: "booking.confirmed",
      clientId: cid,
      payload: { sessionId: result._id },
      status: "queued_stub",
    });
  } else if (base.startsWith("/sessions/") && method === "PATCH") {
    const s = data.sessions.find((s) => s._id === base.split("/")[2]);
    if (s.status !== "confirmed")
      error("Only confirmed sessions can be changed");
    if (s.clientPackageId && body.status === "cancelled") {
      const credit = data.clientPackages.find(
        (c) => c._id === s.clientPackageId,
      );
      if (credit) credit.remaining++;
    }
    Object.assign(s, body);
    result = s;
  } else if (base === "/notes" && method === "GET")
    result = data.notes.filter((n) =>
      role === "therapist"
        ? !q.get("clientId") || n.clientId === q.get("clientId")
        : n.type === "shared" && n.clientId === clientId,
    );
  else if (base === "/notes" && method === "POST") {
    if (body.format !== "freeform") gate("soap");
    result = add("notes", { ...body, therapistId: t()._id });
  } else if (base === "/payments" && method === "GET")
    result = data.payments.filter(
      (p) => role === "therapist" || p.clientId === clientId,
    );
  else if (base === "/payments/order") {
    const s = data.sessions.find((s) => s._id === body.sessionId),
      p = data.packages.find((p) => p._id === body.packageId);
    if (p) gate("packages");
    if (!p && (!s || s.paymentStatus !== "pending"))
      error("Select an unpaid session or package");
    result = add("payments", {
      therapistId: t()._id,
      clientId,
      sessionId: s?._id,
      packageId: p?._id,
      amountPaise: s?.amountPaise ?? p.amountPaise,
      status: "created",
      provider: "demo",
      receipt: "UF-" + id().slice(0, 8),
    });
  } else if (base.match(/^\/payments\/[^/]+\/demo-confirm$/)) {
    const p = data.payments.find((p) => p._id === base.split("/")[2]);
    if (p.status !== "paid") {
      p.status = "paid";
      if (p.sessionId)
        data.sessions.find((s) => s._id === p.sessionId).paymentStatus = "paid";
      if (p.packageId) {
        const pack = data.packages.find((x) => x._id === p.packageId);
        add("clientPackages", {
          clientId,
          packageId: p.packageId,
          paymentId: p._id,
          remaining: pack.count,
          expiresAt: new Date(
            Date.now() + pack.expiryDays * 86400000,
          ).toISOString(),
        });
      }
    }
    result = p;
  } else if (base === "/availability" && method === "GET")
    result = data.availability[0];
  else if (base === "/availability" && method === "PUT") {
    if (body.timezone !== "Asia/Kolkata")
      error(
        "The hosted demo uses Asia/Kolkata. The backend supports other IANA timezones.",
      );
    Object.assign(data.availability[0], body);
    result = data.availability[0];
  } else if (base === "/overview") result = stats();
  else if (base === "/analytics") {
    gate("advancedAnalytics");
    result = stats();
  } else if (base === "/profile") {
    Object.assign(t(), body);
    result = t();
  } else if (base === "/notifications") result = data.notifications;
  else if (base === "/packages" && method === "GET")
    result = cfg().features.packages ? data.packages : [];
  else if (base === "/packages" && method === "POST") {
    gate("packages");
    result = add("packages", {
      therapistId: t()._id,
      ...body,
      amountPaise: cfg().sessionPricePaise * body.count,
      expiryDays: cfg().packageExpiryDays,
    });
  } else if (base === "/client-packages")
    result = data.clientPackages.filter(
      (p) => role === "therapist" || p.clientId === clientId,
    );
  else if (base === "/messages" && method === "GET")
    result = data.messages.filter(
      (m) => m.clientId === (role === "client" ? clientId : q.get("clientId")),
    );
  else if (base === "/messages" && method === "POST")
    result = add("messages", {
      therapistId: t()._id,
      clientId: role === "client" ? clientId : body.clientId,
      senderRole: role,
      body: body.body,
    });
  else if (base === "/subscription/demo") {
    if (!plans.some((p) => p.id === body.tier)) error("Unknown plan");
    t().tier = body.tier;
    result = t();
  } else error("This action is unavailable in the demo.");
  return clone(result);
}
