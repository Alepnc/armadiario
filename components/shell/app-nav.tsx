"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Shirt, Sparkles, LayoutGrid, User, Settings, LogOut } from "lucide-react";
import { logoutAction } from "@/features/auth/actions";
import { cn } from "@/lib/utils/cn";

const LINKS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/wardrobe", label: "Armadio", icon: Shirt },
  { href: "/stylist", label: "Stylist", icon: Sparkles },
  { href: "/outfits", label: "Outfit", icon: LayoutGrid },
  { href: "/profile", label: "Profilo", icon: User },
] as const;

function isActive(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}

export function DesktopNav({ appName, displayName }: { appName: string; displayName: string }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 hidden border-b-2 border-ink bg-paper md:block">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6">
        <Link href="/dashboard" className="font-display text-2xl font-bold tracking-tight">
          {appName}
        </Link>
        <nav aria-label="Principale" className="flex items-center gap-1">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(path, href) ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm transition-colors",
                isActive(path, href) ? "bg-ink font-medium text-lime" : "text-ink-soft hover:bg-lime/60 hover:text-ink",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-2 max-w-40 truncate text-sm text-muted">{displayName}</span>
          <Link href="/settings" aria-label="Impostazioni e privacy" className="rounded-full p-2.5 text-ink-soft hover:bg-paper-2">
            <Settings className="size-[18px]" />
          </Link>
          <form action={logoutAction}>
            <button type="submit" aria-label="Esci" className="rounded-full p-2.5 text-ink-soft hover:bg-paper-2">
              <LogOut className="size-[18px]" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

export function MobileNav({ appName }: { appName: string }) {
  const path = usePathname();
  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b-2 border-ink bg-paper px-4 md:hidden">
        <Link href="/dashboard" className="font-display text-xl font-bold tracking-tight">
          {appName}
        </Link>
        <Link href="/settings" aria-label="Impostazioni e privacy" className="rounded-full p-2 text-ink-soft">
          <Settings className="size-5" />
        </Link>
      </header>
      <nav
        aria-label="Principale"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink bg-paper pt-1.5 md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(path, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn("mx-1 flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-medium", active ? "bg-lime text-ink ring-2 ring-ink" : "text-ink-soft")}
                >
                  <Icon className="size-[22px]" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
