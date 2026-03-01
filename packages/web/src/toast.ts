export type ToastSeverity = "error" | "warning" | "info";

export interface ToastOptions {
  severity: ToastSeverity;
  title: string;
  message: string;
  onClick?: () => void;
  duration?: number;
}

export class ToastManager {
  private container: HTMLElement;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "toast-container";
    document.body.appendChild(this.container);
  }

  show(options: ToastOptions): void {
    const { severity, title, message, duration = 5000, onClick } = options;

    const toast = document.createElement("div");
    toast.className = `toast toast-${severity}`;

    const iconEl = document.createElement("div");
    iconEl.className = "toast-icon";
    iconEl.textContent = severity === "info" ? "i" : "!";
    toast.appendChild(iconEl);

    const content = document.createElement("div");
    content.className = "toast-content";

    const titleEl = document.createElement("div");
    titleEl.className = "toast-title";
    titleEl.textContent = title;
    content.appendChild(titleEl);

    const msgEl = document.createElement("div");
    msgEl.className = "toast-message";
    msgEl.textContent = message.length > 120 ? message.slice(0, 120) + "..." : message;
    content.appendChild(msgEl);

    toast.appendChild(content);

    const closeBtn = document.createElement("button");
    closeBtn.className = "toast-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.dismiss(toast);
    });
    toast.appendChild(closeBtn);

    if (onClick) {
      toast.style.cursor = "pointer";
      toast.addEventListener("click", onClick);
    }

    this.container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("toast-visible"));

    if (duration > 0) {
      setTimeout(() => this.dismiss(toast), duration);
    }
  }

  private dismiss(toast: HTMLElement): void {
    toast.classList.remove("toast-visible");
    toast.classList.add("toast-exit");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  }
}
