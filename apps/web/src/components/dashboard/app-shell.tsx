"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/dashboard/icons";
import { type ShellWorkspace, WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { Wordmark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import { signOut } from "@/lib/auth-client";
import { formatNumber } from "@/lib/format";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "", items: [{ href: "/dashboard", label: "Overview", icon: "overview" }] },
  {
    label: "Build",
    items: [
      { href: "/dashboard/keys", label: "API keys", icon: "keys" },
      { href: "/dashboard/ai", label: "Model provider", icon: "model" },
      { href: "/dashboard/proxies", label: "Proxies", icon: "proxies" },
    ],
  },
  {
    label: "Automate",
    items: [
      { href: "/dashboard/monitors", label: "Monitors", icon: "monitors" },
      { href: "/dashboard/webhooks", label: "Webhooks", icon: "webhooks" },
    ],
  },
  {
    label: "Billing",
    items: [
      { href: "/dashboard/billing", label: "Credits", icon: "credits" },
      { href: "/dashboard/invoices", label: "Invoices", icon: "invoices" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/dashboard/team", label: "Team", icon: "team" },
      { href: "/dashboard/settings", label: "Settings", icon: "settings" },
    ],
  },
];

const RESOURCES: NavItem[] = [
  { href: "/playground", label: "Playground", icon: "playground" },
  { href: "/docs", label: "Docs", icon: "docs" },
];

/**
 * Folding is one motion: only the width moves. Every icon, the workspace
 * badge, the toggle and the avatar sit on the rail's centre line in both
 * states, so nothing jumps; labels are clipped by the narrowing column and
 * fade, out quickly when folding and in just behind the width when opening.
 */
const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";
const fade = (collapsed: boolean) =>
  `transition-opacity motion-reduce:transition-none ${
    collapsed ? "opacity-0 duration-100" : "opacity-100 delay-100 duration-300"
  }`;
/** Height folds to nothing (and back) without measuring anything. */
const fold = (hidden: boolean) =>
  `grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none ${EASE} ${
    hidden ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
  }`;

// "/dashboard" must not light up for every page beneath it.
const isActive = (pathname: string, href: string) =>
  href === "/dashboard" ? pathname === href : pathname.startsWith(href);

/** Pages reached from elsewhere than the sidebar list. */
const EXTRA_TITLES: Record<string, string> = {
  "/dashboard/profile": "Profile",
  "/dashboard/workspaces/new": "New workspace",
};

const titleFor = (pathname: string) =>
  EXTRA_TITLES[pathname] ??
  GROUPS.flatMap((g) => g.items).find((item) => isActive(pathname, item.href))?.label ??
  "Dashboard";

export interface ShellUser {
  name: string;
  email: string;
  image: string | null;
  credits: number;
}

/**
 * The signed-in app: a sidebar on wide screens that folds down to an icon
 * rail, and a drawer on phones.
 *
 * The folded state lives in a cookie the server reads, so the first paint is
 * already the right width instead of jumping after hydration.
 */
export function AppShell({
  user,
  initialCollapsed,
  workspace,
  workspaces,
  children,
}: {
  user: ShellUser;
  initialCollapsed: boolean;
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawer, setDrawer] = useState(false);
  const menuButton = useRef<HTMLButtonElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);

  const toggle = useCallback(() => {
    setCollapsed((was) => {
      const next = !was;
      // biome-ignore lint/suspicious/noDocumentCookie: a one-line preference; the Cookie Store API is not in every browser yet.
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  // Ctrl/Cmd+B folds the sidebar, as in most editors, unless someone is typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "b" || !(event.metaKey || event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      toggle();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle]);

  // Any navigation closes the drawer; the pathname is the trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger.
  useEffect(() => setDrawer(false), [pathname]);

  useEffect(() => {
    if (!drawer) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false);
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    const opener = menuButton.current;
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [drawer]);

  return (
    <div
      className={`min-h-dvh lg:grid lg:grid-cols-[var(--sidebar)_minmax(0,1fr)] lg:transition-[grid-template-columns] lg:duration-300 lg:motion-reduce:transition-none ${EASE}`}
      style={{ "--sidebar": collapsed ? "4rem" : "15.5rem" } as React.CSSProperties}
    >
      {/* Wide screens: the sidebar sits in the grid and stays put while the page scrolls. */}
      <aside
        aria-label="App"
        className="sticky top-0 z-30 hidden h-dvh min-w-0 flex-col border-r border-[var(--line)] bg-[var(--sheet)] lg:flex"
      >
        <div className="relative flex h-14 shrink-0 items-center overflow-hidden border-b border-[var(--line)]">
          <Link
            href="/"
            aria-label="Pluck home"
            tabIndex={collapsed ? -1 : undefined}
            aria-hidden={collapsed || undefined}
            className={`ml-4 shrink-0 ${fade(collapsed)} ${collapsed ? "pointer-events-none" : ""}`}
          >
            <Wordmark />
          </Link>
          {/* 16px from the right edge is also dead centre on the 64px rail. */}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={`${collapsed ? "Expand" : "Collapse"} sidebar (Ctrl+B)`}
            className="absolute right-4 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
          >
            <Icon name={collapsed ? "expand" : "collapse"} />
          </button>
        </div>
        <SidebarBody
          pathname={pathname}
          collapsed={collapsed}
          user={user}
          workspace={workspace}
          workspaces={workspaces}
        />
      </aside>

      {/* Phones and tablets: no bar, just a button in thumb reach that opens the sidebar. */}
      <button
        ref={menuButton}
        type="button"
        onClick={() => setDrawer(true)}
        aria-label="Open navigation"
        aria-expanded={drawer}
        aria-controls="app-drawer"
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 flex size-12 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--paper)] shadow-lg transition-transform active:scale-95 lg:hidden"
      >
        <Icon name="menu" className="size-5" />
      </button>

      <div
        className={`fixed inset-0 z-50 lg:hidden ${drawer ? "" : "pointer-events-none"}`}
        aria-hidden={!drawer}
        inert={!drawer}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => setDrawer(false)}
          className={`absolute inset-0 cursor-default bg-[color-mix(in_srgb,var(--ink)_35%,transparent)] backdrop-blur-[2px] transition-opacity duration-300 motion-reduce:transition-none ${
            drawer ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          id="app-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={`absolute inset-y-0 left-0 flex w-[min(18rem,86vw)] flex-col border-r border-[var(--line)] bg-[var(--sheet)] shadow-xl transition-transform duration-300 motion-reduce:transition-none ${EASE} ${
            drawer ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--line)] px-4">
            <Link href="/" aria-label="Pluck home">
              <Wordmark />
            </Link>
            <button
              ref={closeButton}
              type="button"
              onClick={() => setDrawer(false)}
              aria-label="Close navigation"
              className="-mr-1 flex size-9 items-center justify-center text-[var(--ink-soft)] hover:text-[var(--ink)]"
            >
              <Icon name="close" />
            </button>
          </div>
          <SidebarBody
            pathname={pathname}
            collapsed={false}
            user={user}
            workspace={workspace}
            workspaces={workspaces}
          />
        </div>
      </div>

      <div className="min-w-0">
        <main id="main" className="px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:py-8">
          <h1 className="sr-only">{titleFor(pathname)}</h1>
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarBody({
  pathname,
  collapsed,
  user,
  workspace,
  workspaces,
}: {
  pathname: string;
  collapsed: boolean;
  user: ShellUser;
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
}) {
  return (
    <>
      <WorkspaceSwitcher current={workspace} workspaces={workspaces} collapsed={collapsed} />
      <nav
        aria-label="Dashboard"
        // Scrolls in both states so the footer below never leaves the screen. On
        // the rail the scrollbar is hidden: it would push the icons off centre.
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-3 ${
          collapsed ? "[scrollbar-width:none]" : "[scrollbar-width:thin]"
        }`}
      >
        {GROUPS.map((group) => (
          <div key={group.label || "home"} className="px-3 pb-3">
            {group.label && <GroupLabel label={group.label} collapsed={collapsed} />}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    collapsed={collapsed}
                    active={isActive(pathname, item.href)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="px-3 pt-1">
          <GroupLabel label="Resources" collapsed={collapsed} />
          <ul className="space-y-0.5">
            {RESOURCES.map((item) => (
              <li key={item.href}>
                <NavLink item={item} collapsed={collapsed} active={false} />
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="shrink-0 border-t border-[var(--line)] p-3">
        <div className={fold(collapsed)} inert={collapsed}>
          <div className="min-h-0 overflow-hidden">
            <Link
              href="/dashboard/billing"
              className="mb-3 flex items-baseline justify-between whitespace-nowrap border border-[var(--line)] bg-[var(--paper)] px-3 py-2 transition-colors hover:border-[var(--ink-faint)]"
            >
              <span className="text-xs text-[var(--ink-soft)]">Credits</span>
              <span className="mono text-sm">{formatNumber(user.credits)}</span>
            </Link>
          </div>
        </div>
        <UserRow user={user} collapsed={collapsed} />
      </div>
    </>
  );
}

/** A group heading that becomes a hairline on the rail, in the same height. */
function GroupLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  return (
    <div className="relative mb-1 h-5">
      <p
        aria-hidden={collapsed || undefined}
        className={`mono overflow-hidden whitespace-nowrap px-2 text-[10px] uppercase leading-5 tracking-wider text-[var(--ink-faint)] ${fade(collapsed)}`}
      >
        {label}
      </p>
      <div
        aria-hidden="true"
        className={`absolute inset-x-2 top-1/2 border-t border-[var(--line)] transition-opacity duration-300 motion-reduce:transition-none ${
          collapsed ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

function NavLink({
  item,
  collapsed,
  active,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
}) {
  // The tooltip is fixed-position so the scrolling list cannot clip it; it is
  // placed from the link's own box whenever the pointer or focus arrives.
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);
  const place = (event: React.SyntheticEvent<HTMLAnchorElement>) => {
    if (!collapsed) return;
    const box = event.currentTarget.getBoundingClientRect();
    const rail = event.currentTarget.closest("aside")?.getBoundingClientRect().right ?? box.right;
    setTip({ top: box.top + box.height / 2, left: rail + 10 });
  };

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      onPointerEnter={place}
      onFocus={place}
      // 12px group padding plus 11px here puts the 18px icon on the rail's centre line.
      className={`group relative flex items-center gap-3 px-[11px] py-2 text-sm transition-colors ${
        active
          ? "bg-[var(--accent-wash)] text-[var(--ink)]"
          : "text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
      }`}
    >
      {active && (
        <span className="absolute inset-y-1 left-0 w-0.5 bg-[var(--accent)]" aria-hidden="true" />
      )}
      <Icon
        name={item.icon}
        className={`size-[18px] shrink-0 ${active ? "text-[var(--accent)]" : ""}`}
      />
      <span
        aria-hidden={collapsed || undefined}
        className={`min-w-0 overflow-hidden whitespace-nowrap ${fade(collapsed)}`}
      >
        {item.label}
      </span>
      {collapsed && tip && (
        // Folded, the label moves into a tooltip on hover and keyboard focus.
        <span
          role="tooltip"
          style={{ top: tip.top, left: tip.left }}
          className="pointer-events-none fixed z-50 -translate-x-1 -translate-y-1/2 whitespace-nowrap border border-[var(--line)] bg-[var(--ink)] px-2 py-1 text-xs text-[var(--paper)] opacity-0 shadow-md transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
        >
          {item.label}
        </span>
      )}
    </Link>
  );
}

function UserRow({ user, collapsed }: { user: ShellUser; collapsed: boolean }) {
  const router = useRouter();
  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();
  const leave = () => void signOut({ fetchOptions: { onSuccess: () => router.push("/") } });

  const avatar = user.image ? (
    // A GitHub avatar: small, already sized, and not worth the image optimiser.
    // biome-ignore lint/performance/noImgElement: see above.
    <img
      src={user.image}
      alt=""
      width={28}
      height={28}
      referrerPolicy="no-referrer"
      // Preflight caps images at max-width: 100%, so a squeezed row would shrink
      // the avatar to a sliver; it keeps its 28px whatever the row does.
      className="size-7 max-w-none shrink-0 rounded-full border border-[var(--line)]"
    />
  ) : (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-xs text-[var(--accent)]">
      {initial}
    </span>
  );

  const signOutButton = (framed: boolean) => (
    <button
      type="button"
      onClick={leave}
      aria-label="Sign out"
      title="Sign out"
      className={`flex size-9 shrink-0 items-center justify-center text-[var(--ink-soft)] transition-colors hover:text-[var(--accent)] ${
        framed ? "border border-[var(--line)] hover:border-[var(--accent)]" : ""
      }`}
    >
      <Icon name="signout" className="size-4" />
    </button>
  );

  return (
    <>
      {/* On the rail the theme and sign-out buttons stack above the avatar. */}
      <div className={fold(!collapsed)} inert={!collapsed}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex w-10 flex-col items-center gap-2 pb-2">
            <ThemeToggle />
            {signOutButton(false)}
          </div>
        </div>
      </div>
      <div className="flex items-center overflow-hidden">
        <Link
          href="/dashboard/profile"
          aria-label={collapsed ? "Your profile" : undefined}
          title={collapsed ? `${user.name || user.email}: profile` : "Your profile"}
          // The left padding puts the 28px avatar on the rail's centre line.
          className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-1.5 transition-colors hover:bg-[var(--paper)]"
        >
          {avatar}
          <span
            aria-hidden={collapsed || undefined}
            className={`min-w-0 flex-1 whitespace-nowrap ${fade(collapsed)}`}
          >
            <span className="block truncate text-sm">{user.name || user.email}</span>
            {user.name && (
              <span className="block truncate text-xs text-[var(--ink-faint)]">{user.email}</span>
            )}
          </span>
        </Link>
        {/* Fading alone leaves the width behind, which squeezes the avatar off the
            rail; the width folds too. The gap lives inside so it folds with it. */}
        <div
          className={`shrink-0 overflow-hidden transition-[max-width] duration-300 motion-reduce:transition-none ${EASE} ${
            collapsed ? "max-w-0" : "max-w-32"
          }`}
          inert={collapsed}
        >
          <div className={`flex shrink-0 items-center gap-2 pl-2 ${fade(collapsed)}`}>
            <ThemeToggle />
            {signOutButton(true)}
          </div>
        </div>
      </div>
    </>
  );
}
