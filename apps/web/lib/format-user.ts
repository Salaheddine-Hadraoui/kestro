import type { PublicUser } from "./api/types";

export function buildUserNameMap(users: PublicUser[]): Map<string, PublicUser> {
  return new Map(users.map((user) => [user.id, user]));
}

// Falls back to the raw id (never throws, never renders blank) so a
// dangling/unresolvable reference is still visibly an id rather than
// silently disappearing from the UI.
export function resolveUserName(users: Map<string, PublicUser>, userId: string): string {
  const user = users.get(userId);
  if (!user) {
    return userId;
  }
  return user.disabledAt ? `${user.name} (disabled)` : user.name;
}
