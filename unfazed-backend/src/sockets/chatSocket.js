import jwt from "jsonwebtoken";
export function configureChat(io, db, secret) {
  io.use((socket, next) => {
    try {
      socket.user = jwt.verify(socket.handshake.auth.token, secret, {
        issuer: "unfazed",
        audience: "unfazed-app",
        algorithms: ["HS256"],
      });
      next();
    } catch {
      next(new Error("Authentication required"));
    }
  });
  io.on("connection", (socket) => {
    socket.on("join", async ({ clientId }, ack) => {
      try {
        const u = socket.user,
          id = u.role === "client" ? u.id : clientId;
        const c = await db.one("clients", {
          _id: id,
          therapistId: u.therapistId,
        });
        if (!c) throw Error("Access denied");
        for (const room of socket.rooms)
          if (room !== socket.id) socket.leave(room);
        socket.join(`${u.therapistId}:${id}`);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });
  });
}
