import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  FileText,
  Wallet,
  MessageCircle,
  ChartNoAxesCombined,
  Settings,
  ArrowUpRight,
  Plus,
  Search,
  Bell,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock,
  Video,
  Lock,
  Globe,
  Download,
  X,
  LogOut,
  Menu,
  Heart,
  ShieldCheck,
  Leaf,
  ExternalLink,
  Send,
  Copy,
  CheckCircle2,
  CircleHelp,
  SlidersHorizontal,
  MoreHorizontal,
  CreditCard,
  RefreshCw,
  Link as LinkIcon,
} from "lucide-react";
import { io } from "socket.io-client";
import {
  api,
  DEMO,
  BASE,
  setToken,
  getToken,
  downloadInvoice,
} from "./api/client";
import "./styles.css";
const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format((n ?? 0) / 100);
const dayISO = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
const nextDate = (offset = 1) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return dayISO(d);
};
const pretty = (date, opts = {}) =>
  new Date(date).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    ...opts,
  });
const time = (date, zone = "Asia/Kolkata") =>
  new Date(date).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  });
const initials = (name) =>
  (name ?? "Client")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
const navItems = [
  ["Overview", LayoutDashboard],
  ["Schedule", CalendarDays],
  ["Clients", Users],
  ["Session notes", FileText],
  ["Payments", Wallet],
  ["Messages", MessageCircle],
  ["Analytics", ChartNoAxesCombined],
];
function Avatar({ name, small = false }) {
  return (
    <span
      className={"avatar " + (small ? "small" : "")}
      data-color={(name ?? "").charCodeAt(0) % 4}
    >
      {initials(name)}
    </span>
  );
}
function Badge({ value }) {
  return (
    <span className={"badge " + String(value).replace(/\s/g, "-")}>
      {String(value).replace(/_/g, " ")}
    </span>
  );
}
function Empty({
  title = "Nothing here yet",
  text = "Your records will appear here.",
  action,
}) {
  return (
    <div className="empty">
      <Leaf size={27} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Modal({ title, children, onClose, wide = false }) {
  useEffect(() => {
    const old = document.activeElement;
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const el = document.querySelector(".modal"),
          items = el?.querySelectorAll("button,input,select,textarea,a[href]");
        if (items?.length) {
          const first = items[0],
            last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", handler);
    document.querySelector(".modal button")?.focus();
    return () => {
      document.removeEventListener("keydown", handler);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide" : "")}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children ?? <input {...props} />}
    </label>
  );
}
function App() {
  const [user, setUser] = useState(null),
    [page, setPage] = useState("Overview"),
    [data, setData] = useState({
      clients: [],
      sessions: [],
      notes: [],
      payments: [],
      packages: [],
      credits: [],
      notifications: [],
    }),
    [ent, setEnt] = useState(null),
    [stats, setStats] = useState(null),
    [boot, setBoot] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState(null),
    [selected, setSelected] = useState(null),
    [menu, setMenu] = useState(false),
    [publicSlug, setPublicSlug] = useState(
      location.pathname.split("/").filter(Boolean)[0] ?? null,
    );
  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4500);
  };
  const fail = (e) => {
    if (e.code === "UPGRADE_REQUIRED") setModal("upgrade");
    else setError(e.message);
  };
  const refresh = useCallback(async () => {
    const me = await api("GET", "/me");
    setUser(me);
    const client = me.role === "client";
    const endpoints = [
      "/sessions",
      "/notes",
      "/payments",
      "/packages",
      "/client-packages",
      client ? "/me" : "/clients",
      "/entitlements",
      client ? "/me" : "/overview",
      client ? "/me" : "/notifications",
    ];
    const r = await Promise.all(endpoints.map((p) => api("GET", p)));
    setData({
      sessions: r[0],
      notes: r[1],
      payments: r[2],
      packages: r[3],
      credits: r[4],
      clients: client ? [r[5]] : r[5],
      notifications: client ? [] : r[8],
    });
    setEnt(r[6]);
    if (!client) setStats(r[7]);
    return me;
  }, []);
  useEffect(() => {
    if (DEMO && !publicSlug)
      api("POST", "/auth/login", { role: "therapist" })
        .then((r) => {
          setToken(r.token);
          return refresh();
        })
        .catch(fail)
        .finally(() => setBoot(false));
    else setBoot(false);
  }, []);
  useEffect(() => {
    const handler = () =>
      setPublicSlug(location.pathname.split("/").filter(Boolean)[0] ?? null);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool || !user) return;
    const controller = new AbortController();
    context.registerTool(
      {
        name: "navigate_practice",
        description: "Open a named section of the practice workspace.",
        inputSchema: {
          type: "object",
          properties: {
            section: { type: "string", enum: navItems.map((x) => x[0]) },
          },
          required: ["section"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async ({ section }) => {
          if (!navItems.some((x) => x[0] === section))
            throw Error("Unknown section");
          if (user.role !== "therapist") throw Error("Therapist view required");
          setPage(section);
          await new Promise((resolve) => requestAnimationFrame(resolve));
          return { section };
        },
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  }, [user?.role]);
  async function act(fn, msg) {
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      await refresh();
      if (msg) notify(msg);
      return result;
    } catch (e) {
      fail(e);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const clientName = (id) =>
    data.clients.find((c) => c._id === id)?.name ?? "Client";
  function navigate(p) {
    setPage(p);
    setMenu(false);
    setSelected(null);
    setError("");
  }
  async function switchRole(role) {
    setPublicSlug(null);
    history.pushState({}, "", "/");
    await act(async () => {
      const r = await api("POST", "/auth/login", { role });
      setToken(r.token);
      setPage(role === "client" ? "My care" : "Overview");
    });
  }
  function openBooking() {
    if (user?.role === "client") {
      setPublicSlug(user.slug ?? "dr-mira-sharma");
      setModal(null);
    } else setModal("book");
  }
  const publicView = (slug) => {
    setPublicSlug(slug);
    history.pushState({}, "", `/${slug}`);
  };
  if (boot)
    return (
      <div className="loading">
        <div className="brand">
          unfazed<span>.</span>
        </div>
        <p>Opening your practice…</p>
      </div>
    );
  if (publicSlug)
    return (
      <>
        <BookingPage
          slug={publicSlug}
          user={user}
          onAuth={async (r) => {
            setToken(r.token);
            await refresh();
          }}
          onPortal={() => {
            setPublicSlug(null);
            history.pushState({}, "", "/");
            setPage(user?.role === "client" ? "My care" : "Overview");
            refresh().catch(fail);
          }}
          notify={notify}
        />
        {toast && (
          <div role="status" className="toast">
            <CheckCircle2 size={18} />
            {toast}
          </div>
        )}
      </>
    );
  if (!user)
    return (
      <Auth
        onLogin={async (r) => {
          setToken(r.token);
          await refresh();
        }}
      />
    );
  const isClient = user.role === "client",
    title = page === "Overview" ? "Your practice, at a glance" : page;
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate(isClient ? "My care" : "Overview");
          }}
        >
          unfazed<span>.</span>
        </a>
        <div className="workspace-tag">
          <span className="logo-mark">
            <Leaf size={19} />
          </span>
          <div>
            <strong>
              {isClient
                ? "Your care space"
                : `${user.name.replace(/^Dr\.\s*/, "").split(" ")[0]}’s practice`}
            </strong>
            <small>{isClient ? "Client portal" : "PRIVATE PRACTICE"}</small>
          </div>
        </div>
        <p className="nav-label">{isClient ? "YOUR SPACE" : "WORKSPACE"}</p>
        <nav>
          {(isClient
            ? [
                ["My care", Heart],
                ["Session notes", FileText],
                ["Payments", Wallet],
                ["Messages", MessageCircle],
              ]
            : navItems
          ).map(([label, Icon]) => (
            <button
              key={label}
              className={page === label ? "active" : ""}
              onClick={() => navigate(label)}
            >
              <Icon size={19} />
              {label}
              {label === "Messages" && (
                <span className="nav-count">{data.clients.length ? 1 : 0}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {!isClient && (
            <>
              <div className="plan-mini">
                <span>
                  <span className="tiny-star">✳</span> {ent?.name} plan
                </span>
                <small>
                  {stats?.activeClients ?? 0} / {ent?.activeClientCap ?? 0}{" "}
                  active clients
                </small>
                <button onClick={() => setModal("upgrade")}>
                  Manage plan <ChevronRight size={15} />
                </button>
              </div>
              <button
                className={
                  "side-setting " + (page === "Settings" ? "active" : "")
                }
                onClick={() => navigate("Settings")}
              >
                <Settings size={19} />
                Settings
              </button>
            </>
          )}
          <button className="profile-mini" onClick={() => setModal("account")}>
            <Avatar name={user.name} small />
            <span>
              <strong>{user.name}</strong>
              <small>{isClient ? "Your account" : "Therapist account"}</small>
            </span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      <div className="main-wrap">
        <div className="demo-strip">
          {DEMO ? (
            <>
              <span className="demo-dot" />
              Interactive demo · Fictional records · Changes reset on refresh{" "}
              <button
                onClick={() => switchRole(isClient ? "therapist" : "client")}
              >
                Try {isClient ? "therapist dashboard" : "client portal"}{" "}
                <ExternalLink size={12} />
              </button>
            </>
          ) : (
            <>
              <ShieldCheck size={14} /> Your practice workspace
            </>
          )}
        </div>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle navigation"
            >
              <Menu />
            </button>
            <span>{isClient ? "Client portal" : "Workspace"}</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="top-actions">
            {!isClient && (
              <button
                className="text-button"
                onClick={() => publicView(user.slug)}
              >
                <ExternalLink size={16} />
                View booking page
              </button>
            )}
            <button
              aria-label="Notifications"
              className="icon-button bell"
              onClick={() => setModal("notifications")}
            >
              <Bell size={19} />
              {data.notifications.length > 0 && <i />}
            </button>
            <Avatar name={user.name} small />
          </div>
        </header>
        <main>
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Overview" ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">A LITTLE MORE ROOM FOR CARE</p>
                  <h1>
                    Good {new Date().getHours() < 12 ? "morning" : "afternoon"},{" "}
                    {user.name.split(" ")[1] ?? user.name.split(" ")[0]}{" "}
                    <span className="greeting-sun">☀</span>
                  </h1>
                  <p>Here’s what’s happening in your practice today.</p>
                </div>
                <button className="primary" onClick={() => setModal("book")}>
                  <Plus size={18} />
                  New appointment
                </button>
              </div>
              <div className="stats-grid">
                {[
                  [
                    CalendarDays,
                    "Sessions today",
                    data.sessions.filter(
                      (s) =>
                        dayISO(new Date(s.start)) === dayISO() &&
                        s.status !== "cancelled",
                    ).length,
                    "Make space for meaningful moments",
                    "mint",
                  ],
                  [
                    Users,
                    "Active clients",
                    stats?.activeClients ?? 0,
                    `${ent?.activeClientCap ?? 0} clients included in your plan`,
                    "blue",
                  ],
                  [
                    Wallet,
                    "Total collected",
                    money(stats?.totalRevenue),
                    "Across all recorded payments",
                    "sand",
                  ],
                  [
                    FileText,
                    "Session notes",
                    data.notes.length,
                    `${data.notes.filter((n) => n.type === "private").length} private · ${data.notes.filter((n) => n.type === "shared").length} shared`,
                    "lilac",
                  ],
                ].map(([Icon, label, value, detail, color]) => (
                  <section className="stat-card" key={label}>
                    <div>
                      <span>{label}</span>
                      <i className={color}>
                        <Icon size={18} />
                      </i>
                    </div>
                    <strong>{value}</strong>
                    <small>{detail}</small>
                  </section>
                ))}
              </div>
              <div className="overview-grid">
                <section className="panel agenda-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Today’s schedule{" "}
                        <span className="count">
                          {
                            data.sessions.filter(
                              (s) =>
                                dayISO(new Date(s.start)) === dayISO() &&
                                s.status !== "cancelled",
                            ).length
                          }
                        </span>
                      </h2>
                      <p>
                        {pretty(new Date(), {
                          weekday: "long",
                          year: "numeric",
                        })}{" "}
                        · IST
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("Schedule")}
                    >
                      Full calendar <ChevronRight size={16} />
                    </button>
                  </div>
                  <WeekStrip
                    selected={dayISO()}
                    onSelect={(d) => {
                      setSelected(d);
                      setPage("Schedule");
                    }}
                  />
                  <div className="agenda-list">
                    {data.sessions
                      .filter(
                        (s) =>
                          dayISO(new Date(s.start)) === dayISO() &&
                          s.status !== "cancelled",
                      )
                      .sort((a, b) => a.start.localeCompare(b.start))
                      .map((s) => (
                        <div className="agenda-row" key={s._id}>
                          <div className="time-column">
                            <strong>{time(s.start)}</strong>
                            <small>{s.duration} min</small>
                          </div>
                          <span
                            className={
                              "agenda-line " +
                              (s.status === "completed" ? "done" : "")
                            }
                          />
                          <Avatar name={clientName(s.clientId)} />
                          <div className="session-person">
                            <strong>{clientName(s.clientId)}</strong>
                            <small>
                              <Video size={13} /> {s.mode}
                            </small>
                          </div>
                          <Badge value={s.status} />
                          <button
                            className="icon-button"
                            aria-label={`View ${clientName(s.clientId)} appointment`}
                            onClick={() =>
                              setModal({ type: "session", session: s })
                            }
                          >
                            <ChevronRight size={19} />
                          </button>
                        </div>
                      ))}
                    {!data.sessions.some(
                      (s) =>
                        dayISO(new Date(s.start)) === dayISO() &&
                        s.status !== "cancelled",
                    ) && (
                      <Empty
                        title="A little breathing room"
                        text="No appointments today."
                        action={
                          <button
                            className="secondary"
                            onClick={() => setModal("book")}
                          >
                            Schedule an appointment
                          </button>
                        }
                      />
                    )}
                  </div>
                </section>
                <div className="overview-side">
                  <section className="care-card">
                    <span className="care-icon">
                      <Leaf size={24} />
                    </span>
                    <p>YOUR PRACTICE, CONNECTED</p>
                    <h2>
                      One link.
                      <br />A warmer welcome.
                    </h2>
                    <span>
                      Give clients a simple way to find you and book their next
                      session.
                    </span>
                    <div className="link-preview">
                      <Globe size={15} />
                      <span>/{user.slug}</span>
                      <button
                        aria-label="Copy booking link"
                        onClick={() =>
                          navigator.clipboard
                            .writeText(location.origin + "/" + user.slug)
                            .then(() => notify("Booking link copied"))
                            .catch(() => setModal("link"))
                        }
                      >
                        <Copy size={15} />
                      </button>
                    </div>
                    <button onClick={() => publicView(user.slug)}>
                      Preview your page <ExternalLink size={15} />
                    </button>
                  </section>
                  <section className="panel attention-panel">
                    <div className="panel-heading">
                      <h2>Needs a little attention</h2>
                      <span className="attention-dot" />
                    </div>
                    <button onClick={() => navigate("Session notes")}>
                      <span className="attention-icon">
                        <FileText size={18} />
                      </span>
                      <span>
                        <strong>Keep your notes up to date</strong>
                        <small>Capture the details while they’re fresh</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <button onClick={() => navigate("Payments")}>
                      <span className="attention-icon orange">
                        <Wallet size={18} />
                      </span>
                      <span>
                        <strong>
                          {
                            data.sessions.filter(
                              (s) =>
                                s.paymentStatus === "pending" &&
                                s.status === "confirmed",
                            ).length
                          }{" "}
                          outstanding payments
                        </strong>
                        <small>Review session payment status</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  </section>
                </div>
              </div>
              <section className="panel recent-panel">
                <div className="panel-heading">
                  <h2>People in your care</h2>
                  <button
                    className="text-button"
                    onClick={() => navigate("Clients")}
                  >
                    All clients <ChevronRight size={16} />
                  </button>
                </div>
                <div className="people-row">
                  {data.clients
                    .filter((c) => c.status === "active")
                    .slice(0, 4)
                    .map((c) => (
                      <button
                        key={c._id}
                        onClick={() => {
                          setSelected(c);
                          setPage("Clients");
                        }}
                      >
                        <Avatar name={c.name} />
                        <span>
                          <strong>{c.name}</strong>
                          <small>{c.tags.join(" · ")}</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {isClient ? "A SPACE FOR YOU" : "YOUR PRACTICE"}
                  </p>
                  <h1>
                    {page === "My care"
                      ? `Welcome, ${user.name.split(" ")[0]}`
                      : title}
                  </h1>
                  <p>
                    {
                      {
                        Schedule:
                          "Thoughtful planning. More presence in every session.",
                        Clients: "The people at the heart of your practice.",
                        "Session notes": isClient
                          ? "Reflections and resources shared by your therapist."
                          : "A place for reflections, progress, and next steps.",
                        Payments:
                          "A clear picture of sessions, payments, and packages.",
                        Messages: "Keep the conversation connected.",
                        Analytics: "Understand the rhythm of your practice.",
                        Settings: "Make this space your own.",
                        "My care":
                          "Your sessions and next steps, all in one place.",
                      }[page]
                    }
                  </p>
                </div>
                {page === "Clients" && (
                  <button
                    className="primary"
                    onClick={() => setModal("client")}
                  >
                    <Plus size={18} />
                    Add client
                  </button>
                )}
                {page === "Schedule" && (
                  <button className="primary" onClick={() => setModal("book")}>
                    <Plus size={18} />
                    New appointment
                  </button>
                )}
                {page === "Session notes" && !isClient && (
                  <button className="primary" onClick={() => setModal("note")}>
                    <Plus size={18} />
                    Write a note
                  </button>
                )}
                {page === "My care" && (
                  <button
                    className="primary"
                    onClick={() =>
                      publicView(user.therapistSlug ?? "dr-mira-sharma")
                    }
                  >
                    <Plus size={18} />
                    Book a session
                  </button>
                )}
              </div>
              {page === "Schedule" && (
                <Schedule
                  sessions={data.sessions}
                  clients={data.clients}
                  selected={typeof selected === "string" ? selected : dayISO()}
                  onSession={(s) => setModal({ type: "session", session: s })}
                  onAvailability={() => setModal("availability")}
                />
              )}
              {page === "Clients" && (
                <Clients
                  data={data}
                  selected={selected}
                  setSelected={setSelected}
                  act={act}
                  onNote={(c) => setModal({ type: "note", client: c })}
                />
              )}
              {page === "Session notes" && (
                <Notes
                  notes={data.notes}
                  name={clientName}
                  isClient={isClient}
                />
              )}
              {page === "Payments" && (
                <Payments
                  data={data}
                  isClient={isClient}
                  name={clientName}
                  act={act}
                  onPay={async (body) => {
                    const p = await act(() =>
                      api("POST", "/payments/order", body),
                    );
                    if (p) setModal({ type: "payment", payment: p });
                  }}
                  onPackage={() => setModal("package")}
                />
              )}
              {page === "Messages" && (
                <Messages user={user} clients={data.clients} fail={fail} />
              )}
              {page === "Analytics" && (
                <Analytics onUpgrade={() => setModal("upgrade")} fail={fail} />
              )}
              {page === "Settings" && (
                <SettingsPage
                  user={user}
                  act={act}
                  onAvailability={() => setModal("availability")}
                  onPlan={() => setModal("upgrade")}
                  onPreview={() => publicView(user.slug)}
                />
              )}
              {page === "My care" && (
                <ClientCare
                  user={user}
                  data={data}
                  onSession={(s) => setModal({ type: "session", session: s })}
                  onNotes={() => navigate("Session notes")}
                  onPay={() => navigate("Payments")}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <Leaf size={14} /> A little less admin. A little more care.
            </span>
            {DEMO ? (
              <a
                href="/Unfazed_Project_Source.zip"
                download
                className="source-link"
              >
                Download project source
              </a>
            ) : (
              <span>unfazed.</span>
            )}
          </footer>
        </main>
      </div>
      {modal && (
        <Modal
          title={
            typeof modal === "object"
              ? ({
                  session: "Appointment details",
                  note: "Write a session note",
                  payment: "Complete payment",
                  invitation: "Client invitation",
                }[modal.type] ?? "Details")
              : ({
                  book: "New appointment",
                  client: "Add a client",
                  note: "Write a session note",
                  availability: "Your availability",
                  upgrade: "A plan for your practice",
                  notifications: "Notifications",
                  account: "Your account",
                  package: "Create a session package",
                  link: "Your booking link",
                }[modal] ?? "Details")
          }
          onClose={() => setModal(null)}
          wide={modal === "upgrade" || modal === "availability"}
        >
          {modal === "book" && (
            <BookForm
              clients={data.clients}
              slug={user.slug}
              busy={busy}
              submit={async (b) => {
                const r = await act(
                  () => api("POST", "/sessions", b),
                  "Appointment confirmed",
                );
                if (r) setModal(null);
              }}
            />
          )}
          {modal === "client" && (
            <ClientForm
              busy={busy}
              submit={async (b) => {
                const r = await act(
                  () => api("POST", "/clients", b),
                  "Client added. Intake consent is still required before booking.",
                );
                if (r)
                  setModal({
                    type: "invitation",
                    token: r.invitationToken,
                    email: r.email,
                  });
              }}
            />
          )}
          {(modal === "note" || modal.type === "note") && (
            <NoteForm
              clients={data.clients}
              defaultClient={modal.client?._id}
              busy={busy}
              submit={async (b) => {
                const r = await act(
                  () => api("POST", "/notes", b),
                  "Note saved",
                );
                if (r) setModal(null);
              }}
            />
          )}
          {modal.type === "session" && (
            <SessionDetail
              session={modal.session}
              name={clientName(modal.session.clientId)}
              isClient={isClient}
              busy={busy}
              update={async (status) => {
                const r = await act(
                  () =>
                    api("PATCH", `/sessions/${modal.session._id}`, { status }),
                  "Appointment updated",
                );
                if (r) setModal(null);
              }}
              onNote={() =>
                setModal({
                  type: "note",
                  client: data.clients.find(
                    (c) => c._id === modal.session.clientId,
                  ),
                })
              }
            />
          )}
          {modal === "availability" && (
            <Availability
              busy={busy}
              submit={async (b) => {
                const r = await act(
                  () => api("PUT", "/availability", b),
                  "Availability updated",
                );
                if (r) setModal(null);
              }}
            />
          )}
          {modal === "upgrade" && (
            <Plans
              current={ent?._id}
              onChoose={async (tier) => {
                const r = await act(
                  () => api("POST", "/subscription/demo", { tier }),
                  DEMO ? "Demo plan changed" : "Plan updated",
                );
                if (r) setModal(null);
              }}
            />
          )}
          {modal === "notifications" && (
            <div className="notification-list">
              <p className="notice">
                Notifications are queued for demonstration. Email and WhatsApp
                delivery are not connected.
              </p>
              {data.notifications
                .slice()
                .reverse()
                .map((n) => (
                  <div key={n._id}>
                    <Bell size={18} />
                    <span>
                      <strong>
                        {n.event
                          .replaceAll(".", " ")
                          .replace(/^./, (x) => x.toUpperCase())}
                      </strong>
                      <small>
                        {pretty(n.createdAt)} · {n.status.replaceAll("_", " ")}
                      </small>
                    </span>
                  </div>
                ))}
              {!data.notifications.length && (
                <Empty
                  title="All caught up"
                  text="Your notifications will appear here."
                />
              )}
            </div>
          )}
          {modal === "account" && (
            <div className="stack">
              <Avatar name={user.name} />
              <h3>{user.name}</h3>
              <p>{user.email}</p>
              {DEMO && (
                <button
                  className="secondary"
                  onClick={() => {
                    setModal(null);
                    switchRole(isClient ? "therapist" : "client");
                  }}
                >
                  Switch to {isClient ? "therapist" : "client"} demo
                </button>
              )}
              <button
                className="danger-button"
                onClick={() => {
                  setToken("");
                  setUser(null);
                  setModal(null);
                }}
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          )}
          {modal === "package" && (
            <PackageForm
              busy={busy}
              submit={async (b) => {
                const r = await act(
                  () => api("POST", "/packages", b),
                  "Package created",
                );
                if (r) setModal(null);
              }}
            />
          )}
          {modal.type === "payment" && (
            <Checkout
              payment={modal.payment}
              busy={busy}
              confirm={async () => {
                const r = await act(
                  () =>
                    api("POST", `/payments/${modal.payment._id}/demo-confirm`),
                  "Demo payment recorded — no money collected",
                );
                if (r) setModal(null);
              }}
              onDone={async () => {
                await refresh();
                setModal(null);
                notify(
                  "Payment submitted. Confirmation arrives through the payment webhook.",
                );
              }}
            />
          )}
          {modal.type === "invitation" && (
            <div className="stack">
              <p>
                Share this one-time invitation with {modal.email} so they can
                complete intake and set a password.
              </p>
              <input
                readOnly
                value={
                  location.origin + "/" + user.slug + "?invite=" + modal.token
                }
                onFocus={(e) => e.target.select()}
              />
              <p className="notice">
                The invitation is shown once. Copy it before closing this
                window.
              </p>
            </div>
          )}
          {modal === "link" && (
            <input
              readOnly
              value={location.origin + "/" + user.slug}
              onFocus={(e) => e.target.select()}
            />
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
        </Modal>
      )}
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
function WeekStrip({ selected, onSelect }) {
  const d = new Date(selected + "T12:00:00");
  const weekday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - weekday);
  return (
    <div className="week-strip">
      {Array.from({ length: 7 }, (_, i) => {
        const day = new Date(d);
        day.setDate(d.getDate() + i);
        const iso = dayISO(day);
        return (
          <button
            key={iso}
            className={
              (selected === iso ? "selected " : "") +
              (iso === dayISO() ? "today" : "")
            }
            onClick={() => onSelect(iso)}
          >
            <span>{day.toLocaleDateString("en", { weekday: "short" })}</span>
            <strong>{day.getDate()}</strong>
            <i />
          </button>
        );
      })}
    </div>
  );
}
function Schedule({ sessions, clients, selected, onSession, onAvailability }) {
  const [date, setDate] = useState(selected),
    [mode, setMode] = useState("day");
  const filtered = sessions
    .filter((s) => mode === "all" || dayISO(new Date(s.start)) === date)
    .sort((a, b) => a.start.localeCompare(b.start));
  return (
    <section className="panel">
      <div className="panel-heading">
        <div className="calendar-controls">
          <button
            className="icon-button"
            aria-label="Previous week"
            onClick={() => {
              const d = new Date(date + "T12:00:00");
              d.setDate(d.getDate() - 7);
              setDate(dayISO(d));
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <h2>{pretty(date + "T12:00:00", { year: "numeric" })}</h2>
          <button
            className="icon-button"
            aria-label="Next week"
            onClick={() => {
              const d = new Date(date + "T12:00:00");
              d.setDate(d.getDate() + 7);
              setDate(dayISO(d));
            }}
          >
            <ChevronRight size={18} />
          </button>
          <button className="small-button" onClick={() => setDate(dayISO())}>
            Today
          </button>
        </div>
        <button className="secondary" onClick={onAvailability}>
          <SlidersHorizontal size={16} />
          Availability
        </button>
      </div>
      <WeekStrip selected={date} onSelect={setDate} />
      <div className="toolbar">
        <div className="tabs">
          <button
            className={mode === "day" ? "active" : ""}
            onClick={() => setMode("day")}
          >
            Selected day
          </button>
          <button
            className={mode === "all" ? "active" : ""}
            onClick={() => setMode("all")}
          >
            All appointments
          </button>
        </div>
        <small>Practice timezone: Asia/Kolkata</small>
      </div>
      <div className="schedule-list">
        {filtered.map((s) => (
          <button
            className="schedule-item"
            key={s._id}
            onClick={() => onSession(s)}
          >
            <div>
              <strong>{time(s.start)}</strong>
              <small>{pretty(s.start)}</small>
            </div>
            <Avatar name={clients.find((c) => c._id === s.clientId)?.name} />
            <span className="flex-grow">
              <strong>
                {clients.find((c) => c._id === s.clientId)?.name ?? "Client"}
              </strong>
              <small>
                {s.duration} min · {s.mode}
              </small>
            </span>
            <Badge value={s.status} />
            <ChevronRight size={18} />
          </button>
        ))}
        {!filtered.length && (
          <Empty
            title="No sessions scheduled"
            text="Choose another day or add a new appointment."
          />
        )}
      </div>
    </section>
  );
}
function Clients({ data, selected, setSelected, act, onNote }) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("name");
  const client =
    selected && typeof selected === "object"
      ? data.clients.find((c) => c._id === selected._id)
      : null;
  const filtered = data.clients
    .filter(
      (c) =>
        (filter === "all" || c.status === filter) &&
        `${c.name} ${c.email} ${c.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.createdAt.localeCompare(a.createdAt),
    );
  if (client)
    return (
      <>
        <button
          className="text-button back-link"
          onClick={() => setSelected(null)}
        >
          <ChevronLeft size={16} />
          All clients
        </button>
        <div className="client-detail">
          <section className="panel client-profile">
            <Avatar name={client.name} />
            <h2>{client.name}</h2>
            <p>{client.email}</p>
            <Badge value={client.status} />
            <div className="tag-list">
              {client.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <hr />
            <h3>Intake & consent</h3>
            <p>{client.intake?.concern ?? "Intake not yet completed."}</p>
            <small>
              {client.consent?.accepted
                ? `Consent recorded on ${pretty(client.consent.at)} · ${client.consent.version}`
                : "Consent pending. Client needs to complete the intake form before booking."}
            </small>
            <button
              className="secondary"
              onClick={() =>
                act(
                  () =>
                    api("PATCH", `/clients/${client._id}`, {
                      status:
                        client.status === "active" ? "inactive" : "active",
                    }),
                  "Client status updated",
                )
              }
            >
              {client.status === "active"
                ? "Mark inactive"
                : "Reactivate client"}
            </button>
          </section>
          <div className="stack">
            <section className="panel">
              <div className="panel-heading">
                <h2>Session history</h2>
                <span className="count">
                  {
                    data.sessions.filter((s) => s.clientId === client._id)
                      .length
                  }
                </span>
              </div>
              {data.sessions
                .filter((s) => s.clientId === client._id)
                .map((s) => (
                  <div className="record-row" key={s._id}>
                    <CalendarDays size={19} />
                    <span>
                      <strong>
                        {pretty(s.start)} · {time(s.start)}
                      </strong>
                      <small>{s.duration} minutes</small>
                    </span>
                    <Badge value={s.status} />
                  </div>
                ))}
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Notes</h2>
                <button className="text-button" onClick={() => onNote(client)}>
                  <Plus size={16} />
                  Write a note
                </button>
              </div>
              {data.notes
                .filter((n) => n.clientId === client._id)
                .map((n) => (
                  <div className="note-preview" key={n._id}>
                    <Badge value={n.type} />
                    <RichBody body={n.body} />
                  </div>
                ))}
              {!data.notes.some((n) => n.clientId === client._id) && (
                <Empty
                  title="A fresh page"
                  text="Add your first session note."
                />
              )}
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Payment history</h2>
              </div>
              {data.payments
                .filter((p) => p.clientId === client._id)
                .slice(-5)
                .map((p) => (
                  <div className="record-row" key={p._id}>
                    <Wallet size={18} />
                    <span>{pretty(p.createdAt)}</span>
                    <strong>{money(p.amountPaise)}</strong>
                    <Badge value={p.status} />
                  </div>
                ))}
            </section>
          </div>
        </div>
      </>
    );
  return (
    <section className="panel">
      <div className="toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search clients"
            placeholder="Search by name, email, or tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filter-controls">
          <select
            aria-label="Filter client status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            aria-label="Sort clients"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name">Name A–Z</option>
            <option value="recent">Newest first</option>
          </select>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>CLIENT</th>
              <th>FOCUS AREA</th>
              <th>LAST SESSION</th>
              <th>STATUS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const last = data.sessions
                .filter(
                  (s) =>
                    s.clientId === c._id && Date.parse(s.start) <= Date.now(),
                )
                .sort((a, b) => b.start.localeCompare(a.start))[0];
              return (
                <tr key={c._id}>
                  <td>
                    <button
                      className="table-person"
                      onClick={() => setSelected(c)}
                    >
                      <Avatar name={c.name} />
                      <span>
                        <strong>{c.name}</strong>
                        <small>{c.email}</small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <div className="tag-list">
                      {c.tags.map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                  </td>
                  <td>{last ? pretty(last.start) : "No sessions yet"}</td>
                  <td>
                    <Badge value={c.status} />
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Open ${c.name}`}
                      onClick={() => setSelected(c)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && (
          <Empty
            title="No clients found"
            text="Try a different search or add a new client."
          />
        )}
      </div>
      <div className="table-footer">
        {filtered.length} {filtered.length === 1 ? "client" : "clients"} · All
        records in your practice
      </div>
    </section>
  );
}
function Notes({ notes, name, isClient }) {
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const rows = notes.filter(
    (n) =>
      (filter === "all" || n.type === filter) &&
      `${n.body} ${name(n.clientId)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="toolbar standalone">
        <div className="tabs">
          {(isClient ? ["all"] : ["all", "private", "shared"]).map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? "All notes"
                : f === "private"
                  ? "Private notes"
                  : "Shared notes"}
            </button>
          ))}
        </div>
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search notes"
            placeholder="Search notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      {!isClient && (
        <p className="privacy-note">
          <ShieldCheck size={16} />
          Private notes are only visible to you. Shared notes appear in the
          client’s portal.
        </p>
      )}
      <div className="notes-grid">
        {rows
          .slice()
          .reverse()
          .map((n) => (
            <article className="panel note-card" key={n._id}>
              <div className="note-top">
                <Avatar name={name(n.clientId)} small />
                <strong>{name(n.clientId)}</strong>
                <Badge value={n.type} />
              </div>
              <div className="note-meta">
                {pretty(n.createdAt)} <span>·</span> {n.format.toUpperCase()}
              </div>
              <RichBody body={n.body} />
              <footer>
                {n.type === "private" ? (
                  <Lock size={14} />
                ) : (
                  <Globe size={14} />
                )}{" "}
                {n.type === "private"
                  ? "Only you can see this"
                  : "Shared with client"}
              </footer>
            </article>
          ))}
      </div>
      {!rows.length && (
        <section className="panel">
          <Empty
            title="Room for reflection"
            text={
              isClient
                ? "Your therapist’s shared notes will appear here."
                : "Write a note after your next session."
            }
          />
        </section>
      )}
    </>
  );
}
function Payments({ data, isClient, name, act, onPay, onPackage }) {
  const [tab, setTab] = useState("history");
  const outstanding = data.sessions.filter(
    (s) => s.paymentStatus === "pending" && s.status === "confirmed",
  );
  return (
    <>
      <div className="stats-grid three">
        <section className="stat-card">
          <span>{isClient ? "Your payments" : "Total collected"}</span>
          <strong>
            {money(
              data.payments
                .filter((p) => p.status === "paid")
                .reduce((sum, p) => sum + p.amountPaise, 0),
            )}
          </strong>
          <small>Successfully recorded payments</small>
        </section>
        <section className="stat-card">
          <span>Outstanding</span>
          <strong>
            {money(outstanding.reduce((sum, s) => sum + s.amountPaise, 0))}
          </strong>
          <small>{outstanding.length} unpaid sessions</small>
        </section>
        <section className="stat-card">
          <span>{isClient ? "Package credits" : "Paid transactions"}</span>
          <strong>
            {isClient
              ? data.credits
                  .filter((p) => Date.parse(p.expiresAt) > Date.now())
                  .reduce((sum, p) => sum + p.remaining, 0)
              : data.payments.filter((p) => p.status === "paid").length}
          </strong>
          <small>
            {isClient
              ? "Available across valid packages"
              : "Receipts ready to download"}
          </small>
        </section>
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="tabs">
            {[
              ["history", "Payment history"],
              ["outstanding", "Outstanding"],
              ["packages", "Packages"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "packages" && !isClient && (
            <button className="secondary" onClick={onPackage}>
              <Plus size={16} />
              New package
            </button>
          )}
        </div>
        {tab === "history" && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{isClient ? "RECEIPT" : "CLIENT"}</th>
                  <th>DATE</th>
                  <th>AMOUNT</th>
                  <th>STATUS</th>
                  <th>INVOICE</th>
                </tr>
              </thead>
              <tbody>
                {data.payments
                  .slice()
                  .reverse()
                  .map((p) => (
                    <tr key={p._id}>
                      <td>
                        <strong>
                          {isClient ? p.receipt : name(p.clientId)}
                        </strong>
                        <small className="block muted">
                          {p.packageId
                            ? "Session package"
                            : "Individual session"}
                          {p.provider === "demo" ? " · Demo" : ""}
                        </small>
                      </td>
                      <td>{pretty(p.createdAt)}</td>
                      <td>{money(p.amountPaise)}</td>
                      <td>
                        <Badge value={p.status} />
                      </td>
                      <td>
                        {p.status === "paid" ? (
                          <button
                            className="text-button"
                            onClick={() =>
                              act(
                                () => downloadInvoice(p),
                                "Invoice downloaded",
                              )
                            }
                          >
                            <Download size={15} />
                            PDF
                          </button>
                        ) : (
                          <span className="muted">Awaiting payment</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!data.payments.length && (
              <Empty
                title="No payments yet"
                text="Your payment records will appear here."
              />
            )}
          </div>
        )}
        {tab === "outstanding" && (
          <div>
            {outstanding.map((s) => (
              <div className="record-row" key={s._id}>
                <CalendarDays size={20} />
                <span className="flex-grow">
                  <strong>
                    {isClient ? "Therapy session" : name(s.clientId)}
                  </strong>
                  <small>
                    {pretty(s.start)} · {time(s.start)}
                  </small>
                </span>
                <strong>{money(s.amountPaise)}</strong>
                {isClient ? (
                  <button
                    className="primary"
                    onClick={() => onPay({ sessionId: s._id })}
                  >
                    Pay for session
                  </button>
                ) : (
                  <Badge value="pending" />
                )}
              </div>
            ))}
            {!outstanding.length && (
              <Empty
                title="All settled"
                text="There are no outstanding session payments."
              />
            )}
          </div>
        )}
        {tab === "packages" && (
          <div className="packages-grid">
            {data.packages.map((p) => (
              <article key={p._id} className="package-card">
                <Heart size={22} />
                <h3>{p.name}</h3>
                <strong>{money(p.amountPaise)}</strong>
                <p>
                  {p.count} sessions · Valid for {p.expiryDays} days
                </p>
                {isClient && (
                  <button
                    className="secondary"
                    onClick={() => onPay({ packageId: p._id })}
                  >
                    Buy package
                  </button>
                )}
              </article>
            ))}
            {!data.packages.length && (
              <Empty
                title="No packages available"
                text="Packages are available on eligible practice plans."
              />
            )}
          </div>
        )}
      </section>
    </>
  );
}
function Messages({ user, clients, fail }) {
  const [clientId, setClientId] = useState(
      user.role === "client" ? user._id : (clients[0]?._id ?? ""),
    ),
    [messages, setMessages] = useState([]),
    [body, setBody] = useState(""),
    [sending, setSending] = useState(false);
  const load = () =>
    clientId &&
    api("GET", `/messages?clientId=${clientId}`).then(setMessages).catch(fail);
  useEffect(() => {
    load();
    if (DEMO) return;
    const socket = io(BASE.replace(/\/api\/?$/, ""), {
      auth: { token: getToken() },
    });
    socket.on("connect", () => socket.emit("join", { clientId }));
    socket.on("message", (msg) =>
      setMessages((old) =>
        old.some((m) => m._id === msg._id) ? old : [...old, msg],
      ),
    );
    return () => socket.disconnect();
  }, [clientId]);
  async function send(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      const msg = await api("POST", "/messages", { clientId, body });
      setMessages((old) =>
        old.some((m) => m._id === msg._id) ? old : [...old, msg],
      );
      setBody("");
    } catch (e) {
      fail(e);
    } finally {
      setSending(false);
    }
  }
  return (
    <section className="panel chat-panel">
      {user.role === "therapist" && (
        <aside className="chat-clients">
          <h3>Conversations</h3>
          {clients.map((c) => (
            <button
              key={c._id}
              className={c._id === clientId ? "active" : ""}
              onClick={() => setClientId(c._id)}
            >
              <Avatar name={c.name} small />
              <span>{c.name}</span>
            </button>
          ))}
        </aside>
      )}
      <div className="chat-main">
        <header>
          <Avatar
            name={
              user.role === "client"
                ? "Your therapist"
                : clients.find((c) => c._id === clientId)?.name
            }
            small
          />
          <div>
            <strong>
              {user.role === "client"
                ? "Your therapist"
                : (clients.find((c) => c._id === clientId)?.name ??
                  "Choose a client")}
            </strong>
            <small>
              {DEMO
                ? "Demo conversation · Switch roles to reply"
                : "Private practice messaging"}
            </small>
          </div>
        </header>
        <div className="chat-messages">
          <p className="chat-disclaimer">
            For scheduling and session follow-ups. This is not an emergency
            support channel.
          </p>
          {messages.map((m) => (
            <div
              className={"message " + (m.senderRole === user.role ? "own" : "")}
              key={m._id}
            >
              <p>{m.body}</p>
              <small>{time(m.createdAt)}</small>
            </div>
          ))}
          {!messages.length && (
            <Empty
              title="Start a conversation"
              text="Send a message to get things started."
            />
          )}
        </div>
        <form className="chat-compose" onSubmit={send}>
          <input
            aria-label="Message"
            placeholder="Write a thoughtful message…"
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            disabled={!clientId}
          />
          <button
            className="primary"
            disabled={sending || !clientId || !body.trim()}
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </section>
  );
}
function Analytics({ onUpgrade, fail }) {
  const [stats, setStats] = useState(null),
    [locked, setLocked] = useState(false);
  useEffect(() => {
    api("GET", "/analytics")
      .then(setStats)
      .catch((e) =>
        e.code === "UPGRADE_REQUIRED" ? setLocked(true) : fail(e),
      );
  }, []);
  if (locked)
    return (
      <section className="panel">
        <Empty
          title="A deeper view of your practice"
          text="Revenue trends and practice analytics are included in Growth and Practice."
          action={
            <button className="primary" onClick={onUpgrade}>
              Explore plans
            </button>
          }
        />
      </section>
    );
  if (!stats) return <p>Loading practice insights…</p>;
  const max = Math.max(...stats.revenue.map((r) => r.amountPaise), 1);
  return (
    <>
      <div className="stats-grid three">
        {[
          [
            "Total revenue",
            money(stats.totalRevenue),
            "Recorded paid transactions",
          ],
          [
            "Active clients",
            stats.activeClients,
            "People currently in your care",
          ],
          [
            "No-show rate",
            `${stats.noShowRate}%`,
            "Of completed and missed sessions",
          ],
        ].map(([label, value, detail]) => (
          <section className="stat-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </section>
        ))}
      </div>
      <section className="panel chart-panel">
        <div className="panel-heading">
          <div>
            <h2>Revenue over time</h2>
            <p>Monthly collected payments · INR</p>
          </div>
          <span className="legend">
            <i /> Revenue
          </span>
        </div>
        <div
          className="bar-chart"
          role="img"
          aria-label={stats.revenue
            .map((r) => `${r._id}: ${money(r.amountPaise)}`)
            .join(", ")}
        >
          {stats.revenue.slice(-12).map((r) => (
            <div className="bar-column" key={r._id}>
              <strong>{money(r.amountPaise)}</strong>
              <div className="bar-space">
                <div
                  className="bar"
                  style={{
                    height: `${Math.max(2, (r.amountPaise / max) * 100)}%`,
                  }}
                />
              </div>
              <span>
                {pretty(r._id + "-15", {
                  month: "short",
                  year: "2-digit",
                  day: undefined,
                })}
              </span>
            </div>
          ))}
        </div>
        {!stats.revenue.length && (
          <Empty
            title="Your story is just beginning"
            text="Revenue trends appear after your first recorded payment."
          />
        )}
      </section>
    </>
  );
}
function SettingsPage({ user, act, onAvailability, onPlan, onPreview }) {
  const [form, setForm] = useState({
    ...user,
    specializations: user.specializations.join(", "),
    languages: user.languages.join(", "),
  });
  return (
    <div className="settings-grid">
      <form
        className="panel settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          await act(
            () =>
              api("PATCH", "/profile", {
                name: form.name,
                bio: form.bio,
                slug: form.slug,
                specializations: form.specializations
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                languages: form.languages
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }),
            "Profile saved",
          );
        }}
      >
        <div className="panel-heading">
          <h2>Your public profile</h2>
          <button type="button" className="text-button" onClick={onPreview}>
            Preview <ExternalLink size={15} />
          </button>
        </div>
        <div className="form-content">
          {[
            ["name", "Full name"],
            ["slug", "Branded link"],
            ["specializations", "Specializations (comma-separated)"],
            ["languages", "Languages (comma-separated)"],
          ].map(([key, label]) => (
            <Field
              key={key}
              label={label}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              required={key === "name" || key === "slug"}
            />
          ))}
          <Field label="About you">
            <textarea
              rows={5}
              value={form.bio}
              maxLength={5000}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </Field>
          <button className="primary">Save profile</button>
        </div>
      </form>
      <div className="stack">
        <section className="panel settings-short">
          <CalendarDays />
          <h3>Your working rhythm</h3>
          <p>Set weekly hours, session length, buffers, and date overrides.</p>
          <button className="secondary" onClick={onAvailability}>
            Edit availability
          </button>
        </section>
        <section className="panel settings-short">
          <Heart />
          <h3>Room to grow</h3>
          <p>Choose the client capacity and features that fit your practice.</p>
          <button className="secondary" onClick={onPlan}>
            Manage plan
          </button>
        </section>
        <section className="notice">
          <ShieldCheck size={20} />
          <p>
            {DEMO
              ? "This demo uses fictional records and resets when the page reloads."
              : "Your client portal only receives notes explicitly marked shared."}
          </p>
        </section>
      </div>
    </div>
  );
}
function ClientCare({ user, data, onSession, onNotes, onPay }) {
  const sessions = data.sessions
    .filter((s) => s.status === "confirmed")
    .sort((a, b) => a.start.localeCompare(b.start));
  return (
    <div className="overview-grid">
      <section className="panel">
        <div className="panel-heading">
          <h2>Your upcoming sessions</h2>
        </div>
        {sessions.map((s) => (
          <button
            className="schedule-item"
            key={s._id}
            onClick={() => onSession(s)}
          >
            <CalendarDays size={25} />
            <span className="flex-grow">
              <strong>
                {pretty(s.start, { weekday: "short" })} · {time(s.start)}
              </strong>
              <small>{s.duration} minutes · Video consultation · IST</small>
            </span>
            <Badge value={s.paymentStatus} />
            <ChevronRight size={18} />
          </button>
        ))}
        {!sessions.length && (
          <Empty
            title="Your next step starts here"
            text="Book a session when you’re ready."
          />
        )}
      </section>
      <div className="stack">
        <section className="care-card">
          <Leaf size={28} />
          <h2>
            A little space
            <br />
            for yourself.
          </h2>
          <span>
            Your therapist’s reflections and resources, ready when you need
            them.
          </span>
          <button onClick={onNotes}>
            Read shared notes <FileText size={16} />
          </button>
        </section>
        <button className="panel portal-payment" onClick={onPay}>
          <Wallet size={22} />
          <span>
            <strong>Payments & packages</strong>
            <small>Manage your session payments</small>
          </span>
          <ChevronRight size={19} />
        </button>
      </div>
    </div>
  );
}
function BookForm({ clients, slug, busy, submit }) {
  const [clientId, setClient] = useState(
      clients.find((c) => c.status === "active" && c.consent?.accepted)?._id ??
        "",
    ),
    [date, setDate] = useState(nextDate()),
    [slots, setSlots] = useState([]),
    [start, setStart] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    setStart("");
    api("GET", `/public/${slug}/slots?date=${date}`)
      .then(setSlots)
      .catch((e) => setError(e.message));
  }, [date, slug]);
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        submit({ clientId, start });
      }}
    >
      <Field label="Client">
        <select
          required
          value={clientId}
          onChange={(e) => setClient(e.target.value)}
        >
          <option value="">Choose a client</option>
          {clients
            .filter((c) => c.status === "active")
            .map((c) => (
              <option key={c._id} value={c._id} disabled={!c.consent?.accepted}>
                {c.name}
                {!c.consent?.accepted ? " · Intake pending" : ""}
              </option>
            ))}
        </select>
      </Field>
      <Field
        label="Appointment date"
        type="date"
        min={dayISO()}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
      />
      <div>
        <label className="field-label">Available times · IST</label>
        <div className="slot-grid">
          {slots.map((s) => (
            <button
              key={s.start}
              type="button"
              className={start === s.start ? "chosen" : ""}
              onClick={() => setStart(s.start)}
            >
              {time(s.start)}
            </button>
          ))}
        </div>
        {!slots.length && (
          <p className="muted">
            No slots for this date. Choose another day or update your
            availability.
          </p>
        )}
      </div>
      {error && <p className="inline-error">{error}</p>}
      <p className="privacy-note">
        <ShieldCheck size={16} />
        Only clients with recorded intake consent can be booked.
      </p>
      <button className="primary" disabled={busy || !start || !clientId}>
        {busy ? "Confirming…" : "Confirm appointment"}
      </button>
    </form>
  );
}
function ClientForm({ busy, submit }) {
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.currentTarget));
        submit({
          ...d,
          tags: d.tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        });
      }}
    >
      <Field
        label="Full name"
        name="name"
        required
        maxLength={100}
        placeholder="e.g. Aarav Mehta"
      />
      <Field
        label="Email address"
        name="email"
        type="email"
        required
        placeholder="client@example.com"
      />
      <Field
        label="Tags (comma-separated)"
        name="tags"
        placeholder="Anxiety, New client"
      />
      <p className="notice">
        Client consent is recorded through the client intake flow, never assumed
        by adding a record.
      </p>
      <button className="primary" disabled={busy}>
        {busy ? "Adding…" : "Add client"}
      </button>
    </form>
  );
}
function RichBody({ body }) {
  if (!/<[a-z][\s\S]*>/i.test(body ?? ""))
    return <p style={{ whiteSpace: "pre-wrap" }}>{body}</p>;
  const doc = new DOMParser().parseFromString(body, "text/html");
  const allowed = {
    P: "p",
    DIV: "div",
    B: "strong",
    STRONG: "strong",
    I: "em",
    EM: "em",
    UL: "ul",
    OL: "ol",
    LI: "li",
    BR: "br",
    H3: "h3",
  };
  const node = (n, i) => {
    if (n.nodeType === 3) return n.textContent;
    if (["SCRIPT", "STYLE", "IFRAME", "OBJECT"].includes(n.tagName))
      return null;
    const kids = [...n.childNodes].map(node);
    return React.createElement(
      allowed[n.tagName] ?? "span",
      { key: i },
      n.tagName === "BR" ? undefined : kids,
    );
  };
  return <div className="rich-body">{[...doc.body.childNodes].map(node)}</div>;
}
function RichEditor({ onChange }) {
  const editor = useRef(null);
  const command = (name) => {
    editor.current?.focus();
    document.execCommand(name, false);
    onChange(editor.current.innerHTML);
  };
  return (
    <div className="rich-editor">
      <div className="editor-tools">
        <button
          type="button"
          aria-label="Bold text"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command("bold")}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          aria-label="Italic text"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command("italic")}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          aria-label="Bullet list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command("insertUnorderedList")}
        >
          List
        </button>
      </div>
      <div
        ref={editor}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Session note"
        aria-multiline="true"
        data-placeholder="What stood out in this session?"
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand(
            "insertText",
            false,
            e.clipboardData.getData("text/plain"),
          );
          onChange(editor.current.innerHTML);
        }}
      />
    </div>
  );
}
function NoteForm({ clients, defaultClient, busy, submit }) {
  const [format, setFormat] = useState("freeform"),
    [rich, setRich] = useState("");
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.currentTarget));
        let body = rich;
        if (format === "soap")
          body = ["Subjective", "Objective", "Assessment", "Plan"]
            .map((k) => `${k}: ${d[k]}`)
            .join("\n\n");
        if (format === "dap")
          body = ["Data", "Assessment", "Plan"]
            .map((k) => `${k}: ${d[k]}`)
            .join("\n\n");
        submit({ clientId: d.clientId, type: d.type, format, body });
      }}
    >
      <Field label="Client">
        <select name="clientId" defaultValue={defaultClient ?? ""} required>
          <option value="">Choose a client</option>
          {clients.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-row">
        <Field label="Visibility">
          <select name="type" defaultValue="private">
            <option value="private">Private — only you</option>
            <option value="shared">Shared — client can read</option>
          </select>
        </Field>
        <Field label="Note format">
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="freeform">Freeform</option>
            <option value="soap">SOAP · Growth+</option>
            <option value="dap">DAP · Growth+</option>
          </select>
        </Field>
      </div>
      {format === "freeform" ? (
        <Field label="Session note">
          <RichEditor onChange={setRich} />
        </Field>
      ) : (
        (format === "soap"
          ? ["Subjective", "Objective", "Assessment", "Plan"]
          : ["Data", "Assessment", "Plan"]
        ).map((f) => (
          <Field key={f} label={f}>
            <textarea name={f} rows={2} maxLength={4000} required />
          </Field>
        ))
      )}
      <p className="privacy-note">
        <Lock size={15} />
        Choose “Shared” only for content you intend the client to read.
      </p>
      <button
        className="primary"
        disabled={
          busy ||
          (format === "freeform" && !rich.replace(/<[^>]*>/g, "").trim())
        }
      >
        {busy ? "Saving…" : "Save note"}
      </button>
    </form>
  );
}
function SessionDetail({ session: s, name, isClient, busy, update, onNote }) {
  return (
    <div className="stack">
      <div className="session-summary">
        <Avatar name={name} />
        <div>
          <h3>{name}</h3>
          <p>{pretty(s.start, { weekday: "long", year: "numeric" })}</p>
        </div>
        <Badge value={s.status} />
      </div>
      <div className="detail-grid">
        <div>
          <Clock size={18} />
          <span>
            {time(s.start)} – {time(s.end)} IST
          </span>
        </div>
        <div>
          <Video size={18} />
          <span>{s.mode}</span>
        </div>
        <div>
          <Wallet size={18} />
          <span>
            {money(s.amountPaise)} · {s.paymentStatus}
          </span>
        </div>
      </div>
      <p className="notice">
        Video meeting links are not connected in this version.
      </p>
      {s.status === "confirmed" && (
        <>
          <div className="form-row">
            {!isClient && (
              <>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => update("completed")}
                >
                  <Check size={16} />
                  Mark completed
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => update("no-show")}
                >
                  Mark no-show
                </button>
              </>
            )}
          </div>
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Cancel this appointment? Any paid amount needs a separate refund review.",
                )
              )
                update("cancelled");
            }}
          >
            Cancel appointment
          </button>
        </>
      )}
      {!isClient && (
        <button className="secondary" onClick={onNote}>
          <FileText size={16} />
          Write a session note
        </button>
      )}
    </div>
  );
}
function Availability({ busy, submit }) {
  const [a, setA] = useState(null),
    [error, setError] = useState(""),
    [overrideDate, setOverrideDate] = useState(""),
    [off, setOff] = useState(true),
    [range, setRange] = useState(["09:00", "17:00"]);
  useEffect(() => {
    api("GET", "/availability")
      .then(setA)
      .catch((e) => setError(e.message));
  }, []);
  if (!a) return <p>{error || "Loading availability…"}</p>;
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        submit(a);
      }}
    >
      <div className="form-row">
        <Field label="Session length">
          <select
            value={a.duration}
            onChange={(e) => setA({ ...a, duration: Number(e.target.value) })}
          >
            {[30, 45, 60, 90].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </Field>
        <Field label="Buffer between sessions">
          <select
            value={a.buffer}
            onChange={(e) => setA({ ...a, buffer: Number(e.target.value) })}
          >
            {[0, 5, 10, 15, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="Practice timezone"
        value={a.timezone}
        onChange={(e) => setA({ ...a, timezone: e.target.value })}
      />
      <div className="availability-days">
        {days.map((day, i) => {
          const hours = a.weekly[i + 1];
          return (
            <div key={day}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(hours?.length)}
                  onChange={(e) =>
                    setA({
                      ...a,
                      weekly: {
                        ...a.weekly,
                        [i + 1]: e.target.checked ? ["09:00", "17:00"] : [],
                      },
                    })
                  }
                />
                {day}
              </label>
              {hours?.length ? (
                <>
                  <input
                    aria-label={`${day} start`}
                    type="time"
                    required
                    value={hours[0]}
                    onChange={(e) =>
                      setA({
                        ...a,
                        weekly: {
                          ...a.weekly,
                          [i + 1]: [e.target.value, hours[1]],
                        },
                      })
                    }
                  />
                  <span>to</span>
                  <input
                    aria-label={`${day} end`}
                    type="time"
                    required
                    value={hours[1]}
                    onChange={(e) =>
                      setA({
                        ...a,
                        weekly: {
                          ...a.weekly,
                          [i + 1]: [hours[0], e.target.value],
                        },
                      })
                    }
                  />
                </>
              ) : (
                <small>Unavailable</small>
              )}
            </div>
          );
        })}
      </div>
      <h3>Date overrides</h3>
      <p className="muted">Close a day or replace your usual hours.</p>
      <div className="form-row">
        <input
          aria-label="Override date"
          type="date"
          value={overrideDate}
          onChange={(e) => setOverrideDate(e.target.value)}
        />
        <label className="check-label">
          <input
            type="checkbox"
            checked={off}
            onChange={(e) => setOff(e.target.checked)}
          />
          Day off
        </label>
      </div>
      {!off && (
        <div className="form-row">
          <input
            aria-label="Override start time"
            type="time"
            value={range[0]}
            onChange={(e) => setRange([e.target.value, range[1]])}
          />
          <input
            aria-label="Override end time"
            type="time"
            value={range[1]}
            onChange={(e) => setRange([range[0], e.target.value])}
          />
        </div>
      )}
      <button
        type="button"
        className="secondary"
        disabled={!overrideDate}
        onClick={() => {
          setA({
            ...a,
            overrides: { ...a.overrides, [overrideDate]: off ? [] : range },
          });
          setOverrideDate("");
        }}
      >
        Add override
      </button>
      {Object.entries(a.overrides).map(([date, hours]) => (
        <div className="override" key={date}>
          <span>
            {date} · {hours.length ? hours.join(" – ") : "Day off"}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove override ${date}`}
            onClick={() => {
              const overrides = { ...a.overrides };
              delete overrides[date];
              setA({ ...a, overrides });
            }}
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <button className="primary" disabled={busy}>
        {busy ? "Saving…" : "Save availability"}
      </button>
    </form>
  );
}
function Plans({ current, onChoose }) {
  const [plans, setPlans] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    api("GET", "/plans")
      .then(setPlans)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <p className="muted">
        {DEMO
          ? "Switch plans to explore feature access. No subscription charge is made."
          : "Plan prices are configurable. Subscription payment processing must be connected before upgrading."}
      </p>
      <div className="plans-grid">
        {plans.map((p) => (
          <article
            className={"plan-card " + (p._id === current ? "current" : "")}
            key={p._id}
          >
            <span className="plan-name">{p.name}</span>
            <h3>
              {money(p.monthlyPaise)}
              <small>/ month</small>
            </h3>
            <p>For your next chapter of care.</p>
            <ul>
              <li>
                <Check size={15} />
                {p.activeClientCap} active clients
              </li>
              <li>
                <Check size={15} />
                Scheduling & private notes
              </li>
              <li>
                <Check size={15} />
                Client portal & messaging
              </li>
              <li className={!p.features.soap ? "muted" : ""}>
                {p.features.soap ? <Check size={15} /> : <Lock size={15} />}SOAP
                & DAP templates
              </li>
              <li className={!p.features.advancedAnalytics ? "muted" : ""}>
                {p.features.advancedAnalytics ? (
                  <Check size={15} />
                ) : (
                  <Lock size={15} />
                )}
                Practice analytics
              </li>
              <li className={!p.features.packages ? "muted" : ""}>
                {p.features.packages ? <Check size={15} /> : <Lock size={15} />}
                Session packages
              </li>
            </ul>
            <button
              className={p._id === current ? "secondary" : "primary"}
              disabled={p._id === current}
              onClick={() => onChoose(p._id)}
            >
              {p._id === current
                ? "Current plan"
                : DEMO
                  ? "Try in demo"
                  : "Request upgrade"}
            </button>
          </article>
        ))}
      </div>
      {error && <p className="inline-error">{error}</p>}
    </>
  );
}
function PackageForm({ busy, submit }) {
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget));
        submit({ ...f, count: Number(f.count) });
      }}
    >
      <Field label="Package name" name="name" required maxLength={100} />
      <Field label="Number of sessions">
        <select name="count">
          {[3, 6, 12].map((n) => (
            <option key={n} value={n}>
              {n} sessions
            </option>
          ))}
        </select>
      </Field>
      <p className="notice">
        Price and expiry are calculated from your plan configuration.
      </p>
      <button className="primary" disabled={busy}>
        Create package
      </button>
    </form>
  );
}
function Checkout({ payment: p, busy, confirm, onDone }) {
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  async function razorpay() {
    setLoading(true);
    try {
      if (!window.Razorpay)
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = resolve;
          script.onerror = () =>
            reject(Error("Could not load payment checkout"));
          document.head.appendChild(script);
        });
      const checkout = new window.Razorpay({
        key: p.key,
        order_id: p.gatewayOrderId,
        amount: p.amountPaise,
        currency: "INR",
        name: "Unfazed",
        description: "Therapy session payment",
        handler: () => onDone(),
        modal: { ondismiss: () => setLoading(false) },
      });
      checkout.on("payment.failed", (r) => {
        setError(r.error?.description ?? "Payment failed");
        setLoading(false);
      });
      checkout.open();
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }
  return (
    <div className="stack checkout">
      <CreditCard size={32} />
      <h3>{money(p.amountPaise)}</h3>
      <p>
        {p.provider === "demo"
          ? "Simulated checkout. No card details required and no money will be collected."
          : "Complete payment securely through Razorpay. Confirmation is received by the server webhook."}
      </p>
      <button
        className="primary"
        disabled={busy || loading}
        onClick={p.provider === "demo" ? confirm : razorpay}
      >
        {busy || loading
          ? "Processing…"
          : p.provider === "demo"
            ? "Simulate successful payment"
            : "Open Razorpay checkout"}
      </button>
      {error && <p className="inline-error">{error}</p>}
    </div>
  );
}
function Auth({ onLogin, clientSlug }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="auth-screen">
      <div className="auth-art">
        <div className="brand">
          unfazed<span>.</span>
        </div>
        <Leaf size={48} />
        <h1>
          A little less admin.
          <br />A little more care.
        </h1>
        <p>A thoughtful home for your practice and the people in it.</p>
        <small>Practice management, with people at the centre.</small>
      </div>
      <form
        className="auth-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = Object.fromEntries(new FormData(e.currentTarget));
          try {
            await onLogin(
              await api("POST", register ? "/auth/register" : "/auth/login", {
                ...f,
                role: clientSlug ? "client" : "therapist",
                slug: clientSlug,
              }),
            );
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="eyebrow">
          {clientSlug ? "YOUR CARE SPACE" : "YOUR PRACTICE, TOGETHER"}
        </p>
        <h1>{register ? "Make yourself at home." : "Welcome back."}</h1>
        <p>
          {DEMO
            ? "Explore the demo using the button below."
            : "Sign in to continue to your workspace."}
        </p>
        {register && <Field label="Full name" name="name" required />}
        <Field
          label="Email address"
          name="email"
          type="email"
          required
          defaultValue={DEMO ? "mira@example.com" : ""}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          required
          minLength={register ? 10 : 1}
          defaultValue={DEMO ? "UnfazedDemo2026!" : ""}
        />
        {error && <p className="inline-error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy
            ? "Opening your space…"
            : DEMO
              ? "Explore therapist demo"
              : register
                ? "Create your practice"
                : "Sign in"}
        </button>
        {!clientSlug && !DEMO && (
          <button
            type="button"
            className="text-button"
            onClick={() => setRegister(!register)}
          >
            {register
              ? "Already registered? Sign in"
              : "New here? Create an account"}
          </button>
        )}
      </form>
    </div>
  );
}
function BookingPage({ slug, user, onAuth, onPortal, notify }) {
  const [profile, setProfile] = useState(null),
    [date, setDate] = useState(nextDate()),
    [slots, setSlots] = useState([]),
    [start, setStart] = useState(""),
    [step, setStep] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [booking, setBooking] = useState(null),
    [signIn, setSignIn] = useState(false),
    [zone, setZone] = useState(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    [payment, setPayment] = useState(null),
    [credits, setCredits] = useState([]),
    [credit, setCredit] = useState("");
  useEffect(() => {
    api("GET", `/public/${slug}`)
      .then(setProfile)
      .catch((e) => setError(e.message));
  }, [slug]);
  useEffect(() => {
    setStart("");
    api("GET", `/public/${slug}/slots?date=${date}`)
      .then(setSlots)
      .catch((e) => setError(e.message));
  }, [date, slug]);
  useEffect(() => {
    if (user?.role === "client")
      api("GET", "/client-packages")
        .then(setCredits)
        .catch(() => {});
  }, [user?.role]);
  const isClient =
    user?.role === "client" && user.therapistId === profile?.therapist._id;
  async function book() {
    setBusy(true);
    setError("");
    try {
      const s = await api("POST", "/sessions", {
        start,
        clientPackageId: credit || undefined,
      });
      setBooking(s);
      setStep(3);
      notify("Your session is confirmed");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!profile)
    return (
      <div className="loading">
        <div className="brand">unfazed.</div>
        <p>{error || "Opening the practice…"}</p>
        <button className="secondary" onClick={onPortal}>
          Back to workspace
        </button>
      </div>
    );
  const t = profile.therapist;
  return (
    <div className="booking-page">
      <header className="booking-header">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onPortal();
          }}
        >
          unfazed<span>.</span>
        </a>
        <button className="text-button" onClick={onPortal}>
          {user ? "Back to workspace" : "Therapist sign in"}{" "}
          <ExternalLink size={16} />
        </button>
      </header>
      {DEMO && (
        <div className="public-demo">
          Demo practice · Fictional therapist · No clinical service or real
          payment
        </div>
      )}
      <div className="booking-layout">
        <section className="therapist-profile">
          <div className="therapist-avatar">{initials(t.name)}</div>
          <p className="eyebrow">A SPACE TO BE YOURSELF</p>
          <h1>{t.name}</h1>
          <p className="therapist-bio">
            {t.bio ||
              "Welcome to my practice. Book a session below to get started."}
          </p>
          <div className="tag-list">
            {t.specializations.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
          <div className="profile-facts">
            <p>
              <MessageCircle size={18} />
              {t.languages.join(", ")}
            </p>
            <p>
              <Video size={18} />
              Online consultation
            </p>
            <p>
              <Globe size={18} />
              {t.timezone}
            </p>
          </div>
          <div className="gentle-note">
            <Leaf size={24} />
            <p>
              You don’t need to have it all figured out.
              <br />
              We can start where you are.
            </p>
          </div>
        </section>
        <section className="panel booking-card">
          <div className="steps">
            {["Choose a time", "Your details", "Confirmation"].map(
              (label, i) => (
                <span className={step >= i + 1 ? "active" : ""} key={label}>
                  <b>{step > i + 1 ? <Check size={12} /> : i + 1}</b>
                  {label}
                </span>
              ),
            )}
          </div>
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          {step === 1 && (
            <>
              <h2>Make some time for you.</h2>
              <p>
                Individual therapy · {money(profile.pricePaise)} per session
              </p>
              <Field
                label="Choose a date"
                type="date"
                min={dayISO()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <Field label="Show times in">
                <select value={zone} onChange={(e) => setZone(e.target.value)}>
                  {Array.from(
                    new Set([
                      zone,
                      "Asia/Kolkata",
                      "Europe/London",
                      "America/New_York",
                      "Asia/Dubai",
                      "UTC",
                    ]),
                  ).map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </Field>
              <label className="field-label">Available appointments</label>
              <div className="slot-grid">
                {slots.map((s) => (
                  <button
                    className={start === s.start ? "chosen" : ""}
                    key={s.start}
                    onClick={() => setStart(s.start)}
                  >
                    {time(s.start, zone)}
                  </button>
                ))}
              </div>
              {!slots.length && (
                <div className="notice">
                  No appointments available on this day. Please choose another
                  date.
                </div>
              )}
              {start && (
                <p className="muted">
                  {slots.find((s) => s.start === start)?.duration} minutes ·{" "}
                  {pretty(start)} · {time(start, zone)} ({zone})
                </p>
              )}
              <button
                className="primary full"
                disabled={!start}
                onClick={() => setStep(2)}
              >
                Continue
              </button>
              <p className="privacy-note">
                <Lock size={14} />
                Your information stays within this practice.
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <button className="text-button" onClick={() => setStep(1)}>
                <ChevronLeft size={16} />
                Change time
              </button>
              <h2>
                {isClient ? "You’re almost there." : "Let’s get to know you."}
              </h2>
              <p>
                {pretty(start, { weekday: "long" })} at {time(start, zone)} ·{" "}
                {zone}
              </p>
              {isClient ? (
                <div className="stack">
                  <p>
                    Booking for <strong>{user.name}</strong>
                  </p>
                  <Field label="Payment option">
                    <select
                      value={credit}
                      onChange={(e) => setCredit(e.target.value)}
                    >
                      <option value="">
                        Pay per session · {money(profile.pricePaise)}
                      </option>
                      {credits
                        .filter(
                          (c) =>
                            c.remaining > 0 &&
                            Date.parse(c.expiresAt) > Date.now(),
                        )
                        .map((c) => (
                          <option value={c._id} key={c._id}>
                            Use package · {c.remaining} credits left
                          </option>
                        ))}
                    </select>
                  </Field>
                  <button className="primary" disabled={busy} onClick={book}>
                    {busy ? "Confirming…" : "Confirm booking"}
                  </button>
                </div>
              ) : (
                <form
                  className="stack"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = Object.fromEntries(new FormData(e.currentTarget));
                    setError("");
                    setBusy(true);
                    try {
                      const r = await api(
                        "POST",
                        signIn ? "/auth/login" : `/public/${slug}/intake`,
                        {
                          ...f,
                          role: "client",
                          slug,
                          consent: f.consent === "on",
                          invitationToken: new URLSearchParams(
                            location.search,
                          ).get("invite"),
                        },
                      );
                      await onAuth(r);
                    } catch (e) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <div className="tabs">
                    <button
                      type="button"
                      className={!signIn ? "active" : ""}
                      onClick={() => setSignIn(false)}
                    >
                      New client
                    </button>
                    <button
                      type="button"
                      className={signIn ? "active" : ""}
                      onClick={() => setSignIn(true)}
                    >
                      Returning client
                    </button>
                  </div>
                  {!signIn && (
                    <>
                      <Field
                        label="Full name"
                        name="name"
                        required
                        maxLength={100}
                      />
                      <Field
                        label="Age"
                        name="age"
                        type="number"
                        min="18"
                        max="120"
                        required
                      />
                    </>
                  )}
                  <Field
                    label="Email"
                    name="email"
                    type="email"
                    required
                    defaultValue={DEMO && signIn ? "client1@example.com" : ""}
                  />
                  <Field
                    label={signIn ? "Password" : "Create a password"}
                    name="password"
                    type="password"
                    required
                    minLength={signIn ? 1 : 10}
                    maxLength={72}
                    defaultValue={DEMO && signIn ? "UnfazedDemo2026!" : ""}
                  />
                  {!signIn && (
                    <>
                      <Field label="What brings you here?">
                        <textarea
                          name="concern"
                          rows={3}
                          maxLength={5000}
                          required
                        />
                      </Field>
                      <Field label="Relevant history (optional)">
                        <textarea name="history" rows={2} maxLength={5000} />
                      </Field>
                      <label className="consent">
                        <input type="checkbox" name="consent" required />
                        <span>
                          I consent to this practice storing my intake
                          information for scheduling and care. I understand that
                          shared notes are visible to me and private clinical
                          notes are restricted to my therapist. Consent version:
                          intake-v1.
                        </span>
                      </label>
                    </>
                  )}
                  <button className="primary" disabled={busy}>
                    {busy
                      ? "Saving…"
                      : signIn
                        ? "Sign in to confirm"
                        : "Save intake & continue"}
                  </button>
                </form>
              )}
            </>
          )}
          {step === 3 && (
            <div className="confirmation">
              <span className="success-circle">
                <Check size={32} />
              </span>
              <h2>Your space is reserved.</h2>
              <p>
                {pretty(booking.start, { weekday: "long", year: "numeric" })}
                <br />
                {time(booking.start, zone)} · {zone}
              </p>
              <div className="notice">
                {booking.paymentStatus === "package"
                  ? "One session credit has been used from your package."
                  : booking.paymentStatus === "paid"
                    ? "Your demo payment has been recorded."
                    : "Your session is confirmed. Complete the advance payment to settle your booking."}
              </div>
              {booking.paymentStatus === "pending" && (
                <button
                  className="primary full"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      setPayment(
                        await api("POST", "/payments/order", {
                          sessionId: booking._id,
                        }),
                      );
                    } catch (e) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Pay {money(booking.amountPaise)}
                </button>
              )}
              <button className="secondary full" onClick={onPortal}>
                Open my client portal
              </button>
            </div>
          )}
        </section>
      </div>
      <footer className="booking-footer">
        <Leaf size={16} />
        Thoughtfully connected with unfazed.
      </footer>
      {payment && (
        <Modal title="Session payment" onClose={() => setPayment(null)}>
          <Checkout
            payment={payment}
            busy={busy}
            confirm={async () => {
              setBusy(true);
              try {
                await api("POST", `/payments/${payment._id}/demo-confirm`);
                setBooking({ ...booking, paymentStatus: "paid" });
                setPayment(null);
                notify("Demo payment recorded — no money collected");
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
            onDone={() => {
              setPayment(null);
              notify(
                "Payment submitted. Your portal will show confirmation after the webhook.",
              );
            }}
          />
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
