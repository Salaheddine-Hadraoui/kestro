/** @jest-environment node */
jest.mock("./session", () => ({
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn(),
  setSessionCookies: jest.fn(),
  clearSessionCookies: jest.fn(),
}));

import {
  getAccessToken,
  getRefreshToken,
  setSessionCookies,
  clearSessionCookies,
} from "./session";
import { apiFetch, refreshSession, ApiError, SessionExpiredError } from "./api-client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiFetch", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn();
  });

  it("throws SessionExpiredError when there is no access token", async () => {
    (getAccessToken as jest.Mock).mockResolvedValue(undefined);
    await expect(apiFetch("/auth/me")).rejects.toBeInstanceOf(SessionExpiredError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns parsed JSON on success", async () => {
    (getAccessToken as jest.Mock).mockResolvedValue("valid-token");
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { id: "u1" }));

    await expect(apiFetch("/auth/me")).resolves.toEqual({ id: "u1" });
  });

  it("refreshes once and retries on a 401, then succeeds", async () => {
    (getAccessToken as jest.Mock)
      .mockResolvedValueOnce("expired-token")
      .mockResolvedValueOnce("new-token");
    (getRefreshToken as jest.Mock).mockResolvedValue("refresh-token");
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, { statusCode: 401, message: "expired" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: "new-token", refreshToken: "new-refresh" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { id: "u1" }));

    await expect(apiFetch("/auth/me")).resolves.toEqual({ id: "u1" });
    expect(setSessionCookies).toHaveBeenCalledWith({
      accessToken: "new-token",
      refreshToken: "new-refresh",
    });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("throws SessionExpiredError on a second 401 after successful refresh", async () => {
    (getAccessToken as jest.Mock)
      .mockResolvedValueOnce("expired-token")
      .mockResolvedValueOnce("new-token");
    (getRefreshToken as jest.Mock).mockResolvedValue("refresh-token");
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, { statusCode: 401, message: "expired" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: "new-token", refreshToken: "new-refresh" }),
      )
      .mockResolvedValueOnce(jsonResponse(401, { statusCode: 401, message: "expired again" }));

    await expect(apiFetch("/auth/me")).rejects.toBeInstanceOf(SessionExpiredError);
    expect(clearSessionCookies).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("throws SessionExpiredError when refresh itself fails", async () => {
    (getAccessToken as jest.Mock).mockResolvedValue("expired-token");
    (getRefreshToken as jest.Mock).mockResolvedValue("refresh-token");
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(401, { statusCode: 401, message: "expired" }),
    );
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(401, { statusCode: 401, message: "invalid refresh token" }),
    );

    await expect(apiFetch("/auth/me")).rejects.toBeInstanceOf(SessionExpiredError);
    expect(clearSessionCookies).toHaveBeenCalled();
  });

  it("throws ApiError with status and message for non-401 failures", async () => {
    (getAccessToken as jest.Mock).mockResolvedValue("valid-token");
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(403, { statusCode: 403, message: "Insufficient role for this action" }),
    );

    const error = await apiFetch("/cases/1").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.message).toBe("Insufficient role for this action");
  });
});

describe("refreshSession", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn();
  });

  it("returns false with no refresh token, without calling fetch", async () => {
    (getRefreshToken as jest.Mock).mockResolvedValue(undefined);
    await expect(refreshSession()).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("clears cookies and returns false when the backend rejects the refresh token", async () => {
    (getRefreshToken as jest.Mock).mockResolvedValue("bad-token");
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(401, { statusCode: 401, message: "Invalid refresh token" }),
    );

    await expect(refreshSession()).resolves.toBe(false);
    expect(clearSessionCookies).toHaveBeenCalled();
  });
});
