/** @jest-environment node */
jest.mock("../../lib/server/api-client", () => {
  const actual = jest.requireActual("../../lib/server/api-client");
  return { ...actual, apiFetch: jest.fn() };
});
jest.mock("../../lib/server/session", () => ({
  getRefreshToken: jest.fn(),
  setSessionCookies: jest.fn(),
  clearSessionCookies: jest.fn(),
}));

import { apiFetch, SessionExpiredError, ApiError } from "../../lib/server/api-client";
import { getRefreshToken, setSessionCookies, clearSessionCookies } from "../../lib/server/session";
import { login, logout, fetchCurrentUser, InvalidCredentialsError } from "./service";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("login", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn();
  });

  it("sets session cookies and returns the user on success", async () => {
    const user = { id: "u1", email: "a@b.com", name: "A", role: "analyst" };
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(200, { accessToken: "at", refreshToken: "rt", user }),
    );

    await expect(login("a@b.com", "pw")).resolves.toEqual(user);
    expect(setSessionCookies).toHaveBeenCalledWith({ accessToken: "at", refreshToken: "rt" });
  });

  it("throws InvalidCredentialsError on a 401", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(401, { statusCode: 401, message: "Invalid credentials" }),
    );

    await expect(login("a@b.com", "wrong")).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(setSessionCookies).not.toHaveBeenCalled();
  });
});

describe("logout", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 204 }));
  });

  it("calls the backend logout and always clears cookies", async () => {
    (getRefreshToken as jest.Mock).mockResolvedValue("rt");
    await logout();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/auth/logout"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(clearSessionCookies).toHaveBeenCalled();
  });

  it("still clears cookies when there is no refresh token to revoke", async () => {
    (getRefreshToken as jest.Mock).mockResolvedValue(undefined);
    await logout();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(clearSessionCookies).toHaveBeenCalled();
  });

  it("still clears cookies when the backend call throws", async () => {
    (getRefreshToken as jest.Mock).mockResolvedValue("rt");
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));
    await logout();
    expect(clearSessionCookies).toHaveBeenCalled();
  });
});

describe("fetchCurrentUser", () => {
  it("returns the user on success", async () => {
    const user = { id: "u1", email: "a@b.com", name: "A", role: "analyst" };
    (apiFetch as jest.Mock).mockResolvedValue(user);
    await expect(fetchCurrentUser()).resolves.toEqual(user);
  });

  it("returns null when the session has expired", async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new SessionExpiredError());
    await expect(fetchCurrentUser()).resolves.toBeNull();
  });

  it("rethrows other errors", async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new ApiError(500, "boom"));
    await expect(fetchCurrentUser()).rejects.toBeInstanceOf(ApiError);
  });
});
