export class NotificationManager {
  private permission: NotificationPermission = "default";

  async requestPermission(): Promise<boolean> {
    if (!("Notification" in window)) return false;
    this.permission = await Notification.requestPermission();
    return this.permission === "granted";
  }

  show(title: string, body: string, onClick?: () => void): void {
    if (this.permission !== "granted" || !document.hidden) return;

    const notification = new Notification(title, {
      body: body.slice(0, 200),
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>",
      tag: "aily-alert",
    });

    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }

    setTimeout(() => notification.close(), 8000);
  }
}
