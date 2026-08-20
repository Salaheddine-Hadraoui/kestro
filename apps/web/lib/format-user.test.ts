import { buildUserNameMap, resolveUserName } from "./format-user";
import type { PublicUser } from "./api/types";

function makeUser(overrides: Partial<PublicUser>): PublicUser {
  return {
    id: "u1",
    email: "a@b.com",
    name: "Ada Lovelace",
    role: "analyst",
    disabledAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("buildUserNameMap / resolveUserName", () => {
  it("resolves a known user id to their name", () => {
    const map = buildUserNameMap([makeUser({ id: "u1", name: "Ada Lovelace" })]);
    expect(resolveUserName(map, "u1")).toBe("Ada Lovelace");
  });

  it("marks a disabled user's name", () => {
    const map = buildUserNameMap([
      makeUser({ id: "u1", name: "Ada Lovelace", disabledAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(resolveUserName(map, "u1")).toBe("Ada Lovelace (disabled)");
  });

  it("falls back to the raw id when the user isn't found", () => {
    const map = buildUserNameMap([]);
    expect(resolveUserName(map, "unknown-id")).toBe("unknown-id");
  });
});
