import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { fetchCurrentUser } from "./service";
import type { PublicUser } from "../../lib/api/types";

// Memoized per server-render pass (React's cache()) so multiple Server
// Components on the same page share one /auth/me call instead of each
// independently hitting the backend (and, once a page needs several,
// independently racing a token refresh -- see the plan's Known
// architectural decisions, item 10).
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  return fetchCurrentUser();
});

export async function verifySession(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
