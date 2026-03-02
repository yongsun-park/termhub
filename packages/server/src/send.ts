import type { Request, Response } from "express";
import type { SessionManager } from "./session-manager.js";
import { stripAnsi } from "./ansi.js";
import { detectClaudeState, TERMINAL_STATES, type ClaudeState } from "./claude-state.js";
import { resolveSession, isResolveError } from "./resolve-session.js";
import { tmuxCapturePane } from "./tmux.js";

interface SendBody {
  text: string;
  submit?: boolean;
  waitForIdle?: boolean;
  timeoutMs?: number;
  quietMs?: number;
}

export function createSendHandler(sessionManager: SessionManager) {
  return async (req: Request, res: Response): Promise<void> => {
    const idOrTmux = req.params.id;

    const result = await resolveSession(sessionManager, idOrTmux);
    if (isResolveError(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const { session, id: sessionId, autoAttached } = result;
    const isTmux = !!session.tmuxSession;

    const body = req.body as SendBody;
    if (!body.text || typeof body.text !== "string") {
      res.status(400).json({ error: "text (string) is required" });
      return;
    }

    const submit = body.submit !== false;
    const waitForIdle = body.waitForIdle !== false;
    const timeoutMs = body.timeoutMs ?? 300_000;
    const quietMs = body.quietMs ?? 3_000;

    // If not waiting, write and return immediately
    if (!waitForIdle) {
      session.write(body.text);
      if (submit) {
        await new Promise((r) => setTimeout(r, 100));
        session.write("\r");
      }
      res.json({
        output: "",
        state: "unknown" as ClaudeState,
        sessionId,
        autoAttached: autoAttached ?? false,
        durationMs: 0,
        timedOut: false,
      });
      return;
    }

    const startTime = Date.now();

    const respond = (timedOut: boolean, output: string, state: ClaudeState): void => {
      if (res.headersSent) return;
      res.json({
        output,
        state,
        sessionId,
        autoAttached: autoAttached ?? false,
        durationMs: Date.now() - startTime,
        timedOut,
      });
    };

    try {
      if (isTmux) {
        // Capture initial screen BEFORE writing, so we can detect when it changes
        const initialScreen = await tmuxCapturePane(session.tmuxSession!);

        // Write text, then Enter separately (Claude Code paste behavior)
        session.write(body.text);
        if (submit) {
          await new Promise((r) => setTimeout(r, 100));
          session.write("\r");
        }

        await waitForTmuxIdle(session.tmuxSession!, body.text, initialScreen, timeoutMs, quietMs, respond);
      } else {
        // Register listener BEFORE writing so fast responses aren't missed
        const waiter = waitForDataIdle(session, timeoutMs, quietMs, respond);

        session.write(body.text);
        if (submit) {
          await new Promise((r) => setTimeout(r, 100));
          session.write("\r");
        }

        void waiter;
      }
    } catch {
      if (!res.headersSent) {
        res.status(500).json({ error: "Send failed" });
      }
    }
  };
}

type FinishCallback = (timedOut: boolean, output: string, state: ClaudeState) => void;

/**
 * Extract only the Claude Code response from captured terminal output.
 *
 * Claude Code screen layout:
 *   ● response text...          ← Claude's response (what we want)
 *   ✻ Worked for 10s            ← duration line
 *   ───────────────────────      ← separator (top of prompt area)
 *   ❯ next prompt or empty      ← prompt input area
 *   ───────────────────────      ← separator (bottom of prompt area)
 *     ? for shortcuts            ← hint line
 *
 * Strategy:
 * 1. Find the sent prompt marker "❯ {promptText}" to locate response start
 * 2. Cut off at the LAST separator block (prompt input area at bottom)
 * 3. If prompt marker not found (scrolled off), return null for more scrollback
 */
function extractResponse(captured: string, promptText: string): string | null {
  // Use only a short prefix of the prompt to avoid terminal line-wrapping issues.
  // Long prompts wrap across multiple lines in tmux, so the full text won't match.
  // Trim trailing whitespace to avoid mismatch at line-wrap boundaries where
  // the terminal strips trailing spaces before the newline.
  const prefix = promptText.slice(0, 40).trimEnd();
  // Clean terminal escape sequence artifacts (e.g., "0;276;0c" from DA responses)
  // that Codex sometimes leaves in the capture output
  const cleaned = captured.replace(/\d+;\d+;\d+c/g, "");
  // Try both Claude Code (❯) and Codex (›) prompt markers
  let markerIdx = cleaned.lastIndexOf(`❯ ${prefix}`);
  if (markerIdx < 0) {
    markerIdx = cleaned.lastIndexOf(`› ${prefix}`);
  }

  if (markerIdx < 0) {
    return null; // Prompt not found — need more scrollback
  }

  // Skip from the marker to the end of the prompt line(s).
  // The prompt may wrap across multiple lines, so find the next line
  // that doesn't look like a continuation (indented text on next line).
  const afterMarker = cleaned.slice(markerIdx);
  const allLines = afterMarker.split("\n");
  let skipLines = 1; // At least skip the marker line itself
  for (let i = 1; i < allLines.length; i++) {
    const line = allLines[i];
    // Continuation lines are indented (leading spaces) and don't start with
    // response markers (●, ✻, ─, ❯) or empty lines before response
    if (line.match(/^\s{2,}\S/) && !line.trim().startsWith("●")) {
      skipLines++;
    } else {
      break;
    }
  }
  const lines = allLines.slice(skipLines);

  // Find where this response ends. We look for the FIRST subsequent prompt:
  //   ───── (separator)
  //   ❯ ... (next prompt — could be the current idle prompt or a subsequent sent prompt)
  // This handles both:
  //   a) The trailing idle prompt area (separator + ❯ + separator + hints)
  //   b) A subsequent prompt that was sent after this one
  let cutIdx = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Pattern: separator line followed by ❯ (Claude Code) or › (Codex) prompt
    if (line.match(/^[─]{5,}$/) && i + 1 < lines.length && lines[i + 1].trim().match(/^[❯›]/)) {
      cutIdx = i;
      break;
    }
  }

  const response = lines.slice(0, cutIdx).join("\n").trim();
  return response;
}

/**
 * Adaptive scrollback capture: start small, expand if response was truncated.
 * Returns the extracted response and the full captured output.
 */
async function adaptiveCapture(
  tmuxSession: string,
  promptText: string,
): Promise<{ response: string; fullCapture: string }> {
  const scrollbacks = [50, 200, 500];

  for (const scrollBack of scrollbacks) {
    const captured = await tmuxCapturePane(tmuxSession, scrollBack);
    const response = extractResponse(captured, promptText);

    if (response !== null) {
      return { response, fullCapture: captured };
    }
  }

  // Fallback: return the largest capture as-is
  const captured = await tmuxCapturePane(tmuxSession, 500);
  return { response: captured, fullCapture: captured };
}

/**
 * Wait for a tmux session to reach a terminal state by polling capture-pane.
 * Two-phase approach:
 * 1. Wait for processing to START (screen changes from initial state)
 * 2. Wait for processing to END (terminal state + quiet period)
 *
 * State detection uses small scrollback (50 lines) for efficiency.
 * Final output uses adaptive scrollback to capture full responses.
 */
async function waitForTmuxIdle(
  tmuxSession: string,
  promptText: string,
  initialScreen: string,
  timeoutMs: number,
  quietMs: number,
  onFinish: FinishCallback,
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 1_000;
  let lastTerminalStateTime: number | null = null;
  let processingStarted = false;

  const poll = async (): Promise<void> => {
    if (Date.now() - startTime > timeoutMs) {
      const { response } = await adaptiveCapture(tmuxSession, promptText);
      onFinish(true, response, "unknown");
      return;
    }

    // State detection: small scrollback (50 lines) — token efficient
    const captured = await tmuxCapturePane(tmuxSession);

    // Phase 1: Wait for processing to start (screen must change)
    if (!processingStarted) {
      if (captured.trim() !== initialScreen.trim()) {
        processingStarted = true;
      } else {
        setTimeout(() => { poll().catch(() => onFinish(true, captured, "unknown")); }, pollInterval);
        return;
      }
    }

    // Phase 2: Wait for terminal state + quiet period
    const stateResult = detectClaudeState(captured);

    if (TERMINAL_STATES.includes(stateResult.state)) {
      if (!lastTerminalStateTime) {
        lastTerminalStateTime = Date.now();
      }
      if (Date.now() - lastTerminalStateTime >= quietMs) {
        // Final capture: adaptive scrollback for full response
        const { response } = await adaptiveCapture(tmuxSession, promptText);
        onFinish(false, response, stateResult.state);
        return;
      }
    } else {
      lastTerminalStateTime = null;
    }

    setTimeout(() => { poll().catch(() => onFinish(true, captured, "unknown")); }, pollInterval);
  };

  // Start polling after a brief delay for the write to reach tmux
  await new Promise((r) => setTimeout(r, 500));
  await poll();
}

/**
 * Wait for a non-tmux session to reach a terminal state using onData listener.
 */
function waitForDataIdle(
  session: { onData: (fn: (data: string) => void) => () => void; onExit: (fn: (code: number) => void) => () => void },
  timeoutMs: number,
  quietMs: number,
  onFinish: FinishCallback,
): void {
  let output = "";
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
    const stateResult = detectClaudeState(cleaned);
    onFinish(timedOut, cleaned, stateResult.state);
  }

  function checkAndStartQuiet(): void {
    const cleaned = stripAnsi(output);
    const stateResult = detectClaudeState(cleaned);

    if (TERMINAL_STATES.includes(stateResult.state)) {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => finish(false), quietMs);
    } else {
      if (quietTimer) {
        clearTimeout(quietTimer);
        quietTimer = null;
      }
    }
  }

  const cleanupData = session.onData((data) => {
    output += data;
    checkAndStartQuiet();
  });

  const cleanupExit = session.onExit(() => {
    finish(false);
  });

  timeoutTimer = setTimeout(() => finish(true), timeoutMs);
}
