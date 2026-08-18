import { isTokenValid } from "./token-validity";

function makeFakeJwt(exp: number): string {
  const base64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${base64url({ alg: "HS256" })}.${base64url({ exp })}.sig`;
}

describe("isTokenValid", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns false for undefined", () => {
    expect(isTokenValid(undefined)).toBe(false);
  });

  it("returns false for a malformed token", () => {
    expect(isTokenValid("not-a-jwt")).toBe(false);
  });

  it("returns true for a token expiring well beyond the leeway window", () => {
    jest.useFakeTimers().setSystemTime(new Date(1_000_000 * 1000));
    expect(isTokenValid(makeFakeJwt(1_000_100))).toBe(true);
  });

  it("returns false for a token whose exp is already in the past", () => {
    jest.useFakeTimers().setSystemTime(new Date(1_000_000 * 1000));
    expect(isTokenValid(makeFakeJwt(999_900))).toBe(false);
  });

  it("returns false for a token expiring within the leeway window", () => {
    jest.useFakeTimers().setSystemTime(new Date(1_000_000 * 1000));
    expect(isTokenValid(makeFakeJwt(1_000_010), 30)).toBe(false);
  });

  it("returns false for a token whose exp exactly equals now", () => {
    jest.useFakeTimers().setSystemTime(new Date(1_000_000 * 1000));
    expect(isTokenValid(makeFakeJwt(1_000_000), 0)).toBe(false);
  });
});
