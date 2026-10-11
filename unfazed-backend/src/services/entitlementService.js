export class AppError extends Error {
  constructor(message, status = 400, code = "INVALID_INPUT") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const assert = (test, message, status = 400, code) => {
  if (!test) throw new AppError(message, status, code);
};
export function entitlementService(db) {
  async function config(id) {
    const t = await db.one("therapists", { _id: id });
    assert(t, "Therapist not found", 404);
    const tier = await db.one("tiers", { _id: t.tier });
    assert(tier, "Plan configuration missing", 503);
    return tier;
  }
  async function canAccess(id, key) {
    const p = await config(id);
    if (key === "addClient")
      return (
        (await db.find("clients", { therapistId: id, status: "active" }))
          .length < p.activeClientCap
      );
    return Boolean(p.features[key]);
  }
  async function requireAccess(id, key) {
    assert(
      await canAccess(id, key),
      "This feature requires a different plan.",
      403,
      "UPGRADE_REQUIRED",
    );
  }
  return { config, canAccess, requireAccess };
}
