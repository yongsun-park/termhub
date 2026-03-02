import { loadConfig } from "./config.js";

export class ApiClient {
  private url: string;
  private token: string;

  constructor() {
    const config = loadConfig();
    this.url = config.url.replace(/\/$/, "");
    this.token = config.token;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.url}${path}`, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      let msg: string;
      try {
        msg = JSON.parse(text).error || text;
      } catch {
        msg = text;
      }
      throw new Error(`HTTP ${res.status}: ${msg}`);
    }
    return res.json() as Promise<T>;
  }

  async login(password: string): Promise<string> {
    const data = await this.request<{ token: string }>("POST", "/api/login", { password });
    return data.token;
  }

  async sessionsList(): Promise<unknown[]> {
    return this.request<unknown[]>("GET", "/api/sessions");
  }

  async sessionsCreate(name?: string, cwd?: string): Promise<unknown> {
    return this.request<unknown>("POST", "/api/sessions", { name, cwd });
  }

  async sessionsDelete(id: string): Promise<void> {
    await this.request<unknown>("DELETE", `/api/sessions/${id}`);
  }

  async exec(id: string, command: string, opts?: { quietMs?: number; timeoutMs?: number; endPattern?: string }): Promise<{ output: string; timedOut: boolean; durationMs: number }> {
    return this.request("POST", `/api/sessions/${id}/exec`, { command, ...opts });
  }

  async output(id: string, last?: number): Promise<{ output: string }> {
    const query = last ? `?last=${last}` : "";
    return this.request("GET", `/api/sessions/${id}/output${query}`);
  }

  async write(id: string, data: string): Promise<void> {
    await this.request("POST", `/api/sessions/${id}/write`, { data });
  }

  async tmuxList(): Promise<unknown[]> {
    return this.request<unknown[]>("GET", "/api/tmux-sessions");
  }

  async tmuxAttach(name: string): Promise<unknown> {
    return this.request<unknown>("POST", "/api/sessions", { tmuxSession: name });
  }

  async send(
    id: string,
    text: string,
    opts?: { submit?: boolean; waitForIdle?: boolean; timeoutMs?: number; quietMs?: number },
  ): Promise<{ output: string; state: string; sessionId: string; autoAttached: boolean; durationMs: number; timedOut: boolean }> {
    return this.request("POST", `/api/sessions/${id}/send`, { text, ...opts });
  }

  async status(id: string): Promise<{ state: string; pattern?: string; sessionId: string; alive: boolean }> {
    return this.request("GET", `/api/sessions/${id}/status`);
  }

  streamUrl(id: string): string {
    return `${this.url}/api/sessions/${id}/stream`;
  }

  getToken(): string {
    return this.token;
  }
}
