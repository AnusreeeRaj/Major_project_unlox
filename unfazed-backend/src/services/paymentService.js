import Razorpay from "razorpay";
import crypto from "node:crypto";
import { assert } from "./entitlementService.js";
export function verifySignature(body, signature, secret) {
  if (!secret || !signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return (
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}
export function paymentService(db, entitlements, notifications, env) {
  const demo = env.PAYMENT_MODE === "demo";
  const gateway =
    !demo && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
      ? new Razorpay({
          key_id: env.RAZORPAY_KEY_ID,
          key_secret: env.RAZORPAY_KEY_SECRET,
        })
      : null;
  async function order(user, { sessionId, packageId }) {
    assert(!!sessionId !== !!packageId, "Choose a session or a package");
    const cfg = await entitlements.config(user.therapistId);
    let amount;
    if (sessionId) {
      const s = await db.one("sessions", {
        _id: sessionId,
        clientId: user.id,
        therapistId: user.therapistId,
      });
      assert(
        s && s.status === "confirmed" && s.paymentStatus === "pending",
        "Session cannot be paid",
      );
      amount = s.amountPaise;
    } else {
      await entitlements.requireAccess(user.therapistId, "packages");
      const p = await db.one("packages", {
        _id: packageId,
        therapistId: user.therapistId,
      });
      assert(p, "Package not found", 404);
      amount = p.amountPaise;
    }
    assert(demo || gateway, "Razorpay credentials are not configured", 503);
    const receipt = crypto.randomUUID();
    const go = demo
      ? { id: `demo_${receipt}` }
      : await gateway.orders.create({ amount, currency: "INR", receipt });
    const fee = Math.round((amount * cfg.platformFeeBps) / 10000);
    const p = await db.add("payments", {
      therapistId: user.therapistId,
      clientId: user.id,
      sessionId,
      packageId,
      gatewayOrderId: go.id,
      amountPaise: amount,
      platformFee: fee,
      netAmount: amount - fee,
      gstPaise: Math.round((amount * cfg.gstBps) / 10000),
      status: "created",
      provider: demo ? "demo" : "razorpay",
      receipt,
    });
    return { ...p, key: env.RAZORPAY_KEY_ID };
  }
  async function settle(orderId, transactionId, amount) {
    const p = await db.one("payments", { gatewayOrderId: orderId });
    assert(p, "Order not found", 404);
    return db.atomic(p.therapistId, async () => {
      const current = await db.one("payments", { _id: p._id });
      if (current.status === "paid") return current;
      assert(current.amountPaise === amount, "Payment amount mismatch");
      if (p.sessionId) {
        const s = await db.one("sessions", { _id: p.sessionId });
        assert(
          s && s.status !== "cancelled",
          "Session cancelled; manual refund review required",
          409,
        );
        assert(
          s.paymentStatus === "pending",
          "Session already paid; manual refund review required",
          409,
        );
        await db.update("sessions", p.sessionId, { paymentStatus: "paid" });
      }
      if (p.packageId) {
        const pack = await db.one("packages", { _id: p.packageId });
        await db.add("clientPackages", {
          therapistId: p.therapistId,
          clientId: p.clientId,
          packageId: p.packageId,
          paymentId: p._id,
          remaining: pack.count,
          expiresAt: new Date(
            Date.now() + pack.expiryDays * 86400000,
          ).toISOString(),
        });
      }
      const result = await db.update("payments", p._id, {
        status: "paid",
        gatewayTransactionId: transactionId,
      });
      await notifications.emit("payment.confirmed", p.therapistId, p.clientId, {
        paymentId: p._id,
      });
      return result;
    });
  }
  return { order, settle, demo, gateway };
}
