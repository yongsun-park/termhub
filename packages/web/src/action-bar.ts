import { icon, type IconName } from "./icons.js";

export interface TemplateInfo {
  name: string;
  description?: string;
  content: string;
}

export interface ActionBarCallbacks {
  onSendCommand(command: string, waitForIdle: boolean): void;
  onKillSession(): void;
  onSendTemplate(templateName: string): void;
  onManageTemplates(): void;
}

export class ActionBar {
  private container: HTMLElement;
  private cwdEl: HTMLElement;
  private buttonsEl: HTMLElement;
  private copyBtn: HTMLElement;
  private killBtn: HTMLElement;
  private templateBtn: HTMLElement;
  private templateDropdown: HTMLElement;
  private callbacks: ActionBarCallbacks;
  private currentCwd: string | null = null;
  private currentTmuxSession: string | null = null;
  private currentSessionName: string | null = null;
  private busy = false;
  private templates: TemplateInfo[] = [];
  private dropdownOpen = false;

  constructor(parent: HTMLElement, callbacks: ActionBarCallbacks) {
    this.callbacks = callbacks;

    this.container = document.createElement("div");
    this.container.className = "action-bar hidden";

    this.cwdEl = document.createElement("span");
    this.cwdEl.className = "action-bar-cwd";
    this.container.appendChild(this.cwdEl);

    this.buttonsEl = document.createElement("div");
    this.buttonsEl.className = "action-bar-buttons";

    this.buttonsEl.appendChild(this.createButton("Claude", "sparkles", "claude", true));
    this.buttonsEl.appendChild(this.createButton("Codex", "zap", "codex", true));

    // Template dropdown trigger
    const templateWrap = document.createElement("div");
    templateWrap.className = "action-bar-template-wrap";

    this.templateBtn = document.createElement("button");
    this.templateBtn.className = "action-bar-btn action-bar-template";
    this.templateBtn.appendChild(icon("clipboard", 12));
    const tplText = document.createElement("span");
    tplText.textContent = "Prompts";
    this.templateBtn.appendChild(tplText);
    this.templateBtn.title = "Prompt templates";
    this.templateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });
    templateWrap.appendChild(this.templateBtn);

    // Dropdown
    this.templateDropdown = document.createElement("div");
    this.templateDropdown.className = "template-dropdown hidden";
    templateWrap.appendChild(this.templateDropdown);

    this.buttonsEl.appendChild(templateWrap);

    // Copy tmux attach command button
    this.copyBtn = document.createElement("button");
    this.copyBtn.className = "action-bar-btn action-bar-copy";
    this.copyBtn.appendChild(icon("clipboard", 12));
    const copyText = document.createElement("span");
    copyText.textContent = "copy-tmux";
    this.copyBtn.appendChild(copyText);
    this.copyBtn.title = "Copy SSH + tmux attach command";
    this.copyBtn.addEventListener("click", () => this.copyAttachCommand());
    this.buttonsEl.appendChild(this.copyBtn);

    // Kill tmux session button
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

    // Close dropdown on outside click
    document.addEventListener("click", () => this.closeDropdown());
  }

  setTemplates(templates: TemplateInfo[]): void {
    this.templates = templates;
    // Update button visibility
    this.templateBtn.parentElement!.style.display = templates.length > 0 ? "" : "none";
  }

  private toggleDropdown(): void {
    if (this.dropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown(): void {
    this.dropdownOpen = true;
    this.templateDropdown.classList.remove("hidden");
    this.renderDropdown();
  }

  private closeDropdown(): void {
    this.dropdownOpen = false;
    this.templateDropdown.classList.add("hidden");
  }

  private renderDropdown(): void {
    this.templateDropdown.innerHTML = "";

    // Filter input
    const filterInput = document.createElement("input");
    filterInput.className = "template-filter";
    filterInput.type = "text";
    filterInput.placeholder = "Filter...";
    filterInput.addEventListener("click", (e) => e.stopPropagation());
    filterInput.addEventListener("input", () => {
      const q = filterInput.value.toLowerCase();
      const items = this.templateDropdown.querySelectorAll(".template-item");
      items.forEach((el) => {
        const name = el.getAttribute("data-name") || "";
        const desc = el.getAttribute("data-desc") || "";
        (el as HTMLElement).style.display =
          name.includes(q) || desc.includes(q) ? "" : "none";
      });
    });
    this.templateDropdown.appendChild(filterInput);

    if (this.templates.length === 0) {
      const empty = document.createElement("div");
      empty.className = "template-empty";
      empty.textContent = "No templates yet";
      this.templateDropdown.appendChild(empty);

      const manageBtn = document.createElement("div");
      manageBtn.className = "template-manage";
      manageBtn.textContent = "Open template manager...";
      manageBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onManageTemplates();
        this.closeDropdown();
      });
      this.templateDropdown.appendChild(manageBtn);
      return;
    }

    // Template list
    const list = document.createElement("div");
    list.className = "template-list";

    for (const tpl of this.templates) {
      const item = document.createElement("div");
      item.className = "template-item";
      item.setAttribute("data-name", tpl.name.toLowerCase());
      item.setAttribute("data-desc", (tpl.description || "").toLowerCase());

      const nameEl = document.createElement("span");
      nameEl.className = "template-item-name";
      nameEl.textContent = tpl.name;
      item.appendChild(nameEl);

      if (tpl.description) {
        const descEl = document.createElement("span");
        descEl.className = "template-item-desc";
        descEl.textContent = tpl.description;
        item.appendChild(descEl);
      }

      item.title = tpl.content.slice(0, 200);
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onSendTemplate(tpl.name);
        this.closeDropdown();
      });
      list.appendChild(item);
    }

    this.templateDropdown.appendChild(list);

    // Manage button
    const manageBtn = document.createElement("div");
    manageBtn.className = "template-manage";
    manageBtn.textContent = "Manage templates...";
    manageBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks.onManageTemplates();
      this.closeDropdown();
    });
    this.templateDropdown.appendChild(manageBtn);

    // Focus filter
    setTimeout(() => filterInput.focus(), 0);
  }

  private createButton(label: string, iconName: IconName, command: string, waitForIdle: boolean): HTMLElement {
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
        t.textContent = "copy-tmux";
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
