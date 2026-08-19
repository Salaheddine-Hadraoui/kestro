import type { ReactNode } from "react";
import { verifySession } from "@/features/auth/dal";
import { getVisibleNavItems } from "@/lib/nav";
import { WorkspaceHeader } from "./workspace-header";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await verifySession();
  const navItems = getVisibleNavItems(user.role);

  return (
    <div className="flex min-h-full flex-col">
      <WorkspaceHeader user={user} navItems={navItems} />
      {/* The root layout already renders the page's single <main> landmark
          (see app/layout.tsx); this is a plain wrapper, not a second <main>,
          to avoid nesting two <main> elements on every (workspace) route. */}
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</div>
    </div>
  );
}
