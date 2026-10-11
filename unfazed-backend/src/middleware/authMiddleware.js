import jwt from "jsonwebtoken";
import { AppError } from "../services/entitlementService.js";
export const issueToken = (user, secret) =>
  jwt.sign(user, secret, {
    expiresIn: "8h",
    issuer: "unfazed",
    audience: "unfazed-app",
  });
export const authMiddleware = (secret) => (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    req.user = jwt.verify(token, secret, {
      issuer: "unfazed",
      audience: "unfazed-app",
      algorithms: ["HS256"],
    });
    next();
  } catch {
    next(new AppError("Please sign in to continue", 401, "UNAUTHENTICATED"));
  }
};
export const therapistOnly = (req, res, next) =>
  req.user.role === "therapist"
    ? next()
    : next(new AppError("Therapist access required", 403));
