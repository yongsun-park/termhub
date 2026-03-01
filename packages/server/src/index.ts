import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { URL } from "node:url";
import path from "node:path";
import { SessionManager } from "./session-manager.js";
import { login, authMiddleware } from "./auth.js";
import { handleWebSocket } from "./websocket.js";

const PORT = parseInt(process.env.PORT || "4000", 10);
const app = express();
const server = createServer(app);

app.use(express.json());

// Serve static frontend files in production
const webDistPath = path.resolve(import.meta.dirname, "../../web/dist");
app.use(express.static(webDistPath));

const sessionManager = new SessionManager();

// --- Auth ---
app.post("/api/login", (req, res) => {
  const { password } = req.body;
  if (!password) {
    res.status(400).json({ error: "Password required" });
    return;
  }
  const token = login(password);
  if (!token) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  res.json({ token });
});

// --- Session REST API ---
app.get("/api/sessions", authMiddleware, (_req, res) => {
  res.json(sessionManager.list());
});

app.post("/api/sessions", authMiddleware, (req, res) => {
  const { name, cwd } = req.body || {};
  const session = sessionManager.create(name, cwd);
  res.status(201).json(session.getInfo());
});

app.delete("/api/sessions/:id", authMiddleware, (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const deleted = sessionManager.delete(id);
  if (!deleted) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ ok: true });
});

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(webDistPath, "index.html"));
});

// --- WebSocket ---
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  const token = url.searchParams.get("token");
  wss.handleUpgrade(req, socket, head, (ws) => {
    handleWebSocket(ws, token, sessionManager);
  });
});

server.listen(PORT, () => {
  console.log(`Aily server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  sessionManager.destroyAll();
  server.close();
});
process.on("SIGINT", () => {
  sessionManager.destroyAll();
  server.close();
});
