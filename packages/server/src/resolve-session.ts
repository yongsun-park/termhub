import type { SessionManager } from "./session-manager.js";
import type { TerminalSession } from "./terminal.js";
import { tmuxSessionExists } from "./tmux.js";

export interface ResolvedSession {
  session: TerminalSession;
  id: string;
  autoAttached?: boolean;
}

export interface ResolveError {
  error: string;
  status: number;
}

/**
 * Resolve a session ID or tmux:<name> reference to an actual session.
 * If tmux:<name> is used and no attached session exists, auto-attaches.
 */
export async function resolveSession(
  sessionManager: SessionManager,
  idOrTmux: string,
): Promise<ResolvedSession | ResolveError> {
  // Direct session ID lookup
  const directSession = sessionManager.get(idOrTmux);
  if (directSession) {
    if (!directSession.isAlive()) {
      return { error: "Session is dead", status: 410 };
    }
    return { session: directSession, id: idOrTmux };
  }

  // Check for tmux:<name> prefix
  if (idOrTmux.startsWith("tmux:")) {
    const tmuxName = idOrTmux.slice(5);

    // Find existing attached session for this tmux session
    const sessions = sessionManager.list();
    const existing = sessions.find((s) => s.tmuxSession === tmuxName);
    if (existing) {
      const session = sessionManager.get(existing.id);
      if (session && session.isAlive()) {
        return { session, id: existing.id };
      }
    }

    // Auto-attach
    const exists = await tmuxSessionExists(tmuxName);
    if (!exists) {
      return { error: `tmux session '${tmuxName}' not found`, status: 404 };
    }

    const newSession = sessionManager.create(undefined, { tmuxSession: tmuxName });
    // Wait for tmux attach to complete and initial output
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { session: newSession, id: newSession.id, autoAttached: true };
  }

  return { error: "Session not found", status: 404 };
}

export function isResolveError(
  result: ResolvedSession | ResolveError,
): result is ResolveError {
  return "error" in result;
}
