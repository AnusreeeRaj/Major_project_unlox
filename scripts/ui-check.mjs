import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import assert from "node:assert/strict";
const bundle = await build({
  entryPoints: ["unfazed-frontend/src/main.jsx"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  loader: { ".css": "empty" },
  define: {
    "import.meta.env.VITE_DEMO_MODE": '"true"',
    "import.meta.env.VITE_API_BASE_URL": '"http://localhost:5000/api"',
    "process.env.NODE_ENV": '"production"',
  },
});
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(e.message));
const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: "https://example.test/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const w = dom.window;
w.structuredClone = structuredClone;
w.TextEncoder = TextEncoder;
w.TextDecoder = TextDecoder;
const registered = new Map();
w.document.modelContext = {
  registerTool(tool, { signal }) {
    registered.set(tool.name, tool);
    signal.addEventListener("abort", () => registered.delete(tool.name));
  },
};
w.eval(bundle.outputFiles[0].text);
const wait = async (fn, message) => {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error(message);
};
const text = () => w.document.body.textContent;
const click = (label) => {
  const el = [...w.document.querySelectorAll("button")].find(
    (e) =>
      e.textContent.trim() === label || e.textContent.trim() === label + "1",
  );
  assert.ok(el, `Button not found: ${label}`);
  el.click();
  return el;
};
await wait(() => text().includes("Good "), "Dashboard did not load");
assert.ok(text().includes("Today’s schedule"));
await wait(
  () => registered.has("navigate_practice"),
  "WebMCP did not register",
);
await registered.get("navigate_practice").execute({ section: "Clients" });
await wait(
  () =>
    text().includes("Search") ||
    w.document.querySelector('input[aria-label="Search clients"]'),
  "Clients did not open",
);
assert.ok(text().includes("Aarav Mehta"));
await assert.rejects(
  () => registered.get("navigate_practice").execute({ section: "Invalid" }),
  /Unknown section/,
);
click("Session notes");
await wait(() => text().includes("Only you can see this"), "Notes not shown");
assert.ok(text().includes("Subjective:"));
click("Analytics");
await wait(() => text().includes("Revenue over time"), "Analytics not shown");
assert.ok(w.document.querySelector(".bar-chart"));
click("Messages");
await wait(
  () => text().includes("grounding exercise this morning"),
  "Messages missing",
);
click("Overview");
await wait(() => text().includes("Today’s schedule"), "Overview missing");
click("New appointment");
await wait(
  () => w.document.querySelector(".slot-grid button"),
  "No booking slots",
);
w.document.querySelector(".slot-grid button").click();
await wait(
  () => !w.document.querySelector(".modal button.primary").disabled,
  "Slot not selected",
);
const form = w.document.querySelector(".modal form");
form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
await wait(() => text().includes("Appointment confirmed"), "Booking failed");
click("Try client portal");
await wait(() => text().includes("Welcome, Aarav"), "Client portal missing");
click("Session notes");
await wait(
  () => text().includes("This week, try the grounding"),
  "Shared notes missing",
);
assert.ok(!text().includes("Subjective:"));
assert.ok(!text().includes("Only you can see this"));
click("My care");
await wait(
  () => text().includes("Your upcoming sessions"),
  "My care did not render",
);
click("Book a session");
await wait(
  () => text().includes("Make some time for you."),
  "Public booking did not open",
);
assert.ok(text().includes("Dr. Mira Sharma"));
assert.ok(w.document.querySelector(".slot-grid button"));
w.document.querySelector(".slot-grid button").click();
await wait(
  () => !w.document.querySelector(".booking-card button.primary").disabled,
  "Public slot not selected",
);
click("Continue");
await wait(
  () => text().includes("Confirm booking"),
  "Client confirmation did not load",
);
click("Confirm booking");
await wait(
  () => text().includes("Your space is reserved."),
  "Client booking did not complete",
);
const unexpected = errors.filter(
  (e) => !e.includes("Not implemented: HTMLCanvasElement"),
);
assert.deepEqual(unexpected, []);
console.log(
  "PASS: dashboard, navigation, WebMCP, CRM, private/shared notes, analytics, messages, therapist booking, client portal and client booking (DOM environment; no visual browser QA).",
);
w.close();
