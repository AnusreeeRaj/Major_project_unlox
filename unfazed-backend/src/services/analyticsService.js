export async function analytics(db, id) {
  if (db.mode === "mongo") {
    const [revenue, active, statuses] = await Promise.all([
      db.aggregate("payments", [
        { $match: { therapistId: id, status: "paid" } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            amountPaise: { $sum: "$amountPaise" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      db.aggregate("clients", [
        { $match: { therapistId: id, status: "active" } },
        { $count: "count" },
      ]),
      db.aggregate("sessions", [
        { $match: { therapistId: id } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);
    const completed = statuses
      .filter((s) => ["completed", "no-show"].includes(s._id))
      .reduce((a, b) => a + b.count, 0);
    return {
      revenue,
      activeClients: active[0]?.count ?? 0,
      totalRevenue: revenue.reduce((a, b) => a + b.amountPaise, 0),
      sessions: statuses.reduce((a, b) => a + b.count, 0),
      noShowRate: completed
        ? Math.round(
            ((statuses.find((s) => s._id === "no-show")?.count ?? 0) /
              completed) *
              100,
          )
        : 0,
    };
  }
  const [payments, clients, sessions] = await Promise.all([
    db.find("payments", { therapistId: id, status: "paid" }),
    db.find("clients", { therapistId: id, status: "active" }),
    db.find("sessions", { therapistId: id }),
  ]);
  const grouped = {};
  payments.forEach((p) => {
    const m = new Date(p.createdAt).toISOString().slice(0, 7);
    grouped[m] = (grouped[m] ?? 0) + p.amountPaise;
  });
  const done = sessions.filter((s) =>
    ["completed", "no-show"].includes(s.status),
  );
  return {
    revenue: Object.entries(grouped)
      .map(([_id, amountPaise]) => ({ _id, amountPaise }))
      .sort((a, b) => a._id.localeCompare(b._id)),
    activeClients: clients.length,
    sessions: sessions.length,
    totalRevenue: payments.reduce((a, b) => a + b.amountPaise, 0),
    noShowRate: done.length
      ? Math.round(
          (done.filter((s) => s.status === "no-show").length / done.length) *
            100,
        )
      : 0,
  };
}
