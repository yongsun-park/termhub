export interface SessionCardInfo {
  id: string;
  name: string;
  pid: number;
  cwd: string;
  createdAt: string;
  alive: boolean;
  tmuxSession?: string;
}

export interface TmuxSessionCardInfo {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
  ailyAttached: boolean;
}

export interface SidePanelCallbacks {
  onSelectSession(sessionId: string): void;
  onAttachTmux(sessionName: string): void;
}

export class SidePanel {
  private container: HTMLElement;
  private ailyListEl: HTMLElement;
  private tmuxListEl: HTMLElement;
  private toggleBtn: HTMLElement;
  private callbacks: SidePanelCallbacks;
  private open = false;
  private sessions: SessionCardInfo[] = [];
  private tmuxSessions: TmuxSessionCardInfo[] = [];
  private activeSessionId: string | null = null;
  private badges = new Map<string, { count: number; severity: string }>();

  constructor(
    container: HTMLElement,
    toggleBtn: HTMLElement,
    callbacks: SidePanelCallbacks
  ) {
    this.container = container;
    this.toggleBtn = toggleBtn;
    this.callbacks = callbacks;

    // Aily Sessions section
    const ailyHeader = document.createElement("div");
    ailyHeader.className = "side-panel-header";
    ailyHeader.textContent = "Aily Sessions";
    this.container.appendChild(ailyHeader);

    this.ailyListEl = document.createElement("div");
    this.ailyListEl.className = "side-panel-list";
    this.container.appendChild(this.ailyListEl);

    // tmux Sessions section
    const tmuxHeader = document.createElement("div");
    tmuxHeader.className = "side-panel-header";
    tmuxHeader.textContent = "tmux Sessions";
    this.container.appendChild(tmuxHeader);

    this.tmuxListEl = document.createElement("div");
    this.tmuxListEl.className = "side-panel-list";
    this.container.appendChild(this.tmuxListEl);

    this.toggleBtn.addEventListener("click", () => this.toggle());

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "b") {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  toggle(): void {
    this.open = !this.open;
    this.container.classList.toggle("open", this.open);
    this.toggleBtn.classList.toggle("active", this.open);
  }

  isOpen(): boolean {
    return this.open;
  }

  setSessions(sessions: SessionCardInfo[], activeId?: string): void {
    this.sessions = sessions;
    if (activeId) this.activeSessionId = activeId;
    this.renderAily();
  }

  setTmuxSessions(sessions: TmuxSessionCardInfo[]): void {
    this.tmuxSessions = sessions;
    this.renderTmux();
  }

  setActive(sessionId: string): void {
    this.activeSessionId = sessionId;
    this.renderAily();
  }

  addBadge(sessionId: string, severity: string): void {
    const existing = this.badges.get(sessionId);
    if (existing) {
      existing.count++;
    } else {
      this.badges.set(sessionId, { count: 1, severity });
    }
    this.renderAily();
  }

  clearBadge(sessionId: string): void {
    if (this.badges.has(sessionId)) {
      this.badges.delete(sessionId);
      this.renderAily();
    }
  }

  private renderAily(): void {
    this.ailyListEl.innerHTML = "";

    for (const session of this.sessions) {
      const card = document.createElement("div");
      card.className = `session-card${session.id === this.activeSessionId ? " active" : ""}`;

      const header = document.createElement("div");
      header.className = "session-card-header";

      const status = document.createElement("span");
      status.className = `session-status ${session.alive ? "alive" : "dead"}`;
      status.textContent = session.alive ? "●" : "○";
      header.appendChild(status);

      const name = document.createElement("span");
      name.className = "session-card-name";
      name.textContent = session.name;
      header.appendChild(name);

      const badge = this.badges.get(session.id);
      if (badge) {
        const badgeEl = document.createElement("span");
        badgeEl.className = `session-card-badge badge-${badge.severity}`;
        badgeEl.textContent = badge.count > 99 ? "99+" : String(badge.count);
        header.appendChild(badgeEl);
      }

      card.appendChild(header);

      const meta = document.createElement("div");
      meta.className = "session-card-meta";
      const time = new Date(session.createdAt);
      const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      meta.textContent = `PID ${session.pid} · ${timeStr}`;
      card.appendChild(meta);

      const cwdEl = document.createElement("div");
      cwdEl.className = "session-card-cwd";
      cwdEl.textContent = session.cwd;
      cwdEl.title = session.cwd;
      card.appendChild(cwdEl);

      card.addEventListener("click", () => {
        this.callbacks.onSelectSession(session.id);
      });

      this.ailyListEl.appendChild(card);
    }
  }

  private renderTmux(): void {
    this.tmuxListEl.innerHTML = "";

    if (this.tmuxSessions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "side-panel-empty";
      empty.textContent = "No tmux sessions";
      this.tmuxListEl.appendChild(empty);
      return;
    }

    for (const tmux of this.tmuxSessions) {
      const card = document.createElement("div");
      card.className = "session-card tmux-card";

      const header = document.createElement("div");
      header.className = "session-card-header";

      const icon = document.createElement("span");
      icon.className = "session-status alive";
      icon.textContent = "T";
      icon.style.fontSize = "9px";
      icon.style.fontWeight = "700";
      header.appendChild(icon);

      const name = document.createElement("span");
      name.className = "session-card-name";
      name.textContent = tmux.name;
      header.appendChild(name);

      if (tmux.ailyAttached) {
        const badge = document.createElement("span");
        badge.className = "session-card-badge badge-info";
        badge.textContent = "connected";
        badge.style.fontSize = "9px";
        header.appendChild(badge);
      }

      card.appendChild(header);

      const meta = document.createElement("div");
      meta.className = "session-card-meta";
      const time = new Date(tmux.created);
      const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      meta.textContent = `${tmux.windows} window${tmux.windows !== 1 ? "s" : ""} · ${timeStr}`;
      card.appendChild(meta);

      card.addEventListener("click", () => {
        this.callbacks.onAttachTmux(tmux.name);
      });

      this.tmuxListEl.appendChild(card);
    }
  }
}
