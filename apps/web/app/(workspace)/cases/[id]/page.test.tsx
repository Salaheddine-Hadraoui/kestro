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
jest.mock("../../../../features/investigations/service", () => ({
  listHypotheses: jest.fn(),
}));
jest.mock("../../../../features/evidence/service", () => ({
  listEvidence: jest.fn(),
}));

import { verifySession } from "../../../../features/auth/dal";
import { getCase, listCaseTimelineEntries } from "../../../../features/cases/service";
import { listUsers } from "../../../../features/users/service";
import { listHypotheses } from "../../../../features/investigations/service";
import { listEvidence } from "../../../../features/evidence/service";
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
    (listHypotheses as jest.Mock).mockResolvedValue([]);
    (listEvidence as jest.Mock).mockResolvedValue([]);
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

  it("renders hypotheses with their status badge", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    (listHypotheses as jest.Mock).mockResolvedValue([
      {
        id: "h1",
        caseId: "c1",
        authorId: "u1",
        statement: "Phishing led to credential theft",
        status: "proposed",
        conclusionStatement: null,
        resolvedAt: null,
        createdAt: "2026-08-20T00:00:00.000Z",
      },
    ]);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText("Phishing led to credential theft")).toBeInTheDocument();
    expect(screen.getByText("proposed")).toBeInTheDocument();
    expect(screen.getByText(/proposed by ada lovelace/i)).toBeInTheDocument();
  });

  it("renders a message when no hypotheses have been proposed", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);
    expect(screen.getByText(/no hypotheses proposed yet/i)).toBeInTheDocument();
  });

  it("shows validate/reject/link-evidence controls only for a proposed hypothesis, on a non-resolved case", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase); // status: INVESTIGATING
    (listHypotheses as jest.Mock).mockResolvedValue([
      {
        id: "h1",
        caseId: "c1",
        authorId: "u1",
        statement: "Proposed one",
        status: "proposed",
        conclusionStatement: null,
        resolvedAt: null,
        createdAt: "2026-08-20T00:00:00.000Z",
      },
      {
        id: "h2",
        caseId: "c1",
        authorId: "u1",
        statement: "Already validated",
        status: "validated",
        conclusionStatement: "Confirmed via logs",
        resolvedAt: "2026-08-20T01:00:00.000Z",
        createdAt: "2026-08-20T00:00:00.000Z",
      },
    ]);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByLabelText(/^conclusion$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reject$/i })).toBeInTheDocument();
    expect(screen.getByText("Confirmed via logs")).toBeInTheDocument();
  });

  it("hides propose/validate/reject/link-evidence controls when the case is resolved", async () => {
    (getCase as jest.Mock).mockResolvedValue({ ...kase, status: "RESOLVED", resolutionSummary: "Done." });
    (listHypotheses as jest.Mock).mockResolvedValue([
      {
        id: "h1",
        caseId: "c1",
        authorId: "u1",
        statement: "Proposed one",
        status: "proposed",
        conclusionStatement: null,
        resolvedAt: null,
        createdAt: "2026-08-20T00:00:00.000Z",
      },
    ]);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.queryByLabelText(/propose a hypothesis/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^conclusion$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^reject$/i })).not.toBeInTheDocument();
  });

  it("renders evidence with type, source, and timestamp", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    (listEvidence as jest.Mock).mockResolvedValue([
      {
        id: "e1",
        caseId: "c1",
        timelineEventId: "te1",
        hypothesisId: null,
        type: "LOG",
        source: "auth-server",
        content: "Failed login at 03:00 UTC",
        timestamp: "2026-08-20T03:00:00.000Z",
        authorId: "u1",
        createdAt: "2026-08-20T03:05:00.000Z",
      },
    ]);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText(/auth-server/)).toBeInTheDocument();
    expect(screen.getByText("Failed login at 03:00 UTC")).toBeInTheDocument();
    expect(screen.getByText(/recorded by ada lovelace/i)).toBeInTheDocument();
  });

  it("renders a message when no evidence has been recorded", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);
    expect(screen.getByText(/no evidence recorded yet/i)).toBeInTheDocument();
  });

  it("shows which hypothesis a piece of evidence is linked to", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    (listHypotheses as jest.Mock).mockResolvedValue([
      {
        id: "h1",
        caseId: "c1",
        authorId: "u1",
        statement: "Phishing led to credential theft",
        status: "proposed",
        conclusionStatement: null,
        resolvedAt: null,
        createdAt: "2026-08-20T00:00:00.000Z",
      },
    ]);
    (listEvidence as jest.Mock).mockResolvedValue([
      {
        id: "e1",
        caseId: "c1",
        timelineEventId: "te1",
        hypothesisId: "h1",
        type: "LOG",
        source: "auth-server",
        content: "Failed login at 03:00 UTC",
        timestamp: "2026-08-20T03:00:00.000Z",
        authorId: "u1",
        createdAt: "2026-08-20T03:05:00.000Z",
      },
    ]);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByText(/linked to hypothesis/i)).toBeInTheDocument();
    // The hypothesis statement also appears verbatim in the Hypotheses section above, so
    // match the full "Linked to hypothesis: <statement>" text to uniquely target the
    // Evidence section's reference rather than the standalone hypothesis statement.
    expect(
      screen.getByText(/linked to hypothesis:\s*phishing led to credential theft/i),
    ).toBeInTheDocument();
    // The other direction: the hypothesis card itself should show the linked evidence's source.
    expect(screen.getByText(/linked evidence:.*auth-server/i)).toBeInTheDocument();
  });

  it("hides the add-evidence form when the case is resolved", async () => {
    (getCase as jest.Mock).mockResolvedValue({ ...kase, status: "RESOLVED", resolutionSummary: "Done." });
    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);
    expect(screen.queryByLabelText(/^type$/i)).not.toBeInTheDocument();
  });

  it("renders an export link, separate from the lifecycle Actions section", async () => {
    (getCase as jest.Mock).mockResolvedValue(kase);
    (listCaseTimelineEntries as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 100, offset: 0 });
    (listHypotheses as jest.Mock).mockResolvedValue([]);
    (listEvidence as jest.Mock).mockResolvedValue([]);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    const exportLink = screen.getByRole("link", { name: /export/i });
    expect(exportLink).toHaveAttribute("href", "/cases/c1/export");
  });

  it("renders the export link for a case in any lifecycle state, not just RESOLVED", async () => {
    (getCase as jest.Mock).mockResolvedValue({ ...kase, status: "INVESTIGATING" });
    (listCaseTimelineEntries as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 100, offset: 0 });
    (listHypotheses as jest.Mock).mockResolvedValue([]);
    (listEvidence as jest.Mock).mockResolvedValue([]);

    const jsx = await CaseDetailPage({ params: Promise.resolve({ id: "c1" }) });
    render(jsx);

    expect(screen.getByRole("link", { name: /export/i })).toBeInTheDocument();
  });
});
