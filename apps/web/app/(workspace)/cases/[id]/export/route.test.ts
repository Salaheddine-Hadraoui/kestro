/** @jest-environment node */
jest.mock("../../../../../features/cases/service", () => ({
  getCase: jest.fn(),
  listCaseTimelineEntries: jest.fn(),
}));
jest.mock("../../../../../features/investigations/service", () => ({
  listHypotheses: jest.fn(),
}));
jest.mock("../../../../../features/evidence/service", () => ({
  listEvidence: jest.fn(),
}));
jest.mock("../../../../../features/users/service", () => ({
  listUsers: jest.fn(),
}));

import { getCase, listCaseTimelineEntries } from "../../../../../features/cases/service";
import { listHypotheses } from "../../../../../features/investigations/service";
import { listEvidence } from "../../../../../features/evidence/service";
import { listUsers } from "../../../../../features/users/service";
import { ApiError, SessionExpiredError } from "../../../../../lib/server/api-client";
import { GET } from "./route";

describe("GET /cases/:id/export", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (listUsers as jest.Mock).mockResolvedValue([
      { id: "u1", email: "ada@example.com", name: "Ada Lovelace", role: "analyst", disabledAt: null, createdAt: "", updatedAt: "" },
    ]);
    (listHypotheses as jest.Mock).mockResolvedValue([]);
    (listEvidence as jest.Mock).mockResolvedValue([]);
    (listCaseTimelineEntries as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 100, offset: 0 });
  });

  it("returns a Markdown attachment with a deterministic filename", async () => {
    (getCase as jest.Mock).mockResolvedValue({
      id: "c1",
      title: "Suspicious VPN login",
      status: "OPEN",
      severity: "high",
      assigneeId: "u1",
      resolutionSummary: null,
      createdAt: "2026-08-21T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
      alerts: [],
    });

    const response = await GET(new Request("http://localhost:3000/cases/c1/export"), {
      params: Promise.resolve({ id: "c1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toMatch(/filename="case-c1-\d{4}-\d{2}-\d{2}\.md"/);
    const body = await response.text();
    expect(body).toContain("Suspicious VPN login");
  });

  it("propagates a 403 from getCase as a 403 JSON response", async () => {
    (getCase as jest.Mock).mockRejectedValue(new ApiError(403, "You do not have access to this case"));

    const response = await GET(new Request("http://localhost:3000/cases/c1/export"), {
      params: Promise.resolve({ id: "c1" }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.message).toBe("You do not have access to this case");
  });

  it("propagates a 404 from getCase as a 404 JSON response", async () => {
    (getCase as jest.Mock).mockRejectedValue(new ApiError(404, "Case not found"));

    const response = await GET(new Request("http://localhost:3000/cases/c1/export"), {
      params: Promise.resolve({ id: "c1" }),
    });

    expect(response.status).toBe(404);
  });

  it("redirects to /session-expired when getCase throws SessionExpiredError", async () => {
    (getCase as jest.Mock).mockRejectedValue(new SessionExpiredError());

    const response = await GET(new Request("http://localhost:3000/cases/c1/export"), {
      params: Promise.resolve({ id: "c1" }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/session-expired");
  });

  it("discloses truncation in the exported document when the timeline total exceeds 100", async () => {
    (getCase as jest.Mock).mockResolvedValue({
      id: "c1",
      title: "Suspicious VPN login",
      status: "OPEN",
      severity: "high",
      assigneeId: "u1",
      resolutionSummary: null,
      createdAt: "2026-08-21T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
      alerts: [],
    });
    (listCaseTimelineEntries as jest.Mock).mockResolvedValue({ data: [], total: 145, limit: 100, offset: 0 });

    const response = await GET(new Request("http://localhost:3000/cases/c1/export"), {
      params: Promise.resolve({ id: "c1" }),
    });

    const body = await response.text();
    expect(body).toContain(
      "Only the latest 100 timeline entries were available; earlier notes and comments are not included.",
    );
  });

  it("does not disclose truncation when the timeline total is within 100", async () => {
    (getCase as jest.Mock).mockResolvedValue({
      id: "c1",
      title: "Suspicious VPN login",
      status: "OPEN",
      severity: "high",
      assigneeId: "u1",
      resolutionSummary: null,
      createdAt: "2026-08-21T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
      alerts: [],
    });
    (listCaseTimelineEntries as jest.Mock).mockResolvedValue({ data: [], total: 12, limit: 100, offset: 0 });

    const response = await GET(new Request("http://localhost:3000/cases/c1/export"), {
      params: Promise.resolve({ id: "c1" }),
    });

    const body = await response.text();
    expect(body).not.toContain("Only the latest 100 timeline entries were available");
  });
});
