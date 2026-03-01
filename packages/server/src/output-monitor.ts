export type AlertSeverity = "error" | "warning" | "info";

export interface AlertPattern {
  id: string;
  name: string;
  pattern: RegExp;
  severity: AlertSeverity;
  category: "error" | "completion" | "approval" | "custom";
  debounceMs?: number;
}

export interface Alert {
  id: string;
  sessionId: string;
  patternId: string;
  severity: AlertSeverity;
  category: string;
  message: string;
  timestamp: string;
}

export type AlertListener = (alert: Alert) => void;

import { stripAnsi } from "./ansi.js";

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_PATTERNS: AlertPattern[] = [
  // Errors
  { id: "stack-trace", name: "Stack Trace", pattern: /^\s+at\s+.+\(.+:\d+:\d+\)/, severity: "error", category: "error", debounceMs: 2000 },
  { id: "node-error", name: "Node Error", pattern: /^(Error|TypeError|ReferenceError|SyntaxError|RangeError):/, severity: "error", category: "error" },
  { id: "npm-err", name: "npm ERR!", pattern: /^npm ERR!/, severity: "error", category: "error", debounceMs: 3000 },
  { id: "command-fail", name: "Command Not Found", pattern: /: command not found$/, severity: "error", category: "error" },
  { id: "permission-denied", name: "Permission Denied", pattern: /permission denied/i, severity: "error", category: "error" },

  // Completion
  { id: "task-complete", name: "Task Complete", pattern: /Task completed|Done!|completed successfully/i, severity: "info", category: "completion" },

  // Approval
  { id: "approval-prompt", name: "Approval Prompt", pattern: /Do you want to proceed\?|Allow this action\?|Press Enter to continue/i, severity: "warning", category: "approval" },
  { id: "yes-no-prompt", name: "Yes/No Prompt", pattern: /\(y\/n\)|\(yes\/no\)/i, severity: "warning", category: "approval" },
];

export class OutputMonitor {
  private patterns: AlertPattern[];
  private listeners = new Set<AlertListener>();
  private lineBuffers = new Map<string, string>();
  private lastAlertTime = new Map<string, number>();
  private flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(patterns?: AlertPattern[]) {
    this.patterns = patterns ?? [...DEFAULT_PATTERNS];
  }

  feed(sessionId: string, rawData: string): void {
    const clean = stripAnsi(rawData);
    const buffer = (this.lineBuffers.get(sessionId) ?? "") + clean;
    const lines = buffer.split("\n");
    this.lineBuffers.set(sessionId, lines.pop() ?? "");

    for (const line of lines) {
      if (!line.trim()) continue;
      this.matchLine(sessionId, line);
    }

    // Flush unterminated buffer after 500ms for prompts that don't end with \n
    this.scheduleFlush(sessionId);
  }

  private scheduleFlush(sessionId: string): void {
    const existing = this.flushTimers.get(sessionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.flushTimers.delete(sessionId);
      const remaining = this.lineBuffers.get(sessionId) ?? "";
      if (!remaining.trim()) return;
      this.matchLine(sessionId, remaining);
      this.lineBuffers.set(sessionId, "");
    }, 500);
    this.flushTimers.set(sessionId, timer);
  }

  private matchLine(sessionId: string, line: string): void {
    for (const pat of this.patterns) {
      if (pat.pattern.test(line)) {
        const debounceKey = `${sessionId}:${pat.id}`;
        const now = Date.now();
        const last = this.lastAlertTime.get(debounceKey) ?? 0;
        if (pat.debounceMs && now - last < pat.debounceMs) continue;
        this.lastAlertTime.set(debounceKey, now);

        const alert: Alert = {
          id: randomId(),
          sessionId,
          patternId: pat.id,
          severity: pat.severity,
          category: pat.category,
          message: line.slice(0, 200),
          timestamp: new Date().toISOString(),
        };

        for (const listener of this.listeners) {
          listener(alert);
        }
        break;
      }
    }
  }

  onAlert(listener: AlertListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  removeSession(sessionId: string): void {
    this.lineBuffers.delete(sessionId);
    const timer = this.flushTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(sessionId);
    }
    for (const key of this.lastAlertTime.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        this.lastAlertTime.delete(key);
      }
    }
  }
}
