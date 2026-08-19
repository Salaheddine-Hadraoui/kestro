import type { UserRole } from "@/lib/api/types";

export interface NavItem {
  label: string;
  href: string;
  roles: UserRole[];
}

// Registry of workspace nav destinations, shared across every feature (not
// owned by any one of them). Only "Workspace" and "Cases" are real routes
// today -- Alerts/Dashboard/Investigation/Evidence/Timeline are later Phase 2
// milestones (see docs/PROGRESS.md) and are deliberately not listed here
// yet, so this foundation never links to a page that doesn't exist. Later
// milestones add entries here; the filtering mechanism below does not
// change.
export const NAV_ITEMS: NavItem[] = [
  { label: "Workspace", href: "/", roles: ["analyst", "lead"] },
  { label: "Cases", href: "/cases", roles: ["analyst", "lead"] },
];

export function getVisibleNavItems(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
