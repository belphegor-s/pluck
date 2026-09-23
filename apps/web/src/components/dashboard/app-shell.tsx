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
      className="min-h-dvh lg:grid lg:grid-cols-[var(--sidebar)_minmax(0,1fr)] lg:transition-[grid-template-columns] lg:duration-200"
      style={{ "--sidebar": collapsed ? "4.25rem" : "15.5rem" } as React.CSSProperties}
    >
      {/* Wide screens: the sidebar sits in the grid and stays put while the page scrolls. */}
      <aside
        aria-label="App"
        className="sticky top-0 hidden h-dvh flex-col border-r border-[var(--line)] bg-[var(--sheet)] lg:flex"
      >
        <div
          className={`flex h-14 shrink-0 items-center border-b border-[var(--line)] ${
            collapsed ? "justify-center" : "justify-between px-4"
          }`}
        >
          {!collapsed && (
            <Link href="/" aria-label="Pluck home" className="shrink-0">
              <Wordmark />
            </Link>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={`${collapsed ? "Expand" : "Collapse"} sidebar (Ctrl+B)`}
            className="flex size-8 items-center justify-center text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
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
          className={`absolute inset-0 cursor-default bg-[color-mix(in_srgb,var(--ink)_35%,transparent)] transition-opacity duration-200 ${
            drawer ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          id="app-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={`absolute inset-y-0 left-0 flex w-[min(18rem,86vw)] flex-col border-r border-[var(--line)] bg-[var(--sheet)] shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none ${
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
        <main id="main" className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:py-8">
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
        // Folded, the tooltips reach past the rail, so the list must not clip them.
        className={`flex-1 py-3 ${collapsed ? "overflow-visible" : "overflow-y-auto overflow-x-hidden"}`}
      >
        {GROUPS.map((group) => (
          <div key={group.label || "home"} className="px-3 pb-3">
            {group.label &&
              (collapsed ? (
                <div className="mx-2 mb-2 border-t border-[var(--line)]" aria-hidden="true" />
              ) : (
                <p className="mono mb-1 px-2 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                  {group.label}
                </p>
              ))}
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
          {collapsed ? (
            <div className="mx-2 mb-2 border-t border-[var(--line)]" aria-hidden="true" />
          ) : (
            <p className="mono mb-1 px-2 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
              Resources
            </p>
          )}
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
        {!collapsed && (
          <Link
            href="/dashboard/billing"
            className="mb-3 flex items-baseline justify-between border border-[var(--line)] bg-[var(--paper)] px-3 py-2 transition-colors hover:border-[var(--ink-faint)]"
          >
            <span className="text-xs text-[var(--ink-soft)]">Credits</span>
            <span className="mono text-sm">{formatNumber(user.credits)}</span>
          </Link>
        )}
        <UserRow user={user} collapsed={collapsed} />
      </div>
    </>
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
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={`group relative flex items-center gap-3 px-2 py-2 text-sm transition-colors ${
        collapsed ? "justify-center" : ""
      } ${
        active
          ? "bg-[var(--accent-wash)] text-[var(--ink)]"
          : "text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
      }`}
    >
      {active && (
        <span className="absolute inset-y-1 left-0 w-0.5 bg-[var(--accent)]" aria-hidden="true" />
      )}
      <Icon name={item.icon} className={`size-[18px] ${active ? "text-[var(--accent)]" : ""}`} />
      {collapsed ? (
        // Folded, the label moves into a tooltip on hover and keyboard focus.
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap border border-[var(--line)] bg-[var(--ink)] px-2 py-1 text-xs text-[var(--paper)] opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {item.label}
        </span>
      ) : (
        <span className="truncate">{item.label}</span>
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
      className="size-7 shrink-0 rounded-full border border-[var(--line)]"
    />
  ) : (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-xs text-[var(--accent)]">
      {initial}
    </span>
  );

  if (collapsed)
    return (
      <div className="flex flex-col items-center gap-2">
        <ThemeToggle />
        <button
          type="button"
          onClick={leave}
          aria-label="Sign out"
          title="Sign out"
          className="flex size-9 items-center justify-center text-[var(--ink-soft)] transition-colors hover:text-[var(--accent)]"
        >
          <Icon name="signout" className="size-4" />
        </button>
        <Link
          href="/dashboard/profile"
          aria-label="Your profile"
          title={`${user.name || user.email}: profile`}
          className="flex size-9 items-center justify-center"
        >
          {avatar}
        </Link>
      </div>
    );

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/dashboard/profile"
        title="Your profile"
        className="-m-1 flex min-w-0 flex-1 items-center gap-2 p-1 transition-colors hover:bg-[var(--paper)]"
      >
        {avatar}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{user.name || user.email}</span>
          {user.name && (
            <span className="block truncate text-xs text-[var(--ink-faint)]">{user.email}</span>
          )}
        </span>
      </Link>
      <ThemeToggle />
      <button
        type="button"
        onClick={leave}
        aria-label="Sign out"
        title="Sign out"
        className="flex size-9 shrink-0 items-center justify-center border border-[var(--line)] text-[var(--ink-soft)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        <Icon name="signout" className="size-4" />
      </button>
    </div>
  );
}
