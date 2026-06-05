const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");

let io;

module.exports = {
  init: (server) => {
    io = socketIo(server, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS 
          ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
          : ["http://localhost:5000", "http://localhost:3000", "http://127.0.0.1:5000"],
        methods: ["GET", "POST"]
      }
    });

    io.use((socket, next) => {
      // Allow token from handshake auth or query
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
          return next(new Error("Authentication error: Invalid token"));
        }
        socket.user = decoded; // { id, name, email, role }
        next();
      });
    });

    io.on("connection", (socket) => {
      console.log(`[Socket.IO] Client connected: ${socket.user.name} (${socket.user.role})`);

      // Join rooms for targeted notifications
      const { id, name, email, role } = socket.user;
      
      if (id) socket.join(`user:${id}`);
      if (email) socket.join(`email:${email}`);
      if (name) socket.join(`name:${name}`);
      if (role) socket.join(`role:${role}`);

      socket.on("disconnect", () => {
        console.log(`[Socket.IO] Client disconnected: ${socket.user.name}`);
      });
    });

    return io;
  },

  getIO: () => {
    if (!io) {
      throw new Error("Socket.io not initialized!");
    }
    return io;
  },

  // Helper method to emit a notification
  emitNotification: (notification) => {
    if (!io) return;

    const eventName = "new_notification";

    // If there is an explicit userEmail or userName, target that specific user
    if (notification.userEmail) {
      io.to(`email:${notification.userEmail}`).emit(eventName, notification);
    } else if (notification.userName && notification.userName !== "Global") {
      io.to(`name:${notification.userName}`).emit(eventName, notification);
    } else {
      // Global/Role based notifications
      // e.g., admin approvals go to all admins and owners
      if (notification.type === "admin_approval") {
        io.to("role:admin").to("role:owner").emit(eventName, notification);
      } else {
        // Fallback: emit to all if it's truly a global announcement
        io.emit(eventName, notification);
      }
    }
  }
};
