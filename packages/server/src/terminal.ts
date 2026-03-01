import * as pty from "node-pty";

const OUTPUT_BUFFER_MAX = 100_000;

export interface TerminalSessionInfo {
  id: string;
  name: string;
  pid: number;
  cwd: string;
  createdAt: string;
  alive: boolean;
}

export class TerminalSession {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  private readonly initialCwd: string;
  private ptyProcess: pty.IPty;
  private outputBuffer: string = "";
  private alive = true;
  private listeners: Set<(data: string) => void> = new Set();
  private exitListeners: Set<(code: number) => void> = new Set();

  constructor(id: string, name: string, cwd?: string) {
    this.id = id;
    this.name = name;
    this.createdAt = new Date();
    this.initialCwd = cwd || process.env.HOME || "/";

    const shell = process.env.SHELL || "bash";
    this.ptyProcess = pty.spawn(shell, [], {
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
      cwd: this.initialCwd,
      createdAt: this.createdAt.toISOString(),
      alive: this.alive,
    };
  }

  destroy(): void {
    if (this.alive) {
      this.ptyProcess.kill();
      this.alive = false;
    }
    this.listeners.clear();
    this.exitListeners.clear();
  }
}
