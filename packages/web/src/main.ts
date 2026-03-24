import { createTerminal, type TerminalHandle } from "./terminal.js";
import { TabBar, type SessionInfo } from "./tab-bar.js";
import {
  SidePanel,
  type SessionCardInfo,
  type TmuxSessionCardInfo,
  type ProjectInfo,
} from "./side-panel.js";
import { ActionBar } from "./action-bar.js";
import { ToastManager } from "./toast.js";
import { NotificationManager } from "./notifications.js";
import "@xterm/xterm/css/xterm.css";
import "./style.css";

const API_BASE = "";
let token: string | null = localStorage.getItem("termhub_token");
let ws: WebSocket | null = null;
let currentSessionId: string | null = null;
const terminalHandles = new Map<string, TerminalHandle>();

// --- DOM elements ---
const loginScreen = document.getElementById("login-screen")!;
const loginForm = document.getElementById("login-form") as HTMLFormElement;
const loginError = document.getElementById("login-error")!;
const appScreen = document.getElementById("app-screen")!;
const tabBarEl = document.getElementById("tab-bar")!;
const terminalContainer = document.getElementById("terminal-container")!;
const sidePanelEl = document.getElementById("side-panel")!;
const panelToggleBtn = document.getElementById("panel-toggle")!;
const terminalAreaEl = document.getElementById("terminal-area")!;

// --- Managers ---
const toastManager = new ToastManager();
const notificationManager = new NotificationManager();

function isMobile(): boolean {
  return window.innerWidth <= 600;
}

// --- API helpers ---
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    token = null;
    localStorage.removeItem("termhub_token");
    showLogin();
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// --- Tab bar ---
const tabBar = new TabBar(tabBarEl, {
  onSelect: (id) => switchSession(id),
  onCreate: () => createSession(),
  onClose: (id) => closeSession(id),
});

// --- Side panel ---
const sidePanel = new SidePanel(sidePanelEl, panelToggleBtn, {
  onSelectSession: (id) => switchSession(id),
  onCloseSession: (id, killTmux) => closeSession(id, killTmux),
  onAttachTmux: (name) => attachTmuxSession(name),
  onLaunchProject: (project) => launchProject(project),
  onTogglePin: (path, pinned) => togglePin(path, pinned),
});

// --- Action Bar ---
const actionBar = new ActionBar(terminalAreaEl, {
  onSendCommand: async (command, waitForIdle) => {
    if (!currentSessionId) return;
    try {
      await api(`/api/sessions/${currentSessionId}/send`, {
        method: "POST",
        body: JSON.stringify({
          text: command,
          waitForIdle,
          timeoutMs: waitForIdle ? 60000 : 5000,
        }),
      });
      actionBar.setBusy(false);
      toastManager.show({ severity: "info", title: "Command", message: `${command} sent` });
    } catch {
      actionBar.setBusy(false);
      toastManager.show({ severity: "warning", title: "Command", message: "Command may have failed — check terminal" });
    }
  },
  onKillSession: () => {
    if (!currentSessionId) return;
    closeSession(currentSessionId, true);
  },
  onManageTemplates: async () => {
    try {
      await createSession({
        cwd: "~/.termhub/templates",
        name: "template-manager",
        createTmux: tmuxAvailable,
        command: "claude",
      });
      toastManager.show({ severity: "info", title: "Templates", message: "Template manager opened — ask Claude to create/edit templates" });
    } catch {
      toastManager.show({ severity: "error", title: "Templates", message: "Failed to open template manager" });
    }
  },
  onSendTemplate: async (templateName) => {
    if (!currentSessionId) return;
    try {
      await api(`/api/sessions/${currentSessionId}/template/${templateName}`, {
        method: "POST",
      });
      toastManager.show({ severity: "info", title: "Template", message: `${templateName} sent` });
    } catch {
      toastManager.show({ severity: "warning", title: "Template", message: "Failed to send template" });
    }
  },
});

// --- WebSocket ---
function connectWs(): void {
  if (ws && ws.readyState <= WebSocket.OPEN) return;

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}/ws?token=${token}`);

  ws.onopen = () => {
    if (currentSessionId) {
      wsSend({ type: "attach", sessionId: currentSessionId });
      const handle = terminalHandles.get(currentSessionId);
      if (handle) {
        const { cols, rows } = handle.terminal;
        wsSend({ type: "resize", cols, rows });
      }
    }
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    const sid: string | undefined = msg.sessionId;
    switch (msg.type) {
      case "output": {
        const handle = sid ? terminalHandles.get(sid) : null;
        handle?.terminal.write(msg.data);
        break;
      }
      case "snapshot": {
        if (sid) {
          const handle = terminalHandles.get(sid);
          if (handle) {
            handle.terminal.reset();
            handle.terminal.write(msg.data);
          }
        }
        break;
      }
      case "exit": {
        const handle = sid ? terminalHandles.get(sid) : null;
        handle?.terminal.write(`\r\n\x1b[31m[Process exited with code ${msg.code}]\x1b[0m\r\n`);
        break;
      }
      case "alert": {
        const alertSid: string = msg.sessionId;
        const severity = msg.severity as "error" | "warning" | "info";
        const sessionName = tabBar.getSessionName(alertSid) || alertSid;

        if (alertSid !== currentSessionId) {
          tabBar.addBadge(alertSid, severity);
          sidePanel.addBadge(alertSid, severity);
        }

        toastManager.show({
          severity,
          title: sessionName,
          message: msg.message,
          onClick: () => switchSession(alertSid),
        });

        notificationManager.show(
          `[${severity}] ${sessionName}`,
          msg.message,
          () => switchSession(alertSid)
        );
        break;
      }
      case "sessions": {
        refreshSidePanel(msg.sessions);
        break;
      }
      case "error": {
        console.error("WS error:", msg.message);
        break;
      }
    }
  };

  ws.onclose = () => {
    setTimeout(connectWs, 2000);
  };
}

function wsSend(msg: Record<string, unknown>): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// --- Session management ---
async function createSession(options?: { cwd?: string; name?: string; createTmux?: boolean; command?: string }): Promise<SessionInfo> {
  const session = await api<SessionInfo>("/api/sessions", {
    method: "POST",
    body: options ? JSON.stringify(options) : undefined,
  });
  const handle = createTerminal();
  terminalHandles.set(session.id, handle);

  handle.terminal.onData((data) => {
    wsSend({ type: "input", data });
  });
  handle.terminal.onResize(({ cols, rows }) => {
    wsSend({ type: "resize", cols, rows });
  });

  tabBar.addTab(session);
  switchSession(session.id);
  refreshSidePanel();
  return session;
}

function switchSession(id: string): void {
  if (currentSessionId) {
    const prevHandle = terminalHandles.get(currentSessionId);
    if (prevHandle) {
      prevHandle.terminal.element?.style.setProperty("display", "none");
    }
  }

  currentSessionId = id;
  tabBar.setActive(id);
  tabBar.clearBadge(id);
  sidePanel.setActive(id);
  sidePanel.clearBadge(id);

  let handle = terminalHandles.get(id);
  if (!handle) {
    handle = createTerminal();
    terminalHandles.set(id, handle);
    let suppressInput = true;
    handle.terminal.onData((data) => {
      if (suppressInput) return;
      wsSend({ type: "input", data });
    });
    handle.terminal.onResize(({ cols, rows }) => {
      wsSend({ type: "resize", cols, rows });
    });
    setTimeout(() => { suppressInput = false; }, 500);
  }

  if (!handle.terminal.element) {
    handle.mount(terminalContainer);
  } else {
    handle.terminal.element.style.setProperty("display", "");
  }

  handle.fitAddon.fit();
  handle.terminal.focus();

  wsSend({ type: "attach", sessionId: id });

  const { cols, rows } = handle.terminal;
  wsSend({ type: "resize", cols, rows });

  // Update action bar with session info
  updateActionBar(id);
}

function updateActionBar(sessionId: string): void {
  api<SessionCardInfo[]>("/api/sessions")
    .then((sessions) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        actionBar.update(session.cwd, session.alive, session.tmuxSession, session.name);
      } else {
        actionBar.hide();
      }
    })
    .catch(() => actionBar.hide());
}

async function closeSession(id: string, killTmux = false): Promise<void> {
  try {
    const query = killTmux ? "?killTmux=true" : "";
    await api(`/api/sessions/${id}${query}`, { method: "DELETE" });
  } catch {
    // Session may already be gone on server
  }
  const handle = terminalHandles.get(id);
  if (handle) {
    handle.dispose();
    handle.terminal.element?.remove();
    terminalHandles.delete(id);
  }
  tabBar.removeTab(id);
  refreshSidePanel();
  refreshTmuxSessions();
  if (currentSessionId === id) {
    currentSessionId = null;
    try {
      const sessions = await api<SessionInfo[]>("/api/sessions");
      if (sessions.length > 0) {
        switchSession(sessions[sessions.length - 1].id);
      }
    } catch {
      // no tab to switch to
    }
  }
}

// --- Project launcher ---
async function launchProject(project: ProjectInfo): Promise<void> {
  if (sidePanel.isProjectLaunching(project.path)) return;

  sidePanel.setProjectLaunching(project.path);

  // Check for existing session with same cwd
  try {
    const sessions = await api<SessionCardInfo[]>("/api/sessions");
    const existing = sessions.find(
      (s) => s.cwd === project.path && s.alive
    );
    if (existing) {
      if (terminalHandles.has(existing.id)) {
        switchSession(existing.id);
      } else {
        const handle = createTerminal();
        terminalHandles.set(existing.id, handle);
        let suppressInput = true;
        handle.terminal.onData((data) => {
          if (suppressInput) return;
          wsSend({ type: "input", data });
        });
        handle.terminal.onResize(({ cols, rows }) => {
          wsSend({ type: "resize", cols, rows });
        });
        if (!tabBar.hasTab(existing.id)) {
          tabBar.addTab(existing as SessionInfo);
        }
        switchSession(existing.id);
        setTimeout(() => { suppressInput = false; }, 500);
      }
      if (isMobile()) sidePanel.close();
      sidePanel.clearProjectState(project.path);
      toastManager.show({ severity: "info", title: project.name, message: "Switched to existing session" });
      return;
    }
  } catch {
    // continue with new session
  }

  if (isMobile()) sidePanel.close();

  try {
    await createSession({
      cwd: project.path,
      name: project.name,
      createTmux: tmuxAvailable,
    });

    sidePanel.clearProjectState(project.path);
    toastManager.show({ severity: "info", title: project.name, message: "Session ready" });
  } catch (err) {
    sidePanel.setProjectError(project.path);
    toastManager.show({
      severity: "error",
      title: project.name,
      message: err instanceof Error ? err.message : "Failed to launch",
    });
    setTimeout(() => sidePanel.clearProjectState(project.path), 3000);
  }
}

// --- Side panel refresh ---
function refreshSidePanel(sessions?: SessionCardInfo[]): void {
  if (sessions) {
    sidePanel.setSessions(sessions, currentSessionId ?? undefined);
    return;
  }
  api<SessionCardInfo[]>("/api/sessions")
    .then((list) => sidePanel.setSessions(list, currentSessionId ?? undefined))
    .catch(() => {});
}

function refreshTmuxSessions(): void {
  api<TmuxSessionCardInfo[]>("/api/tmux-sessions")
    .then((list) => sidePanel.setTmuxSessions(list))
    .catch(() => sidePanel.setTmuxSessions([]));
}

let tmuxAvailable = false;

async function loadProjects(): Promise<void> {
  try {
    const result = await api<{ projects: ProjectInfo[]; tmuxAvailable: boolean }>("/api/projects");
    tmuxAvailable = result.tmuxAvailable;
    sidePanel.setProjects(result.projects);
  } catch {
    sidePanel.setProjectsError();
  }
}

async function togglePin(projectPath: string, pinned: boolean): Promise<void> {
  try {
    const current = await api<string[]>("/api/favorites");
    const updated = pinned
      ? [...current.filter((p) => p !== projectPath), projectPath]
      : current.filter((p) => p !== projectPath);
    await api("/api/favorites", {
      method: "PUT",
      body: JSON.stringify({ paths: updated }),
    });
    await loadProjects();
  } catch {
    toastManager.show({ severity: "error", title: "Pin", message: "Failed to update favorites" });
  }
}

// --- tmux session attach ---
async function attachTmuxSession(tmuxName: string): Promise<void> {
  const sessions = await api<SessionInfo[]>("/api/sessions");
  const existing = sessions.find(
    (s) => s.tmuxSession === tmuxName && terminalHandles.has(s.id),
  );
  if (existing) {
    switchSession(existing.id);
    return;
  }

  const session = await api<SessionInfo>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ tmuxSession: tmuxName }),
  });
  const handle = createTerminal();
  terminalHandles.set(session.id, handle);

  let suppressInput = true;
  handle.terminal.onData((data) => {
    if (suppressInput) return;
    wsSend({ type: "input", data });
  });
  handle.terminal.onResize(({ cols, rows }) => {
    wsSend({ type: "resize", cols, rows });
  });

  tabBar.addTab(session);
  switchSession(session.id);
  setTimeout(() => { suppressInput = false; }, 500);
  refreshSidePanel();
  refreshTmuxSessions();
}

// --- Login ---
function showLogin(): void {
  loginScreen.classList.remove("hidden");
  loginScreen.classList.add("flex");
  appScreen.classList.remove("flex");
  appScreen.classList.add("hidden");
}

function showApp(): void {
  loginScreen.classList.remove("flex");
  loginScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  appScreen.classList.add("flex");
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = (document.getElementById("password") as HTMLInputElement).value;
  loginError.textContent = "";
  try {
    const result = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!result.ok) {
      loginError.textContent = "Invalid password";
      return;
    }
    const data = await result.json();
    token = data.token;
    localStorage.setItem("termhub_token", token!);
    await initApp();
  } catch {
    loginError.textContent = "Connection failed";
  }
});

// --- Templates ---
async function loadTemplates(): Promise<void> {
  try {
    const templates = await api<{ name: string; description?: string; content: string }[]>("/api/templates");
    actionBar.setTemplates(templates);
  } catch {
    // non-critical
  }
}

// --- Font size control ---
const FONT_SIZE_KEY = "termhub_fontsize";
const DEFAULT_FONT_SIZE = 16;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 24;
const STEP = 2;

let currentFontSize = parseInt(localStorage.getItem(FONT_SIZE_KEY) || String(DEFAULT_FONT_SIZE), 10);
applyFontSize(currentFontSize);

function applyFontSize(size: number): void {
  currentFontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size));
  document.documentElement.style.fontSize = `${currentFontSize}px`;
  localStorage.setItem(FONT_SIZE_KEY, String(currentFontSize));
  // Terminal font = UI - 2 (monospace glyphs are wider, so same px looks bigger)
  const termSize = Math.max(10, window.innerWidth <= 600 ? currentFontSize - 4 : currentFontSize - 2);
  for (const handle of terminalHandles.values()) {
    handle.terminal.options.fontSize = termSize;
    handle.fitAddon.fit();
  }
}

function setupFontSizeControls(): void {
  const wrapper = document.createElement("div");
  wrapper.className = "font-size-controls";

  const decBtn = document.createElement("button");
  decBtn.className = "font-size-btn";
  decBtn.textContent = "A-";
  decBtn.title = "Decrease font size";
  decBtn.addEventListener("click", () => applyFontSize(currentFontSize - STEP));

  const incBtn = document.createElement("button");
  incBtn.className = "font-size-btn";
  incBtn.textContent = "A+";
  incBtn.title = "Increase font size";
  incBtn.addEventListener("click", () => applyFontSize(currentFontSize + STEP));

  wrapper.appendChild(decBtn);
  wrapper.appendChild(incBtn);

  tabBarEl.appendChild(wrapper);
}

// --- Server info ---
async function loadServerInfo(): Promise<void> {
  try {
    const info = await api<{ hostname: string }>("/api/info");
    const badge = document.createElement("span");
    badge.className = "server-badge";
    badge.textContent = info.hostname;
    badge.title = `Server: ${info.hostname}`;
    tabBarEl.insertBefore(badge, tabBarEl.querySelector(".tab-add") || tabBarEl.lastChild);
  } catch {
    // non-critical
  }
}

// --- Init ---
async function initApp(): Promise<void> {
  showApp();
  connectWs();
  notificationManager.requestPermission();

  loadProjects();
  loadServerInfo();
  loadTemplates();
  setupFontSizeControls();

  try {
    const sessions = await api<SessionInfo[]>("/api/sessions");
    if (sessions.length > 0) {
      tabBar.setTabs(sessions, sessions[0].id);
      sidePanel.setSessions(sessions as SessionCardInfo[], sessions[0].id);
      switchSession(sessions[0].id);
    } else if (isMobile()) {
      sidePanel.open();
    } else {
      await createSession();
    }
  } catch {
    if (isMobile()) {
      sidePanel.open();
    } else {
      await createSession();
    }
  }

  refreshSidePanel();
  refreshTmuxSessions();
  setInterval(refreshTmuxSessions, 10_000);
}

// --- Boot ---
if (token) {
  api("/api/sessions")
    .then(() => initApp())
    .catch(() => showLogin());
} else {
  showLogin();
}
