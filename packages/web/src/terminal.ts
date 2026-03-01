import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon } from "@xterm/addon-search";

export interface TerminalHandle {
  terminal: Terminal;
  fitAddon: FitAddon;
  mount(container: HTMLElement): void;
  dispose(): void;
}

function getTerminalFontSize(): number {
  return window.innerWidth <= 600 ? 11 : 14;
}

export function createTerminal(): TerminalHandle {
  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: getTerminalFontSize(),
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
    theme: {
      background: "#1a1b26",
      foreground: "#a9b1d6",
      cursor: "#c0caf5",
      selectionBackground: "#33467c",
      black: "#15161e",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#a9b1d6",
      brightBlack: "#414868",
      brightRed: "#f7768e",
      brightGreen: "#9ece6a",
      brightYellow: "#e0af68",
      brightBlue: "#7aa2f7",
      brightMagenta: "#bb9af7",
      brightCyan: "#7dcfff",
      brightWhite: "#c0caf5",
    },
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon();
  const searchAddon = new SearchAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(searchAddon);

  let resizeObserver: ResizeObserver | null = null;

  return {
    terminal,
    fitAddon,
    mount(container: HTMLElement) {
      terminal.open(container);
      try {
        terminal.loadAddon(new WebglAddon());
      } catch {
        // WebGL not available, canvas renderer is fine
      }
      fitAddon.fit();
      resizeObserver = new ResizeObserver(() => fitAddon.fit());
      resizeObserver.observe(container);
    },
    dispose() {
      resizeObserver?.disconnect();
      terminal.dispose();
    },
  };
}
