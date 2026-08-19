import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

// Relative (not "@/...") specifiers deliberately: this codebase's Jest setup
// rewrites path aliases at transform time via SWC, which does not rewrite the
// string literal inside a jest.mock() call -- so an aliased mock target simply
// isn't found. Matches features/auth/service.test.ts's existing convention.
jest.mock("../../../../features/auth/dal", () => ({ verifySession: jest.fn() }));
jest.mock("../../../../features/cases/service", () => ({
  getCase: jest.fn(),
  listCaseTimelineEntries: jest.fn(),
}));
jest.mock("../../../../features/users/service", () => ({ listUsers: jest.fn() }));

import { verifySession } from "../../../../features/auth/dal";
import { getCase, listCaseTimelineEntries } from "../../../../features/cases/service";
import { listUsers } from "../../../../features/users/service";
import { ApiError } from "@/lib/server/api-client";
import CaseDetailPage from "./page";

const kase = {
  id: "c1",
  title: "Suspicious login",
  status: "INVESTIGATING",
  severity: "high",
  assigneeId: "u1",
  resolutionSummary: null,
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
  alerts: [{ id: "a1", source: "manual", summary: "Odd login time", severity: "medium", status: "linked", dismissReason: null, createdAt: "2026-08-19T00:00:00.000Z" }],
};

describe("CaseDetailPage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (verifySession as jest.Mock).mockResolvedValue({ id: "u1", name: "Ada Lovelace", role: "analyst" });
    (listUsers as jest.Mock).mockResolvedValue([{ id: "u1", name: "Ada Lovelace", role: "analyst", disabledAt: null }]);
    (listCaseTimelineEntries as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 100, offset: 0 });
  });

  it("renders the case's title, status, severity, and assignee name", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText("Suspicious login")).toBeInTheDocument();
    expect(screen.getByText("INVESTIGATING")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("renders linked alerts read-only, with no action controls", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText("Odd login time")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it("renders the resolution summary only when the case is RESOLVED", async () => {
    (getCase as jest.Mock).mockResolvedValue({
      ...kase,
      status: "RESOLVED",
      resolutionSummary: "Confirmed benign, closed.",
    });

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText("Confirmed benign, closed.")).toBeInTheDocument();
  });

  it("renders a clear message when the case is forbidden (403)", async () => {
    (getCase as jest.Mock).mockRejectedValue(new ApiError(403, "You do not have access to this case"));

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
    expect(screen.queryByText(kase.title)).not.toBeInTheDocument();
  });

  it("renders a clear message when the case does not exist (404)", async () => {
    (getCase as jest.Mock).mockRejectedValue(new ApiError(404, "Case not found"));

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "does-not-exist" }) });
    render(jsx);

    expect(screen.getByText(/case not found/i)).toBeInTheDocument();
  });

  it("renders only the transition buttons valid for the current status and role", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase); // status: INVESTIGATING, analyst
    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByRole("button", { name: /escalate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /begin mitigation/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept escalation/i })).not.toBeInTheDocument();
  });

  it("does not render the reassign form for an Analyst", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.queryByLabelText(/reassign to/i)).not.toBeInTheDocument();
  });

  it("renders the reassign form for a Lead", async () => {
    (verifySession as jest.Mock).mockResolvedValue({ id: "u2", name: "Grace Hopper", role: "lead" });
    (getCase as jest.Mock).mockResolvedValue(kase);
    (listUsers as jest.Mock).mockResolvedValue([
      { id: "u1", name: "Ada Lovelace", role: "analyst", disabledAt: null },
      { id: "u2", name: "Grace Hopper", role: "lead", disabledAt: null },
    ]);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByLabelText(/reassign to/i)).toBeInTheDocument();
  });

  it("renders notes and comments extracted from the timeline, and excludes system events", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    (listCaseTimelineEntries as jest.Mock).mockResolvedValue({
      data: [
        {
          id: "e1",
          caseId: "c1",
          type: "comment",
          authorId: "u1",
          content: { text: "Agreed, escalating" },
          createdAt: "2026-08-19T01:00:00.000Z",
          author: { id: "u1", name: "Ada Lovelace", role: "analyst" },
        },
        {
          id: "e2",
          caseId: "c1",
          type: "note",
          authorId: "u1",
          content: { event: "assignee_changed", fromAssigneeId: "u1", toAssigneeId: "u2" },
          createdAt: "2026-08-19T00:30:00.000Z",
          author: { id: "u1", name: "Ada Lovelace", role: "analyst" },
        },
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText("Agreed, escalating")).toBeInTheDocument();
    expect(screen.queryByText(/assignee_changed/i)).not.toBeInTheDocument();
  });

  it("shows add-note and add-comment forms when the case is not resolved", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByRole("button", { name: /add note/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add comment/i })).toBeInTheDocument();
  });

  it("hides add-note and add-comment forms when the case is resolved", async () => {
    (getCase as jest.Mock).mockResolvedValue({ ...kase, status: "RESOLVED", resolutionSummary: "Done." });
    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.queryByRole("button", { name: /add note/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add comment/i })).not.toBeInTheDocument();
  });
});
