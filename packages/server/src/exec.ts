import type { Request, Response } from "express";
import type { SessionManager } from "./session-manager.js";
import { stripAnsi } from "./ansi.js";

interface ExecBody {
  command: string;
  timeoutMs?: number;
  quietMs?: number;
  endPattern?: string;
}

export function createExecHandler(sessionManager: SessionManager) {
  return (req: Request, res: Response): void => {
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

    const body = req.body as ExecBody;
    if (!body.command || typeof body.command !== "string") {
      res.status(400).json({ error: "command (string) is required" });
      return;
    }

    const timeoutMs = body.timeoutMs ?? 30_000;
    const quietMs = body.quietMs ?? 2_000;

    let endPattern: RegExp | null = null;
    if (body.endPattern) {
      try {
        endPattern = new RegExp(body.endPattern);
      } catch {
        res.status(400).json({ error: "Invalid endPattern regex" });
        return;
      }
    }

    let output = "";
    const startTime = Date.now();
    let quietTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    function finish(timedOut: boolean): void {
      if (done) return;
      done = true;
      if (quietTimer) clearTimeout(quietTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      cleanupData();
      cleanupExit();

      const cleaned = stripAnsi(output);
      res.json({
        output: cleaned,
        timedOut,
        durationMs: Date.now() - startTime,
      });
    }

    function resetQuietTimer(): void {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => finish(false), quietMs);
    }

    const cleanupData = session.onData((data) => {
      output += data;
      const clean = stripAnsi(output);
      if (endPattern && endPattern.test(clean)) {
        finish(false);
        return;
      }
      resetQuietTimer();
    });

    const cleanupExit = session.onExit(() => {
      finish(false);
    });

    // Start quiet timer immediately after writing
    resetQuietTimer();

    // Overall timeout
    timeoutTimer = setTimeout(() => finish(true), timeoutMs);

    // Write the command
    session.write(body.command + "\n");
  };
}
