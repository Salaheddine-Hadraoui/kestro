import { isPublicPath } from "./protected-paths";

describe("isPublicPath", () => {
  it("treats /login as public", () => {
    expect(isPublicPath("/login")).toBe(true);
  });

  it("treats every other path as protected", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/cases")).toBe(false);
  });
});
