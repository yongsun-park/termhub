import type { Request, Response } from "express";
import type { SessionManager } from "./session-manager.js";

function sseWrite(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createStreamHandler(sessionManager: SessionManager) {
  return (req: Request, res: Response): void => {
    const id = req.params.id;
    const session = sessionManager.get(id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Send snapshot
    const snapshot = session.getSnapshot();
    if (snapshot) {
      sseWrite(res, "snapshot", { sessionId: id, data: snapshot });
    }

    // Subscribe to output
    const cleanupData = session.onData((data) => {
      sseWrite(res, "output", { sessionId: id, data });
    });

    function cleanup(): void {
      clearInterval(heartbeat);
      cleanupData();
      cleanupExit();
      cleanupAlert();
    }

    // Subscribe to exit
    const cleanupExit = session.onExit((code) => {
      sseWrite(res, "exit", { sessionId: id, code });
      cleanup();
      res.end();
    });

    // Subscribe to alerts
    const cleanupAlert = sessionManager.onAlert((alert) => {
      if (alert.sessionId === id) {
        sseWrite(res, "alert", alert);
      }
    });

    // Heartbeat every 15s
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 15_000);

    // Cleanup on disconnect
    req.on("close", cleanup);

    // If session is already dead, send exit and close
    if (!session.isAlive()) {
      sseWrite(res, "exit", { sessionId: id, code: -1 });
      cleanup();
      res.end();
    }
  };
}
