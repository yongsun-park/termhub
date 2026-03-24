import * as pty from "node-pty";
import { homedir } from "node:os";
import path from "node:path";

const OUTPUT_BUFFER_MAX = 100_000;

export interface TerminalSessionOptions {
  cwd?: string;
  tmuxSession?: string;
  command?: string;
}

export interface TerminalSessionInfo {
  id: string;
  name: string;
  pid: number;
  cwd: string;
  createdAt: string;
  alive: boolean;
  tmuxSession?: string;
}

export class TerminalSession {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly tmuxSession?: string;
  private readonly initialCwd: string;
  private readonly projectCwd?: string;
  private ptyProcess: pty.IPty;
  private outputBuffer: string = "";
  private alive = true;
  private listeners: Set<(data: string) => void> = new Set();
  private exitListeners: Set<(code: number) => void> = new Set();

  constructor(id: string, name: string, options?: TerminalSessionOptions) {
    this.id = id;
    this.name = name;
    this.createdAt = new Date();
    const rawCwd = options?.cwd || process.env.HOME || "/";
    this.initialCwd = rawCwd.startsWith("~") ? path.join(homedir(), rawCwd.slice(1)) : rawCwd;
    this.tmuxSession = options?.tmuxSession;
    if (options?.projectCwd) {
      const raw = options.projectCwd;
      this.projectCwd = raw.startsWith("~") ? path.join(homedir(), raw.slice(1)) : raw;
    }

    let command: string;
    let args: string[];

    if (this.tmuxSession) {
      command = "tmux";
      args = ["attach", "-t", this.tmuxSession];
    } else {
      command = process.env.SHELL || "bash";
      args = [];
    }

    this.ptyProcess = pty.spawn(command, args, {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: this.initialCwd,
      env: process.env as Record<string, string>,
    });

    this.ptyProcess.onData((data) => {
      this.appendOutput(data);
      for (const listener of this.listeners) {
        listener(data);
      }
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this.alive = false;
      for (const listener of this.exitListeners) {
        listener(exitCode);
      }
    });

    if (options?.command) {
      const cmd = options.command;
      if (this.tmuxSession) {
        const cleanup = this.onData(() => {
          cleanup();
          setTimeout(() => this.write(cmd + "\n"), 500);
        });
      } else {
        setTimeout(() => this.write(cmd + "\n"), 300);
      }
    }
  }

  private appendOutput(data: string): void {
    this.outputBuffer += data;
    if (this.outputBuffer.length > OUTPUT_BUFFER_MAX) {
      this.outputBuffer = this.outputBuffer.slice(-OUTPUT_BUFFER_MAX);
    }
  }

  write(data: string): void {
    if (this.alive) {
      this.ptyProcess.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    if (this.alive) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  getSnapshot(): string {
    return this.outputBuffer;
  }

  onData(listener: (data: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onExit(listener: (code: number) => void): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  isAlive(): boolean {
    return this.alive;
  }

  getInfo(): TerminalSessionInfo {
    return {
      id: this.id,
      name: this.name,
      pid: this.ptyProcess.pid,
      cwd: this.projectCwd || this.initialCwd,
      createdAt: this.createdAt.toISOString(),
      alive: this.alive,
      tmuxSession: this.tmuxSession,
    };
  }

  destroy(): void {
    if (this.alive) {
      // For tmux sessions, killing the PTY process (tmux attach) causes
      // tmux to detach only this client, leaving the session alive.
      this.ptyProcess.kill();
      this.alive = false;
    }
    this.listeners.clear();
    this.exitListeners.clear();
  }
}
