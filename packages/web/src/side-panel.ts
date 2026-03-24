import { icon } from "./icons.js";
import type { DetectedTool } from "./tab-bar.js";

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
  termhubAttached: boolean;
}

export interface ProjectInfo {
  name: string;
  path: string;
  hasGit: boolean;
  pinned?: boolean;
  submodules?: ProjectInfo[];
}

export interface SidePanelCallbacks {
  onSelectSession(sessionId: string): void;
  onCloseSession(sessionId: string, killTmux: boolean): void;
  onAttachTmux(sessionName: string): void;
  onLaunchProject(project: ProjectInfo): void;
  onTogglePin(projectPath: string, pinned: boolean): void;
}

type PanelTab = "projects" | "sessions";

export class SidePanel {
  private container: HTMLElement;
  private projectsPane: HTMLElement;
  private sessionsPane: HTMLElement;
  private projectListEl: HTMLElement;
  private projectSectionEl: HTMLElement;
  private projectSearchEl: HTMLInputElement;
  private activeListEl: HTMLElement;
  private toggleBtn: HTMLElement;
  private backdrop: HTMLElement;
  private callbacks: SidePanelCallbacks;
  private isOpen = false;
  private activeTab: PanelTab = "projects";
  private sessions: SessionCardInfo[] = [];
  private tmuxSessions: TmuxSessionCardInfo[] = [];
  private projects: ProjectInfo[] = [];
  private activeSessionId: string | null = null;
  private badges = new Map<string, { count: number; severity: string }>();
  private toolStates = new Map<string, DetectedTool>();
  private projectStates = new Map<string, "launching" | "error">();
  private projectSectionState: "loading" | "error" | "ready" = "loading";
  private expandedProjects = new Set<string>();
  private selectedProject: string | null = null;
  private projectFilter = "";

  private tabBtnProjects!: HTMLElement;
  private tabBtnSessions!: HTMLElement;

  constructor(
    container: HTMLElement,
    toggleBtn: HTMLElement,
    callbacks: SidePanelCallbacks
  ) {
    this.container = container;
    this.toggleBtn = toggleBtn;
    this.callbacks = callbacks;

    // Backdrop for mobile overlay
    this.backdrop = document.createElement("div");
    this.backdrop.className = "side-panel-backdrop";
    document.body.appendChild(this.backdrop);
    this.backdrop.addEventListener("click", () => this.close());

    // --- Tab bar ---
    const tabBar = document.createElement("div");
    tabBar.className = "sp-tab-bar";

    this.tabBtnProjects = this.createTabBtn("projects", "Projects", "folder-git");
    this.tabBtnSessions = this.createTabBtn("sessions", "Sessions", "monitor");
    tabBar.appendChild(this.tabBtnProjects);
    tabBar.appendChild(this.tabBtnSessions);

    const closeBtn = document.createElement("button");
    closeBtn.className = "sp-close-btn";
    closeBtn.appendChild(icon("x", 18));
    closeBtn.addEventListener("click", () => this.close());
    tabBar.appendChild(closeBtn);

    this.container.appendChild(tabBar);

    // --- Projects pane ---
    this.projectsPane = document.createElement("div");
    this.projectsPane.className = "sp-pane";

    this.projectSearchEl = document.createElement("input");
    this.projectSearchEl.className = "side-panel-search";
    this.projectSearchEl.type = "text";
    this.projectSearchEl.placeholder = "Filter...";
    this.projectSearchEl.addEventListener("input", () => {
      this.projectFilter = this.projectSearchEl.value.toLowerCase();
      this.renderProjects();
    });
    this.projectsPane.appendChild(this.projectSearchEl);

    this.projectSectionEl = document.createElement("div");
    this.projectSectionEl.className = "side-panel-section-status";
    this.projectsPane.appendChild(this.projectSectionEl);

    this.projectListEl = document.createElement("div");
    this.projectListEl.className = "side-panel-list";
    this.projectsPane.appendChild(this.projectListEl);

    this.container.appendChild(this.projectsPane);

    // --- Sessions pane ---
    this.sessionsPane = document.createElement("div");
    this.sessionsPane.className = "sp-pane hidden";

    this.activeListEl = document.createElement("div");
    this.activeListEl.className = "side-panel-list";
    this.sessionsPane.appendChild(this.activeListEl);

    this.container.appendChild(this.sessionsPane);

    // --- Events ---
    this.toggleBtn.addEventListener("click", () => this.toggle());

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "b") {
        e.preventDefault();
        this.toggle();
      }
    });

    this.updateTabBar();
    this.renderProjects();
  }

  private createTabBtn(tab: PanelTab, label: string, iconName: "folder-git" | "monitor"): HTMLElement {
    const btn = document.createElement("button");
    btn.className = "sp-tab-btn";
    btn.dataset.tab = tab;

    btn.appendChild(icon(iconName, 14));

    const text = document.createElement("span");
    text.textContent = label;
    btn.appendChild(text);

    const badge = document.createElement("span");
    badge.className = "sp-tab-badge";
    btn.appendChild(badge);

    btn.addEventListener("click", () => {
      this.activeTab = tab;
      this.updateTabBar();
    });
    return btn;
  }

  private updateTabBar(): void {
    this.tabBtnProjects.classList.toggle("active", this.activeTab === "projects");
    this.tabBtnSessions.classList.toggle("active", this.activeTab === "sessions");

    this.projectsPane.classList.toggle("hidden", this.activeTab !== "projects");
    this.sessionsPane.classList.toggle("hidden", this.activeTab !== "sessions");

    const sessionsBadge = this.tabBtnSessions.querySelector(".sp-tab-badge")!;
    const count = this.sessions.length + this.tmuxSessions.filter((t) => !t.termhubAttached).length;
    sessionsBadge.textContent = count > 0 ? String(count) : "";
    sessionsBadge.classList.toggle("visible", count > 0);

    const projectsBadge = this.tabBtnProjects.querySelector(".sp-tab-badge")!;
    const pCount = this.projects.length;
    projectsBadge.textContent = pCount > 0 ? String(pCount) : "";
    projectsBadge.classList.toggle("visible", pCount > 0);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.container.classList.add("open");
    this.toggleBtn.classList.add("active");
    this.backdrop.classList.add("visible");
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.container.classList.remove("open");
    this.toggleBtn.classList.remove("active");
    this.backdrop.classList.remove("visible");
  }

  getIsOpen(): boolean {
    return this.isOpen;
  }

  showSessions(): void {
    this.activeTab = "sessions";
    this.updateTabBar();
  }

  // --- Project methods ---
  setProjects(projects: ProjectInfo[]): void {
    this.projects = projects;
    this.projectSectionState = "ready";
    this.renderProjects();
    this.updateTabBar();
  }

  setProjectsError(): void {
    this.projectSectionState = "error";
    this.renderProjects();
  }

  setProjectLaunching(path: string): void {
    this.projectStates.set(path, "launching");
    this.renderProjects();
  }

  setProjectError(path: string): void {
    this.projectStates.set(path, "error");
    this.renderProjects();
  }

  clearProjectState(path: string): void {
    this.projectStates.delete(path);
    this.selectedProject = null;
    this.renderProjects();
  }

  isProjectLaunching(path: string): boolean {
    return this.projectStates.get(path) === "launching";
  }

  // --- Session methods ---
  setSessions(sessions: SessionCardInfo[], activeId?: string): void {
    this.sessions = sessions;
    if (activeId) this.activeSessionId = activeId;
    this.renderActive();
    this.updateTabBar();
  }

  setTmuxSessions(sessions: TmuxSessionCardInfo[]): void {
    this.tmuxSessions = sessions;
    this.renderActive();
    this.updateTabBar();
  }

  setActive(sessionId: string): void {
    this.activeSessionId = sessionId;
    this.renderActive();
  }

  addBadge(sessionId: string, severity: string): void {
    const existing = this.badges.get(sessionId);
    if (existing) {
      existing.count++;
    } else {
      this.badges.set(sessionId, { count: 1, severity });
    }
    this.renderActive();
  }

  setToolState(sessionId: string, tool: DetectedTool): void {
    const prev = this.toolStates.get(sessionId);
    if (prev !== tool) {
      this.toolStates.set(sessionId, tool);
      this.renderActive();
    }
  }

  clearBadge(sessionId: string): void {
    if (this.badges.has(sessionId)) {
      this.badges.delete(sessionId);
      this.renderActive();
    }
  }

  // --- Render: Projects ---
  private renderProjects(): void {
    this.projectSectionEl.innerHTML = "";
    this.projectListEl.innerHTML = "";

    if (this.projectSectionState === "loading") {
      this.projectSectionEl.innerHTML = '<div class="side-panel-empty">Loading projects...</div>';
      return;
    }

    if (this.projectSectionState === "error") {
      this.projectSectionEl.innerHTML = '<div class="side-panel-empty project-section-error">Failed to load projects</div>';
      return;
    }

    const filtered = this.projectFilter
      ? this.projects.filter((p) => p.name.toLowerCase().includes(this.projectFilter))
      : this.projects;

    const pinned = filtered.filter((p) => p.pinned);
    const unpinned = filtered.filter((p) => !p.pinned);

    this.projectSearchEl.style.display = this.projects.length > 6 ? "" : "none";

    if (filtered.length === 0) {
      const msg = this.projectFilter ? "No matching projects" : "No projects found";
      this.projectListEl.innerHTML = `<div class="side-panel-empty">${msg}</div>`;
      return;
    }

    for (const project of pinned) {
      this.appendProjectWithSubs(project);
    }

    if (pinned.length > 0 && unpinned.length > 0) {
      const divider = document.createElement("div");
      divider.className = "pin-divider";
      this.projectListEl.appendChild(divider);
    }

    for (const project of unpinned) {
      this.appendProjectWithSubs(project);
    }
  }

  private appendProjectWithSubs(project: ProjectInfo): void {
    this.projectListEl.appendChild(this.createProjectCard(project, false));
    if (project.submodules?.length && this.expandedProjects.has(project.path)) {
      for (const sub of project.submodules) {
        this.projectListEl.appendChild(this.createProjectCard(sub, true));
      }
    }
  }

  private createProjectCard(project: ProjectInfo, isSub: boolean): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "project-card-wrapper";

    const card = document.createElement("div");
    const state = this.projectStates.get(project.path);
    card.className = `project-card${state ? ` ${state}` : ""}${isSub ? " submodule" : ""}`;

    const header = document.createElement("div");
    header.className = "project-card-header";

    // Folder icon
    const folderIcon = icon(isSub ? "folder-open" : "folder-git", 14);
    folderIcon.classList.add("project-card-icon");
    header.appendChild(folderIcon);

    // Expand toggle for submodules
    const parentProject = isSub ? null : this.projects.find((p) => p.path === project.path);
    const hasSubs = parentProject?.submodules && parentProject.submodules.length > 0;

    if (hasSubs) {
      const expand = document.createElement("span");
      expand.className = "project-card-expand";
      const isExpanded = this.expandedProjects.has(project.path);
      expand.appendChild(icon(isExpanded ? "chevron-down" : "chevron-right", 12));
      expand.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.expandedProjects.has(project.path)) {
          this.expandedProjects.delete(project.path);
        } else {
          this.expandedProjects.add(project.path);
        }
        this.renderProjects();
      });
      header.appendChild(expand);
    }

    const name = document.createElement("span");
    name.className = "project-card-name";
    name.textContent = project.name;
    header.appendChild(name);

    // Pin button (not for submodules)
    if (!isSub) {
      const pin = document.createElement("span");
      pin.className = `project-card-pin${project.pinned ? " pinned" : ""}`;
      const starIcon = icon("star", 13);
      if (project.pinned) starIcon.style.fill = "currentColor";
      pin.appendChild(starIcon);
      pin.title = project.pinned ? "Unpin" : "Pin to top";
      pin.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onTogglePin(project.path, !project.pinned);
      });
      header.appendChild(pin);
    }

    if (state === "launching") {
      const spinner = icon("loader", 14);
      spinner.classList.add("spinning");
      header.appendChild(spinner);
    }

    card.appendChild(header);

    const abbreviated = project.path.replace(/^\/home\/[^/]+/, "~");
    card.title = abbreviated;

    card.addEventListener("click", () => {
      if (state === "launching") return;
      this.callbacks.onLaunchProject(project);
    });

    wrapper.appendChild(card);
    return wrapper;
  }

  // --- Render: Active Sessions ---
  private renderActive(): void {
    this.activeListEl.innerHTML = "";

    for (const session of this.sessions) {
      const card = document.createElement("div");
      card.className = `session-card${session.id === this.activeSessionId ? " active" : ""}`;

      const header = document.createElement("div");
      header.className = "session-card-header";

      const tool = this.toolStates.get(session.id) || "shell";
      const toolIcon = !session.alive ? icon("circle", 12)
        : tool === "claude" ? icon("sparkles", 12)
        : tool === "codex" ? icon("zap", 12)
        : icon("terminal", 12);
      toolIcon.classList.add("session-status", session.alive ? `tool-${tool}` : "dead");
      header.appendChild(toolIcon);

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

      // Copy tmux attach command button
      if (session.tmuxSession) {
        const copyBtn = document.createElement("span");
        copyBtn.className = "session-card-copy";
        copyBtn.appendChild(icon("clipboard", 12));
        copyBtn.title = "Copy SSH + tmux attach command";
        copyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const host = location.hostname;
          const cmd = `ssh ${host} -t "tmux attach -t '${session.tmuxSession}'"`;
          navigator.clipboard.writeText(cmd).then(() => {
            copyBtn.innerHTML = "";
            copyBtn.appendChild(icon("check", 12));
            setTimeout(() => {
              copyBtn.innerHTML = "";
              copyBtn.appendChild(icon("clipboard", 12));
            }, 1500);
          });
        });
        header.appendChild(copyBtn);
      }

      // Detach / close button
      const closeBtn = document.createElement("span");
      closeBtn.className = "session-card-close";
      closeBtn.appendChild(icon("x", 12));
      closeBtn.title = session.tmuxSession ? "Detach (keep tmux alive)" : "Close session";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onCloseSession(session.id, false);
      });
      header.appendChild(closeBtn);

      card.appendChild(header);

      const meta = document.createElement("div");
      meta.className = "session-card-meta";
      const time = new Date(session.createdAt);
      const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      meta.textContent = `PID ${session.pid} · ${timeStr}`;
      card.appendChild(meta);

      const abbreviated = session.cwd.replace(/^\/home\/[^/]+/, "~");
      card.title = abbreviated;

      card.addEventListener("click", () => {
        this.callbacks.onSelectSession(session.id);
      });

      this.activeListEl.appendChild(card);
    }

    // Unattached tmux sessions
    const unattachedTmux = this.tmuxSessions.filter((t) => !t.termhubAttached);
    for (const tmux of unattachedTmux) {
      const card = document.createElement("div");
      card.className = "session-card tmux-card";

      const header = document.createElement("div");
      header.className = "session-card-header";

      const tmuxIcon = icon("terminal", 12);
      tmuxIcon.classList.add("session-status", "alive");
      header.appendChild(tmuxIcon);

      const name = document.createElement("span");
      name.className = "session-card-name";
      name.textContent = tmux.name;
      header.appendChild(name);

      card.appendChild(header);

      const meta = document.createElement("div");
      meta.className = "session-card-meta";
      const time = new Date(tmux.created);
      const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      meta.textContent = `${tmux.windows} win · ${timeStr} · tmux`;
      card.appendChild(meta);

      card.addEventListener("click", () => {
        this.callbacks.onAttachTmux(tmux.name);
      });

      this.activeListEl.appendChild(card);
    }

    const totalCount = this.sessions.length + unattachedTmux.length;
    if (totalCount === 0) {
      this.activeListEl.innerHTML = '<div class="side-panel-empty">No active sessions</div>';
    }
  }
}
