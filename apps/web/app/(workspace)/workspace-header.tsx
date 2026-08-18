import Link from "next/link";
import type { PublicUser } from "@/lib/api/types";
import type { NavItem } from "@/lib/nav";
import { LogoutButton } from "./logout-button";

export function WorkspaceHeader({
  user,
  navItems,
}: {
  user: PublicUser;
  navItems: NavItem[];
}) {
  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <span className="text-lg font-semibold">Kestro</span>
        <nav aria-label="Primary" className="flex items-center gap-4 text-sm">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm text-black/60 dark:text-white/60">
          <span>
            {user.name} · {user.role}
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
