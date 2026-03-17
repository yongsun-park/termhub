import { icon } from "./icons.js";

export interface ActionBarCallbacks {
  onSendCommand(command: string, waitForIdle: boolean): void;
  onKillSession(): void;
}

export class ActionBar {
  private container: HTMLElement;
  private cwdEl: HTMLElement;
  private buttonsEl: HTMLElement;
  private copyBtn: HTMLElement;
  private killBtn: HTMLElement;
  private callbacks: ActionBarCallbacks;
  private currentCwd: string | null = null;
  private currentTmuxSession: string | null = null;
  private currentSessionName: string | null = null;
  private busy = false;

  constructor(parent: HTMLElement, callbacks: ActionBarCallbacks) {
    this.callbacks = callbacks;

    this.container = document.createElement("div");
    this.container.className = "action-bar hidden";

    this.cwdEl = document.createElement("span");
    this.cwdEl.className = "action-bar-cwd";
    this.container.appendChild(this.cwdEl);

    this.buttonsEl = document.createElement("div");
    this.buttonsEl.className = "action-bar-buttons";

    this.buttonsEl.appendChild(this.createButton("Claude RC", "radio", "claude --remote-control", false));
    this.buttonsEl.appendChild(this.createButton("Claude", "sparkles", "claude", true));
    this.buttonsEl.appendChild(this.createButton("Codex", "zap", "codex", true));

    // Copy tmux attach command button
    this.copyBtn = document.createElement("button");
    this.copyBtn.className = "action-bar-btn action-bar-copy";
    this.copyBtn.appendChild(icon("clipboard", 12));
    const copyText = document.createElement("span");
    copyText.textContent = "SSH";
    this.copyBtn.appendChild(copyText);
    this.copyBtn.title = "Copy SSH + tmux attach command";
    this.copyBtn.addEventListener("click", () => this.copyAttachCommand());
    this.buttonsEl.appendChild(this.copyBtn);

    // Kill tmux session button (rightmost — destructive action)
    this.killBtn = document.createElement("button");
    this.killBtn.className = "action-bar-btn action-bar-kill";
    this.killBtn.appendChild(icon("x", 12));
    const killText = document.createElement("span");
    killText.textContent = "Kill";
    this.killBtn.appendChild(killText);
    this.killBtn.title = "Kill tmux session";
    this.killBtn.addEventListener("click", () => this.confirmKill());
    this.buttonsEl.appendChild(this.killBtn);

    this.container.appendChild(this.buttonsEl);

    parent.insertBefore(this.container, parent.firstChild);
  }

  private createButton(label: string, iconName: "radio" | "sparkles" | "zap", command: string, waitForIdle: boolean): HTMLElement {
    const btn = document.createElement("button");
    btn.className = `action-bar-btn action-bar-${iconName}`;
    btn.appendChild(icon(iconName, 12));
    const text = document.createElement("span");
    text.textContent = label;
    btn.appendChild(text);
    btn.addEventListener("click", () => {
      if (this.busy) return;
      this.setBusy(true);
      this.callbacks.onSendCommand(command, waitForIdle);
    });
    return btn;
  }

  private copyAttachCommand(): void {
    if (!this.currentTmuxSession) return;
    const host = location.hostname;
    const cmd = `ssh ${host} -t "tmux attach -t '${this.currentTmuxSession}'"`;
    navigator.clipboard.writeText(cmd).then(() => {
      this.copyBtn.innerHTML = "";
      this.copyBtn.appendChild(icon("check", 12));
      const text = document.createElement("span");
      text.textContent = "Copied!";
      this.copyBtn.appendChild(text);
      setTimeout(() => {
        this.copyBtn.innerHTML = "";
        this.copyBtn.appendChild(icon("clipboard", 12));
        const t = document.createElement("span");
        t.textContent = "SSH";
        this.copyBtn.appendChild(t);
      }, 1500);
    });
  }

  update(cwd: string | null, alive: boolean, tmuxSession?: string | null, sessionName?: string | null): void {
    if (!cwd || !alive) {
      this.container.classList.add("hidden");
      this.currentCwd = null;
      this.currentTmuxSession = null;
      this.currentSessionName = null;
      return;
    }
    this.currentCwd = cwd;
    this.currentTmuxSession = tmuxSession ?? null;
    this.currentSessionName = sessionName ?? null;
    const abbreviated = cwd.replace(/^\/home\/[^/]+/, "~");
    this.cwdEl.textContent = abbreviated;
    this.cwdEl.title = cwd;
    this.container.classList.remove("hidden");
    this.setBusy(false);

    // Show/hide tmux-specific buttons
    const hasTmux = !!tmuxSession;
    this.copyBtn.style.display = hasTmux ? "" : "none";
    this.killBtn.style.display = hasTmux ? "" : "none";
  }

  private confirmKill(): void {
    const name = this.currentSessionName || this.currentTmuxSession || "this session";
    if (confirm(`"${name}" 세션을 종료하시겠습니까?\n\ntmux 세션이 완전히 종료됩니다.`)) {
      this.callbacks.onKillSession();
    }
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.buttonsEl.classList.toggle("busy", busy);
  }

  hide(): void {
    this.container.classList.add("hidden");
  }
}
