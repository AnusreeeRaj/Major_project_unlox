export function fixtures() {
  const now = new Date(),
    today = now.toISOString().slice(0, 10),
    at = (day, time) => new Date(`${day}T${time}:00+05:30`).toISOString();
  const stamp = new Date().toISOString();
  const row = (x) => ({
    ...x,
    createdAt: x.createdAt ?? stamp,
    updatedAt: stamp,
  });
  const therapist = {
    _id: "therapist-demo",
    name: "Dr. Mira Sharma",
    email: "mira@example.com",
    slug: "dr-mira-sharma",
    bio: "A space to pause, reflect, and find your way forward. I work with adults navigating anxiety, life transitions, and relationships, with a warm, collaborative approach.",
    specializations: ["Anxiety & stress", "Relationships", "Life transitions"],
    languages: ["English", "Hindi"],
    timezone: "Asia/Kolkata",
    tier: "growth",
  };
  const names = [
    ["Aarav Mehta", "Anxiety"],
    ["Diya Nair", "Life transitions"],
    ["Rohan Shah", "Stress"],
    ["Isha Menon", "Relationships"],
    ["Kabir Rao", "Anxiety"],
    ["Tara Singh", "Life transitions"],
    ["Neel Patel", "Stress"],
    ["Ananya Das", "Relationships"],
  ];
  const clients = names.map(([name, tag], i) =>
    row({
      _id: `client-${i + 1}`,
      therapistId: therapist._id,
      name,
      email: `client${i + 1}@example.com`,
      status: i === 6 ? "inactive" : "active",
      tags: [tag],
      intake: {
        age: 24 + i,
        concern: `Support with ${tag.toLowerCase()}`,
        history: "Fictional demonstration record",
      },
      consent: { accepted: true, at: stamp, version: "intake-v1" },
    }),
  );
  const sessions = [
    ["09:00", "client-1"],
    ["10:15", "client-2"],
    ["11:30", "client-4"],
    ["14:00", "client-3"],
    ["15:15", "client-5"],
  ].map(([time, clientId], i) =>
    row({
      _id: `session-${i + 1}`,
      therapistId: therapist._id,
      clientId,
      start: at(today, time),
      end: new Date(
        new Date(at(today, time)).getTime() + 3600000,
      ).toISOString(),
      duration: 60,
      status: i === 0 ? "completed" : "confirmed",
      paymentStatus: i === 2 ? "pending" : "paid",
      amountPaise: 150000,
      mode: "Video consultation",
    }),
  );
  const payments = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(
      now.getFullYear(),
      now.getMonth() - 5 + i,
      Math.min(now.getDate(), 20),
      12,
    );
    for (let j = 0; j < 5 + i * 2; j++)
      payments.push(
        row({
          _id: `pay-${i}-${j}`,
          therapistId: therapist._id,
          clientId: clients[j % clients.length]._id,
          amountPaise: 150000,
          platformFee: 2250,
          netAmount: 147750,
          gstPaise: 0,
          status: "paid",
          provider: "demo",
          receipt: `UF-${d.getFullYear()}-${i + 1}${j + 10}`,
          createdAt: d.toISOString(),
        }),
      );
  }
  return {
    therapists: [row(therapist)],
    clients,
    sessions,
    payments,
    availability: [
      row({
        _id: "availability-demo",
        therapistId: therapist._id,
        timezone: "Asia/Kolkata",
        duration: 60,
        buffer: 15,
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
      }),
    ],
    notes: [
      row({
        _id: "note-1",
        therapistId: therapist._id,
        clientId: "client-1",
        type: "private",
        format: "soap",
        body: "Subjective: Client reports improved awareness of stress triggers.\nObjective: Engaged and reflective during the session.\nAssessment: Building confidence with grounding techniques.\nPlan: Continue practicing the 5-4-3-2-1 exercise.",
      }),
      row({
        _id: "note-2",
        therapistId: therapist._id,
        clientId: "client-1",
        type: "shared",
        format: "freeform",
        body: "This week, try the grounding exercise we practiced. Notice five things you can see, four you can feel, three you can hear, two you can smell, and one you can taste. Take it at your own pace.",
      }),
    ],
    packages: [3, 6, 12].map((n) =>
      row({
        _id: `package-${n}`,
        therapistId: therapist._id,
        name: `${n}-session care package`,
        count: n,
        amountPaise: 150000 * n,
        expiryDays: 90,
      }),
    ),
    clientPackages: [],
    messages: [
      row({
        _id: "msg-1",
        therapistId: therapist._id,
        clientId: "client-1",
        senderRole: "client",
        body: "Hi Dr. Mira, I tried the grounding exercise this morning. It really helped me slow down.",
      }),
      row({
        _id: "msg-2",
        therapistId: therapist._id,
        clientId: "client-1",
        senderRole: "therapist",
        body: "Thank you for sharing, Aarav. We can reflect on how it felt in our next session.",
      }),
    ],
    leads: [],
    notifications: [
      row({
        _id: "notification-1",
        therapistId: therapist._id,
        clientId: "client-2",
        event: "booking.confirmed",
        payload: { sessionId: "session-2" },
        status: "queued_stub",
      }),
    ],
  };
}
