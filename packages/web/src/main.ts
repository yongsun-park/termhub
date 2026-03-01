import { createTerminal, type TerminalHandle } from "./terminal.js";
import { TabBar, type SessionInfo } from "./tab-bar.js";
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

// --- WebSocket ---
function connectWs(): void {
  if (ws && ws.readyState <= WebSocket.OPEN) return;

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}/ws?token=${token}`);

  ws.onopen = () => {
    if (currentSessionId) {
      wsSend({ type: "attach", sessionId: currentSessionId });
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
  await api(`/api/sessions/${id}`, { method: "DELETE" });
  const handle = terminalHandles.get(id);
  if (handle) {
    handle.dispose();
    handle.terminal.element?.remove();
    terminalHandles.delete(id);
  }
  tabBar.removeTab(id);
  if (currentSessionId === id) {
    currentSessionId = null;
    // Switch to another tab if available
    const sessions = await api<SessionInfo[]>("/api/sessions");
    if (sessions.length > 0) {
      switchSession(sessions[sessions.length - 1].id);
    }
  }
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

  // Load existing sessions
  try {
    const sessions = await api<SessionInfo[]>("/api/sessions");
    if (sessions.length > 0) {
      tabBar.setTabs(sessions, sessions[0].id);
      switchSession(sessions[0].id);
    } else {
      await createSession();
    }
  } catch {
    await createSession();
  }
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
