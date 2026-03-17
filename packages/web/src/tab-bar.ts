export interface SessionInfo {
  id: string;
  name: string;
  alive: boolean;
  tmuxSession?: string;
}

export interface TabBarCallbacks {
  onSelect(sessionId: string): void;
  onCreate(): void;
  onClose(sessionId: string): void;
}

type Severity = "error" | "warning" | "info";

function severityRank(s: string): number {
  return s === "error" ? 3 : s === "warning" ? 2 : 1;
}

export class TabBar {
  private container: HTMLElement;
  private tabs: SessionInfo[] = [];
  private activeId: string | null = null;
  private callbacks: TabBarCallbacks;
  private badges = new Map<string, { count: number; severity: Severity }>();

  constructor(container: HTMLElement, callbacks: TabBarCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.setupKeyboardShortcuts();
  }

  setTabs(sessions: SessionInfo[], activeId?: string): void {
    this.tabs = sessions;
    if (activeId) this.activeId = activeId;
    this.render();
  }

  setActive(id: string): void {
    this.activeId = id;
    this.render();
  }

  addTab(session: SessionInfo): void {
    this.tabs.push(session);
    this.activeId = session.id;
    this.render();
  }

  removeTab(id: string): void {
    this.tabs = this.tabs.filter((t) => t.id !== id);
    this.badges.delete(id);
    if (this.activeId === id) {
      this.activeId = this.tabs.length > 0 ? this.tabs[this.tabs.length - 1].id : null;
    }
    this.render();
  }

  addBadge(sessionId: string, severity: Severity): void {
    const existing = this.badges.get(sessionId);
    if (existing) {
      existing.count++;
      if (severityRank(severity) > severityRank(existing.severity)) {
        existing.severity = severity;
      }
    } else {
      this.badges.set(sessionId, { count: 1, severity });
    }
    this.render();
  }

  clearBadge(sessionId: string): void {
    if (this.badges.has(sessionId)) {
      this.badges.delete(sessionId);
      this.render();
    }
  }

  getSessionName(sessionId: string): string | undefined {
    return this.tabs.find((t) => t.id === sessionId)?.name;
  }

  hasTab(sessionId: string): boolean {
    return this.tabs.some((t) => t.id === sessionId);
  }

  private render(): void {
    // Preserve the panel toggle button if it exists
    const toggleBtn = this.container.querySelector("#panel-toggle");
    this.container.innerHTML = "";
    if (toggleBtn) this.container.appendChild(toggleBtn);

    for (const tab of this.tabs) {
      const el = document.createElement("div");
      el.className = `tab${tab.id === this.activeId ? " active" : ""}${!tab.alive ? " dead" : ""}`;
      el.dataset.id = tab.id;

      const nameSpan = document.createElement("span");
      nameSpan.className = "tab-name";
      nameSpan.textContent = tab.tmuxSession ? `[T] ${tab.name}` : tab.name;
      el.appendChild(nameSpan);

      // Badge (only for non-active tabs)
      const badge = this.badges.get(tab.id);
      if (badge && tab.id !== this.activeId) {
        const badgeEl = document.createElement("span");
        badgeEl.className = `tab-badge tab-badge-${badge.severity}`;
        badgeEl.textContent = badge.count > 99 ? "99+" : String(badge.count);
        el.appendChild(badgeEl);
      }

      const closeBtn = document.createElement("button");
      closeBtn.className = "tab-close";
      closeBtn.textContent = "×";
      closeBtn.title = "Close session";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onClose(tab.id);
      });
      el.appendChild(closeBtn);

      el.addEventListener("click", () => {
        this.callbacks.onSelect(tab.id);
      });

      this.container.appendChild(el);
    }

    const addBtn = document.createElement("button");
    addBtn.className = "tab-add";
    addBtn.textContent = "+";
    addBtn.title = "New session (Ctrl+T)";
    addBtn.addEventListener("click", () => this.callbacks.onCreate());
    this.container.appendChild(addBtn);
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "t") {
        e.preventDefault();
        this.callbacks.onCreate();
        return;
      }
      if (e.ctrlKey && e.key === "w") {
        e.preventDefault();
        if (this.activeId) {
          this.callbacks.onClose(this.activeId);
        }
        return;
      }
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        if (this.tabs.length <= 1) return;
        const idx = this.tabs.findIndex((t) => t.id === this.activeId);
        const nextIdx = e.shiftKey
          ? (idx - 1 + this.tabs.length) % this.tabs.length
          : (idx + 1) % this.tabs.length;
        this.callbacks.onSelect(this.tabs[nextIdx].id);
      }
    });
  }
}
