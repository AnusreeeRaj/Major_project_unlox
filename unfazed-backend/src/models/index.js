import mongoose from "mongoose";
const { Schema } = mongoose;
const common = { _id: { type: String, required: true } };
const make = (name, fields, indexes = []) => {
  const s = new Schema(
    { ...common, ...fields },
    { timestamps: true, strict: true },
  );
  for (const i of indexes) s.index(i.keys, i.options);
  return mongoose.model(name, s);
};
export const models = {
  therapists: make("Therapist", {
    email: { type: String, unique: true },
    password_hash: String,
    name: String,
    slug: { type: String, unique: true },
    bio: String,
    specializations: [String],
    languages: [String],
    tier: String,
    timezone: String,
    bookingVersion: { type: Number, default: 0 },
  }),
  clients: make(
    "Client",
    {
      therapistId: String,
      name: String,
      email: String,
      password_hash: String,
      invitationHash: String,
      status: String,
      tags: [String],
      intake: Schema.Types.Mixed,
      consent: Schema.Types.Mixed,
    },
    [{ keys: { therapistId: 1, email: 1 }, options: { unique: true } }],
  ),
  sessions: make("Session", {
    therapistId: String,
    clientId: String,
    start: String,
    end: String,
    duration: Number,
    clientPackageId: String,
    status: String,
    paymentStatus: String,
    amountPaise: Number,
    mode: String,
  }),
  notes: make("SessionNote", {
    therapistId: String,
    clientId: String,
    sessionId: String,
    type: String,
    format: String,
    body: String,
    soap: Schema.Types.Mixed,
  }),
  availability: make("Availability", {
    therapistId: { type: String, unique: true },
    timezone: String,
    weekly: Schema.Types.Mixed,
    overrides: Schema.Types.Mixed,
    blocked: [String],
    buffer: Number,
    duration: Number,
  }),
  payments: make(
    "Payment",
    {
      therapistId: String,
      clientId: String,
      sessionId: String,
      packageId: String,
      gatewayOrderId: String,
      gatewayTransactionId: String,
      amountPaise: Number,
      platformFee: Number,
      netAmount: Number,
      gstPaise: Number,
      status: String,
      provider: String,
      receipt: String,
    },
    [
      {
        keys: { gatewayTransactionId: 1 },
        options: {
          unique: true,
          partialFilterExpression: {
            gatewayTransactionId: { $type: "string" },
          },
        },
      },
    ],
  ),
  packages: make("Package", {
    therapistId: String,
    name: String,
    count: Number,
    amountPaise: Number,
    expiryDays: Number,
  }),
  clientPackages: make(
    "ClientPackage",
    {
      therapistId: String,
      clientId: String,
      packageId: String,
      paymentId: String,
      remaining: Number,
      expiresAt: String,
    },
    [{ keys: { paymentId: 1 }, options: { unique: true } }],
  ),
  leads: make("Lead", {
    therapistId: String,
    name: String,
    email: String,
    status: String,
  }),
  tiers: make("SubscriptionTierConfig", {
    name: String,
    monthlyPaise: Number,
    activeClientCap: Number,
    features: Schema.Types.Mixed,
    sessionPricePaise: Number,
    platformFeeBps: Number,
    gstBps: Number,
    packageSizes: [Number],
    packageExpiryDays: Number,
  }),
  messages: make("Message", {
    therapistId: String,
    clientId: String,
    senderRole: String,
    body: String,
  }),
  notifications: make("Notification", {
    therapistId: String,
    clientId: String,
    event: String,
    payload: Schema.Types.Mixed,
    status: String,
  }),
};
