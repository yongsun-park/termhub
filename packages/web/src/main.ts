import { createTerminal, type TerminalHandle } from "./terminal.js";
import { TabBar, type SessionInfo } from "./tab-bar.js";
import { SidePanel, type SessionCardInfo, type TmuxSessionCardInfo, type SessionPreset } from "./side-panel.js";
import { ToastManager } from "./toast.js";
import { NotificationManager } from "./notifications.js";
import "@xterm/xterm/css/xterm.css";
import "./style.css";

const API_BASE = "";
let token: string | null = localStorage.getItem("aily_token");
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

// --- Managers ---
const toastManager = new ToastManager();
const notificationManager = new NotificationManager();

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
    localStorage.removeItem("aily_token");
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
  onAttachTmux: (name) => attachTmuxSession(name),
  onCreatePreset: (preset) => createPresetSession(preset),
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

        // Badge on tab & side panel (only for background sessions)
        if (alertSid !== currentSessionId) {
          tabBar.addBadge(alertSid, severity);
          sidePanel.addBadge(alertSid, severity);
        }

        // Toast always
        toastManager.show({
          severity,
          title: sessionName,
          message: msg.message,
          onClick: () => switchSession(alertSid),
        });

        // OS notification when tab is hidden
        notificationManager.show(
          `[${severity}] ${sessionName}`,
          msg.message,
          () => switchSession(alertSid)
        );
        break;
      }
      case "sessions": {
        // Server-pushed session list update
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

// --- Preset configs ---
const PRESET_COMMANDS: Record<SessionPreset, { name: string; command?: string }> = {
  claude: { name: "Claude Code", command: "claude" },
  codex: { name: "Codex", command: "codex" },
  shell: { name: "Shell" },
};

async function createPresetSession(preset: SessionPreset): Promise<void> {
  const config = PRESET_COMMANDS[preset];
  const session = await api<SessionInfo>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ name: config.name, preset }),
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

  // Auto-run CLI command after a short delay for shell init
  if (config.command) {
    const targetId = session.id;
    const cmd = config.command;
    setTimeout(() => {
      api("/api/sessions/" + targetId + "/write", {
        method: "POST",
        body: JSON.stringify({ data: cmd + "\n" }),
      }).catch(() => {});
    }, 500);
  }
}

// --- Session management ---
async function createSession(): Promise<void> {
  const session = await api<SessionInfo>("/api/sessions", { method: "POST" });
  const handle = createTerminal();
  terminalHandles.set(session.id, handle);

  // Bind terminal input to websocket
  handle.terminal.onData((data) => {
    wsSend({ type: "input", data });
  });

  // Bind resize
  handle.terminal.onResize(({ cols, rows }) => {
    wsSend({ type: "resize", cols, rows });
  });

  tabBar.addTab(session);
  switchSession(session.id);
  refreshSidePanel();
}

function switchSession(id: string): void {
  // Hide current terminal
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
    handle.terminal.onData((data) => {
      wsSend({ type: "input", data });
    });
    handle.terminal.onResize(({ cols, rows }) => {
      wsSend({ type: "resize", cols, rows });
    });
  }

  if (!handle.terminal.element) {
    handle.mount(terminalContainer);
  } else {
    handle.terminal.element.style.setProperty("display", "");
  }

  handle.fitAddon.fit();
  handle.terminal.focus();

  // Attach websocket to this session
  wsSend({ type: "attach", sessionId: id });

  // Send current size
  const { cols, rows } = handle.terminal;
  wsSend({ type: "resize", cols, rows });
}

async function closeSession(id: string): Promise<void> {
  try {
    await api(`/api/sessions/${id}`, { method: "DELETE" });
  } catch {
    // Session may already be gone on server — proceed with local cleanup
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
    // Switch to another tab if available
    try {
      const sessions = await api<SessionInfo[]>("/api/sessions");
      if (sessions.length > 0) {
        switchSession(sessions[sessions.length - 1].id);
      }
    } catch {
      // Server unreachable — no tab to switch to
    }
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

// --- tmux session attach ---
async function attachTmuxSession(tmuxName: string): Promise<void> {
  const session = await api<SessionInfo>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ tmuxSession: tmuxName }),
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
  refreshTmuxSessions();
}

// --- Login ---
function showLogin(): void {
  loginScreen.style.display = "flex";
  appScreen.style.display = "none";
}

function showApp(): void {
  loginScreen.style.display = "none";
  appScreen.style.display = "flex";
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
    localStorage.setItem("aily_token", token!);
    await initApp();
  } catch {
    loginError.textContent = "Connection failed";
  }
});

// --- Init ---
async function initApp(): Promise<void> {
  showApp();
  connectWs();
  notificationManager.requestPermission();

  // Load existing sessions
  try {
    const sessions = await api<SessionInfo[]>("/api/sessions");
    if (sessions.length > 0) {
      tabBar.setTabs(sessions, sessions[0].id);
      sidePanel.setSessions(sessions as SessionCardInfo[], sessions[0].id);
      switchSession(sessions[0].id);
    } else {
      await createSession();
    }
  } catch {
    await createSession();
  }

  refreshSidePanel();
  refreshTmuxSessions();
  setInterval(refreshTmuxSessions, 10_000);
}

// --- Boot ---
if (token) {
  // Validate token by fetching sessions
  api("/api/sessions")
    .then(() => initApp())
    .catch(() => showLogin());
} else {
  showLogin();
}
