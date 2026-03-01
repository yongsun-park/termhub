export interface SessionInfo {
  id: string;
  name: string;
  alive: boolean;
}

export interface TabBarCallbacks {
  onSelect(sessionId: string): void;
  onCreate(): void;
  onClose(sessionId: string): void;
}

export class TabBar {
  private container: HTMLElement;
  private tabs: SessionInfo[] = [];
  private activeId: string | null = null;
  private callbacks: TabBarCallbacks;

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
    if (this.activeId === id) {
      this.activeId = this.tabs.length > 0 ? this.tabs[this.tabs.length - 1].id : null;
    }
    this.render();
  }

  private render(): void {
    this.container.innerHTML = "";

    for (const tab of this.tabs) {
      const el = document.createElement("div");
      el.className = `tab${tab.id === this.activeId ? " active" : ""}${!tab.alive ? " dead" : ""}`;
      el.dataset.id = tab.id;

      const nameSpan = document.createElement("span");
      nameSpan.className = "tab-name";
      nameSpan.textContent = tab.name;
      el.appendChild(nameSpan);

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
      // Ctrl+T: new tab
      if (e.ctrlKey && e.key === "t") {
        e.preventDefault();
        this.callbacks.onCreate();
        return;
      }
      // Ctrl+W: close tab
      if (e.ctrlKey && e.key === "w") {
        e.preventDefault();
        if (this.activeId) {
          this.callbacks.onClose(this.activeId);
        }
        return;
      }
      // Ctrl+Tab: next tab
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
