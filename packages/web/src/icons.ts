import { createElement } from "lucide";
import {
  Play,
  Terminal,
  Star,
  ChevronRight,
  ChevronDown,
  X,
  FolderGit2,
  FolderOpen,
  Loader2,
  Zap,
  CircleDot,
  Circle,
  Monitor,
  Search,
  Sparkles,
  Radio,
  ClipboardCopy,
  Check,
} from "lucide";

const ICONS = {
  play: Play,
  terminal: Terminal,
  star: Star,
  "chevron-right": ChevronRight,
  "chevron-down": ChevronDown,
  x: X,
  "folder-git": FolderGit2,
  "folder-open": FolderOpen,
  loader: Loader2,
  zap: Zap,
  "circle-dot": CircleDot,
  circle: Circle,
  monitor: Monitor,
  search: Search,
  sparkles: Sparkles,
  radio: Radio,
  clipboard: ClipboardCopy,
  check: Check,
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, size = 16): SVGSVGElement {
  const svg = createElement(ICONS[name]) as SVGSVGElement;
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.style.flexShrink = "0";
  return svg;
}
