export const notificationService = (db) => ({
  emit: (event, therapistId, clientId, payload = {}) =>
    db.add("notifications", {
      event,
      therapistId,
      clientId,
      payload,
      status: "queued_stub",
    }),
  async reminders(now = new Date()) {
    const sessions = await db.find("sessions", { status: "confirmed" });
    for (const s of sessions) {
      const d = new Date(s.start) - now;
      if (
        d > 0 &&
        d <= 86400000 &&
        !(await db.one("notifications", {
          event: "session.reminder",
          clientId: s.clientId,
          "payload.sessionId": s._id,
        }))
      ) {
        const sent = await db.find("notifications", {
          event: "session.reminder",
          clientId: s.clientId,
        });
        if (!sent.some((n) => n.payload.sessionId === s._id))
          await this.emit("session.reminder", s.therapistId, s.clientId, {
            sessionId: s._id,
          });
      }
    }
  },
});
