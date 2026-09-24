import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronsUpDown,
  Coins,
  Cpu,
  Globe,
  KeyRound,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Radar,
  ReceiptText,
  Settings,
  SquareTerminal,
  UserRound,
  Users,
  Webhook,
  X,
} from "lucide-react";

/**
 * The app's icons, from Lucide (ISC licence), named for what they mean here
 * rather than what they depict, so a swap is one line.
 */
const ICONS = {
  overview: LayoutDashboard,
  keys: KeyRound,
  model: Cpu,
  proxies: Globe,
  monitors: Radar,
  webhooks: Webhook,
  credits: Coins,
  invoices: ReceiptText,
  playground: SquareTerminal,
  docs: BookOpen,
  collapse: PanelLeftClose,
  expand: PanelLeftOpen,
  team: Users,
  settings: Settings,
  profile: UserRound,
  chevrons: ChevronsUpDown,
  check: Check,
  plus: Plus,
  menu: Menu,
  close: X,
  signout: LogOut,
  external: ArrowUpRight,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "size-[18px]" }: { name: IconName; className?: string }) {
  const Glyph = ICONS[name];
  return <Glyph aria-hidden="true" strokeWidth={1.75} className={`shrink-0 ${className}`} />;
}
