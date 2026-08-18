import { cookies } from "next/headers";

jest.mock("next/headers", () => ({
  cookies: jest.fn(),
}));

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  buildCookieOptions,
  setSessionCookies,
  clearSessionCookies,
  getAccessToken,
  getRefreshToken,
} from "./session";

function makeFakeJwt(exp: number): string {
  const base64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${base64url({ alg: "HS256" })}.${base64url({ exp })}.sig`;
}

describe("buildCookieOptions", () => {
  const REAL_NODE_ENV = process.env.NODE_ENV;

  afterEach(() => {
    jest.useRealTimers();
    process.env.NODE_ENV = REAL_NODE_ENV;
  });

  it("computes maxAge as seconds remaining until expiry", () => {
    jest.useFakeTimers().setSystemTime(new Date(1_000_000 * 1000));
    const options = buildCookieOptions(1_000_300);
    expect(options.maxAge).toBe(300);
    expect(options.path).toBe("/");
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
  });

  it("floors maxAge at 0 for an already-expired timestamp", () => {
    jest.useFakeTimers().setSystemTime(new Date(1_000_000 * 1000));
    expect(buildCookieOptions(500).maxAge).toBe(0);
  });

  it("is only secure in production", () => {
    process.env.NODE_ENV = "production";
    expect(buildCookieOptions(Date.now() / 1000 + 60).secure).toBe(true);
    process.env.NODE_ENV = "development";
    expect(buildCookieOptions(Date.now() / 1000 + 60).secure).toBe(false);
  });
});

describe("session cookie read/write", () => {
  it("sets both cookies with the token-derived expiry", async () => {
    const store = { set: jest.fn(), delete: jest.fn(), get: jest.fn() };
    (cookies as jest.Mock).mockResolvedValue(store);

    const accessToken = makeFakeJwt(Math.floor(Date.now() / 1000) + 900);
    const refreshToken = makeFakeJwt(Math.floor(Date.now() / 1000) + 2_592_000);

    await setSessionCookies({ accessToken, refreshToken });

    expect(store.set).toHaveBeenCalledWith(
      ACCESS_TOKEN_COOKIE,
      accessToken,
      expect.objectContaining({ path: "/", httpOnly: true }),
    );
    expect(store.set).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      refreshToken,
      expect.objectContaining({ path: "/", httpOnly: true }),
    );
  });

  it("clears both cookies", async () => {
    const store = { set: jest.fn(), delete: jest.fn(), get: jest.fn() };
    (cookies as jest.Mock).mockResolvedValue(store);

    await clearSessionCookies();

    expect(store.delete).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE);
    expect(store.delete).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE);
  });

  it("reads the access and refresh tokens", async () => {
    const store = {
      set: jest.fn(),
      delete: jest.fn(),
      get: jest.fn((name: string) =>
        name === ACCESS_TOKEN_COOKIE ? { value: "access-value" } : { value: "refresh-value" },
      ),
    };
    (cookies as jest.Mock).mockResolvedValue(store);

    await expect(getAccessToken()).resolves.toBe("access-value");
    await expect(getRefreshToken()).resolves.toBe("refresh-value");
  });
});
