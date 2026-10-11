import { DateTime } from "luxon";
import { assert } from "./entitlementService.js";
export const defaultAvailability = (id) => ({
  therapistId: id,
  timezone: "Asia/Kolkata",
  weekly: {
    1: ["09:00", "17:00"],
    2: ["09:00", "17:00"],
    3: ["09:00", "17:00"],
    4: ["09:00", "17:00"],
    5: ["09:00", "17:00"],
    6: ["09:00", "13:00"],
  },
  overrides: {},
  blocked: [],
  duration: 60,
  buffer: 15,
});
export function schedulingService(db, entitlements, notifications) {
  async function slots(id, date) {
    const a =
      (await db.one("availability", { therapistId: id })) ??
      defaultAvailability(id);
    const day = DateTime.fromISO(date, { zone: a.timezone });
    assert(
      day.isValid && /^\d{4}-\d{2}-\d{2}$/.test(date),
      "Choose a valid date",
    );
    const hours = Object.hasOwn(a.overrides ?? {}, date)
      ? a.overrides[date]
      : a.weekly[day.weekday];
    if (!hours?.length) return [];
    const all = await db.find("sessions", { therapistId: id });
    let start = DateTime.fromISO(`${date}T${hours[0]}`, { zone: a.timezone });
    const end = DateTime.fromISO(`${date}T${hours[1]}`, { zone: a.timezone });
    const out = [];
    while (start.plus({ minutes: a.duration }) <= end) {
      const finish = start.plus({ minutes: a.duration });
      const iso = start.toUTC().toISO();
      if (
        start.toMillis() > Date.now() &&
        !a.blocked.includes(iso) &&
        !all.some(
          (s) =>
            s.status !== "cancelled" &&
            new Date(s.start).getTime() <
              finish.plus({ minutes: a.buffer }).toMillis() &&
            new Date(s.end).getTime() + a.buffer * 60000 > start.toMillis(),
        )
      )
        out.push({
          start: iso,
          end: finish.toUTC().toISO(),
          duration: a.duration,
        });
      start = start.plus({ minutes: a.duration + a.buffer });
    }
    return out;
  }
  async function book(therapistId, clientId, start, packageId) {
    return db.atomic(therapistId, async () => {
      const c = await db.one("clients", { _id: clientId, therapistId });
      assert(
        c?.consent?.accepted,
        "Complete intake and consent before booking",
      );
      const a = await db.one("availability", { therapistId });
      const dt = DateTime.fromISO(start, { zone: "utc" });
      assert(dt.isValid, "Invalid slot");
      const date = dt.setZone(a?.timezone ?? "Asia/Kolkata").toISODate();
      const slot = (await slots(therapistId, date)).find(
        (s) => Date.parse(s.start) === Date.parse(start),
      );
      assert(slot, "This slot is no longer available", 409);
      const cfg = await entitlements.config(therapistId);
      let credit = null;
      if (packageId) {
        credit = await db.one("clientPackages", {
          _id: packageId,
          therapistId,
          clientId,
        });
        assert(
          credit &&
            credit.remaining > 0 &&
            Date.parse(credit.expiresAt) > Date.now(),
          "Package has expired or has no sessions remaining",
        );
        await db.update("clientPackages", credit._id, {
          remaining: credit.remaining - 1,
        });
      }
      const s = await db.add("sessions", {
        therapistId,
        clientId,
        clientPackageId: credit?._id,
        ...slot,
        status: "confirmed",
        paymentStatus: credit ? "package" : "pending",
        amountPaise: credit ? 0 : cfg.sessionPricePaise,
        mode: "Video consultation",
      });
      await notifications.emit("booking.confirmed", therapistId, clientId, {
        sessionId: s._id,
      });
      return s;
    });
  }
  return { slots, book };
}
