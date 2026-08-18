/** @jest-environment node */
jest.mock("./session", () => ({
  getAccessToken: jest.fn(),
}));

import { getAccessToken } from "./session";
import { apiFetch, ApiError, SessionExpiredError } from "./api-client";

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

  it("throws SessionExpiredError on a 401, without attempting to refresh", async () => {
    (getAccessToken as jest.Mock).mockResolvedValue("expired-token");
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(401, { statusCode: 401, message: "expired" }),
    );
    await expect(apiFetch("/auth/me")).rejects.toBeInstanceOf(SessionExpiredError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("throws ApiError with status and message for non-401 failures", async () => {
    (getAccessToken as jest.Mock).mockResolvedValue("valid-token");
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(403, { statusCode: 403, message: "Insufficient role for this action" }),
    );
    await expect(apiFetch("/cases/1")).rejects.toMatchObject({
      status: 403,
      message: "Insufficient role for this action",
    });
  });
});
