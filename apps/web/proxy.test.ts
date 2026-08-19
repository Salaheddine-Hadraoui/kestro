/** @jest-environment node */
import { NextRequest } from "next/server";
import { proxy, config } from "./proxy";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/server/cookie-names";

function makeFakeJwt(exp: number): string {
  const base64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${base64url({ alg: "HS256" })}.${base64url({ exp })}.sig`;
}

function makeRequest(
  pathname: string,
  cookies: Record<string, string> = {},
  headers: Record<string, string> = {},
): NextRequest {
  const request = new NextRequest(`http://localhost:3000${pathname}`, { headers });
  for (const [name, value] of Object.entries(cookies)) {
    request.cookies.set(name, value);
  }
  return request;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("proxy", () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  const past = Math.floor(Date.now() / 1000) - 3600;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("lets a valid access token through on a protected path", async () => {
    const request = makeRequest("/", { [ACCESS_TOKEN_COOKIE]: makeFakeJwt(future) });
    const response = await proxy(request);
    expect(response.headers.get("location")).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("redirects a valid access token away from /login", async () => {
    const request = makeRequest("/login", { [ACCESS_TOKEN_COOKIE]: makeFakeJwt(future) });
    const response = await proxy(request);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("refreshes and lets an expired access token through on a protected path when refresh succeeds", async () => {
    const newAccessToken = makeFakeJwt(future);
    const newRefreshToken = makeFakeJwt(future);
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(200, { accessToken: newAccessToken, refreshToken: newRefreshToken }),
    );
    const request = makeRequest("/", {
      [ACCESS_TOKEN_COOKIE]: makeFakeJwt(past),
      [REFRESH_TOKEN_COOKIE]: "valid-refresh-token",
    });
    const response = await proxy(request);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get(ACCESS_TOKEN_COOKIE)?.value).toBe(newAccessToken);
    expect(response.cookies.get(REFRESH_TOKEN_COOKIE)?.value).toBe(newRefreshToken);
  });

  it("redirects to /login and clears cookies when refresh fails on a protected path", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(401, { statusCode: 401 }));
    const request = makeRequest("/", {
      [ACCESS_TOKEN_COOKIE]: makeFakeJwt(past),
      [REFRESH_TOKEN_COOKIE]: "invalid-refresh-token",
    });
    const response = await proxy(request);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    expect(response.cookies.get(ACCESS_TOKEN_COOKIE)?.value).toBe("");
    expect(response.cookies.get(REFRESH_TOKEN_COOKIE)?.value).toBe("");
  });

  it("does not throw and fails closed when the refresh response body is malformed", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { unexpected: "shape" }));
    const request = makeRequest("/", {
      [ACCESS_TOKEN_COOKIE]: makeFakeJwt(past),
      [REFRESH_TOKEN_COOKIE]: "some-refresh-token",
    });
    const response = await proxy(request);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("lets a request through to /login when there is no session at all", async () => {
    const request = makeRequest("/login");
    const response = await proxy(request);
    expect(response.headers.get("location")).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not attempt refresh when visiting /session-expired", async () => {
    const request = makeRequest("/session-expired", {
      [ACCESS_TOKEN_COOKIE]: makeFakeJwt(past),
      [REFRESH_TOKEN_COOKIE]: "some-refresh-token",
    });
    const response = await proxy(request);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("config.matcher", () => {
  it("matches the expected shape, excluding background prefetch/RSC requests", () => {
    expect(config.matcher).toEqual([
      {
        source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
        missing: [
          { type: "header", key: "next-router-prefetch" },
          { type: "header", key: "purpose", value: "prefetch" },
        ],
      },
    ]);
  });
});
