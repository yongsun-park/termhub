import { randomUUID } from "node:crypto";
import { TerminalSession, type TerminalSessionInfo } from "./terminal.js";

export class SessionManager {
  private sessions = new Map<string, TerminalSession>();

  create(name?: string, cwd?: string): TerminalSession {
    const id = randomUUID().slice(0, 8);
    const sessionName = name || `session-${this.sessions.size + 1}`;
    const session = new TerminalSession(id, sessionName, cwd);

    session.onExit(() => {
      // Keep dead sessions for a while so client can see exit status
      setTimeout(() => this.sessions.delete(id), 60_000);
    });

    this.sessions.set(id, session);
    return session;
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
    return true;
  }

  destroyAll(): void {
    for (const session of this.sessions.values()) {
      session.destroy();
    }
    this.sessions.clear();
  }
}
