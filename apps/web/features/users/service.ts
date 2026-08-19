import "server-only";
import { apiFetch } from "../../lib/server/api-client";
import type { PublicUser } from "../../lib/api/types";

// GET /users carries no role guard (apps/api/src/users/users.controller.ts)
// -- any authenticated user, Analyst or Lead, may list every user. Used
// here only to resolve a case's assigneeId/a timeline event's authorId to
// a display name; never used to gate anything client-side.
export async function listUsers(): Promise<PublicUser[]> {
  return apiFetch<PublicUser[]>("/users");
}
