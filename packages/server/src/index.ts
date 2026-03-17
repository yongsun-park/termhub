import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { URL } from "node:url";
import path from "node:path";
import { SessionManager } from "./session-manager.js";
import { login, authMiddleware } from "./auth.js";
import { handleWebSocket } from "./websocket.js";
import { listTmuxSessions, tmuxSessionExists, tmuxCapturePane } from "./tmux.js";
import { createExecHandler } from "./exec.js";
import { createStreamHandler } from "./sse.js";
import { createSendHandler } from "./send.js";
import { stripAnsi } from "./ansi.js";
import { detectClaudeState } from "./claude-state.js";
import { resolveSession, isResolveError } from "./resolve-session.js";
import { listProjects } from "./projects.js";
import { getFavorites, setFavorites } from "./favorites.js";

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
  const { password } = req.body || {};
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

app.post("/api/sessions", authMiddleware, async (req, res) => {
  const { name, cwd, tmuxSession } = req.body || {};

  if (tmuxSession) {
    const exists = await tmuxSessionExists(tmuxSession);
    if (!exists) {
      res.status(404).json({ error: `tmux session '${tmuxSession}' not found` });
      return;
    }
  }

  try {
    const session = sessionManager.create(name, { cwd, tmuxSession });
    res.status(201).json(session.getInfo());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create session" });
  }
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

app.get("/api/tmux-sessions", authMiddleware, async (_req, res) => {
  const tmuxSessions = await listTmuxSessions();
  const termhubSessions = sessionManager.list();
  const attachedNames = new Set(
    termhubSessions.filter((s) => s.tmuxSession).map((s) => s.tmuxSession!)
  );
  const enriched = tmuxSessions.map((ts) => ({
    ...ts,
    termhubAttached: attachedNames.has(ts.name),
  }));
  res.json(enriched);
});

// --- Projects API ---
app.get("/api/projects", authMiddleware, async (_req, res) => {
  const [projects, favorites] = await Promise.all([listProjects(), getFavorites()]);
  const favSet = new Set(favorites);
  const enriched = projects.map((p) => ({ ...p, pinned: favSet.has(p.path) }));
  res.json(enriched);
});

// --- Favorites API ---
app.get("/api/favorites", authMiddleware, async (_req, res) => {
  const favorites = await getFavorites();
  res.json(favorites);
});

app.put("/api/favorites", authMiddleware, async (req, res) => {
  const { paths } = req.body || {};
  if (!Array.isArray(paths)) {
    res.status(400).json({ error: "paths (string[]) is required" });
    return;
  }
  await setFavorites(paths);
  res.json({ ok: true });
});

// --- Exec, Send & Stream API ---
app.post("/api/sessions/:id/exec", authMiddleware, createExecHandler(sessionManager));
app.post("/api/sessions/:id/send", authMiddleware, createSendHandler(sessionManager));
app.get("/api/sessions/:id/stream", authMiddleware, createStreamHandler(sessionManager));

// --- Status API (Claude Code state detection) ---
app.get("/api/sessions/:id/status", authMiddleware, async (req, res) => {
  const result = await resolveSession(sessionManager, req.params.id);
  if (isResolveError(result)) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const { session, id } = result;
  // For tmux sessions, capture the rendered screen for accurate state detection
  let cleaned: string;
  if (session.tmuxSession) {
    cleaned = await tmuxCapturePane(session.tmuxSession);
  } else {
    cleaned = stripAnsi(session.getSnapshot());
  }
  const stateResult = detectClaudeState(cleaned);
  res.json({
    ...stateResult,
    sessionId: id,
    alive: session.isAlive(),
  });
});

// --- Write API (raw text to session) ---
app.post("/api/sessions/:id/write", authMiddleware, (req, res) => {
  const id = req.params.id;
  const session = sessionManager.get(id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (!session.isAlive()) {
    res.status(410).json({ error: "Session is dead" });
    return;
  }
  const { data } = req.body || {};
  if (typeof data !== "string") {
    res.status(400).json({ error: "data (string) is required" });
    return;
  }
  session.write(data);
  res.json({ ok: true });
});

// --- Output API (get session output buffer) ---
app.get("/api/sessions/:id/output", authMiddleware, (req, res) => {
  const id = req.params.id;
  const session = sessionManager.get(id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const snapshot = session.getSnapshot();
  const lastN = parseInt(req.query.last as string, 10);
  if (lastN > 0) {
    const lines = snapshot.split("\n");
    res.json({ output: lines.slice(-lastN).join("\n") });
    return;
  }
  res.json({ output: snapshot });
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
  console.log(`TermHub server running on http://localhost:${PORT}`);
});

// Graceful shutdown
function shutdown(): void {
  sessionManager.destroyAll();
  for (const client of wss.clients) {
    client.close(1001, "Server shutting down");
  }
  server.close();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
