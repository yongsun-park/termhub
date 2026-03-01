import type { WebSocket } from "ws";
import type { SessionManager } from "./session-manager.js";
import { verifyToken } from "./auth.js";

interface AttachMessage {
  type: "attach";
  sessionId: string;
}

interface InputMessage {
  type: "input";
  data: string;
}

interface ResizeMessage {
  type: "resize";
  cols: number;
  rows: number;
}

type ClientMessage = AttachMessage | InputMessage | ResizeMessage | { type: "heartbeat" };

function send(ws: WebSocket, msg: Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function handleWebSocket(
  ws: WebSocket,
  token: string | null,
  sessionManager: SessionManager
): void {
  if (!token || !verifyToken(token)) {
    send(ws, { type: "error", message: "Unauthorized" });
    ws.close(1008, "Unauthorized");
    return;
  }

  let attachedSessionId: string | null = null;
  let cleanupData: (() => void) | null = null;
  let cleanupExit: (() => void) | null = null;

  function detach(): void {
    cleanupData?.();
    cleanupExit?.();
    cleanupData = null;
    cleanupExit = null;
  }

  function attachSession(sessionId: string): void {
    detach();
    attachedSessionId = sessionId;

    const session = sessionManager.get(sessionId);
    if (!session) {
      send(ws, { type: "error", message: "Session not found" });
      return;
    }

    const snapshot = session.getSnapshot();
    if (snapshot) {
      send(ws, { type: "snapshot", sessionId, data: snapshot });
    }

    cleanupData = session.onData((data) => {
      send(ws, { type: "output", sessionId, data });
    });

    cleanupExit = session.onExit((code) => {
      send(ws, { type: "exit", sessionId, code });
    });
  }

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case "attach":
        attachSession(msg.sessionId);
        break;
      case "input": {
        if (attachedSessionId) {
          sessionManager.get(attachedSessionId)?.write(msg.data);
        }
        break;
      }
      case "resize": {
        const cols = Number(msg.cols);
        const rows = Number(msg.rows);
        if (attachedSessionId && cols > 0 && rows > 0 && Number.isFinite(cols) && Number.isFinite(rows)) {
          sessionManager.get(attachedSessionId)?.resize(Math.floor(cols), Math.floor(rows));
        }
        break;
      }
      case "heartbeat":
        send(ws, { type: "heartbeat" });
        break;
    }
  });

  ws.on("close", () => {
    detach();
  });
}
