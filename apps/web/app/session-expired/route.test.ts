/** @jest-environment node */
// Relative (not "@/...") specifier deliberately: this codebase's Jest setup
// rewrites path aliases at transform time via SWC, which does not rewrite the
// string literal inside a jest.mock() call -- so an aliased mock target simply
// isn't found. Matches features/auth/service.test.ts's existing convention.
jest.mock("../../features/auth/service", () => ({
  logout: jest.fn(),
}));

import { logout } from "../../features/auth/service";
import { GET } from "./route";

describe("GET /session-expired", () => {
  it("revokes the session and redirects to /login", async () => {
    const request = new Request("http://localhost:3000/session-expired");
    const response = await GET(request);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });
});
