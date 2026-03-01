import { randomUUID } from "node:crypto";
import { TerminalSession, type TerminalSessionInfo, type TerminalSessionOptions } from "./terminal.js";
import { OutputMonitor, type AlertListener } from "./output-monitor.js";

export class SessionManager {
  private sessions = new Map<string, TerminalSession>();
  private monitor = new OutputMonitor();
  private monitorCleanups = new Map<string, () => void>();

  create(name?: string, options?: TerminalSessionOptions): TerminalSession {
    const id = randomUUID().slice(0, 8);
    const sessionName = name || (options?.tmuxSession
      ? `tmux:${options.tmuxSession}`
      : `session-${this.sessions.size + 1}`);
    const session = new TerminalSession(id, sessionName, options);

    const cleanupMonitor = session.onData((data) => {
      this.monitor.feed(id, data);
    });
    this.monitorCleanups.set(id, cleanupMonitor);

    session.onExit(() => {
      setTimeout(() => {
        this.sessions.delete(id);
        this.monitorCleanups.get(id)?.();
        this.monitorCleanups.delete(id);
        this.monitor.removeSession(id);
      }, 60_000);
    });

    this.sessions.set(id, session);
    return session;
  }

  onAlert(listener: AlertListener): () => void {
    return this.monitor.onAlert(listener);
  }

  get(id: string): TerminalSession | undefined {
    return this.sessions.get(id);
  }

  list(): TerminalSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.getInfo());
  }

  delete(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.destroy();
    this.sessions.delete(id);
    this.monitorCleanups.get(id)?.();
    this.monitorCleanups.delete(id);
    this.monitor.removeSession(id);
    return true;
  }

  destroyAll(): void {
    for (const session of this.sessions.values()) {
      session.destroy();
    }
    this.sessions.clear();
    this.monitorCleanups.clear();
  }
}
