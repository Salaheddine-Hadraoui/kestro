import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

// Relative (not "@/...") specifiers deliberately: this codebase's Jest setup
// rewrites path aliases at transform time via SWC, which does not rewrite the
// string literal inside a jest.mock() call. Matches every other page.test.tsx
// in this codebase.
jest.mock("../../../../features/alerts/service", () => ({ getAlert: jest.fn() }));
jest.mock("../../../../features/cases/service", () => ({ listCases: jest.fn() }));
jest.mock("../../../../features/users/service", () => ({ listUsers: jest.fn() }));

import { getAlert } from "../../../../features/alerts/service";
import { listCases } from "../../../../features/cases/service";
import { listUsers } from "../../../../features/users/service";
import { ApiError } from "@/lib/server/api-client";
import AlertDetailPage from "./page";

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    source: "manual",
    summary: "Suspicious login",
    severity: "high",
    status: "new",
    dismissReason: null,
    dismissedById: null,
    dismissedAt: null,
    rawPayload: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("AlertDetailPage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 100, offset: 0 });
    (listUsers as jest.Mock).mockResolvedValue([]);
  });

  it("renders the alert's summary, status, and severity", async () => {
    (getAlert as jest.Mock).mockResolvedValue(makeAlert());
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "a1" }) });
    render(jsx);
    expect(screen.getByText("Suspicious login")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
  });

  it("renders a clear message when the alert does not exist (404)", async () => {
    (getAlert as jest.Mock).mockRejectedValue(new ApiError(404, "Alert not found"));
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "nope" }) });
    render(jsx);
    expect(screen.getByText(/alert not found/i)).toBeInTheDocument();
  });

  it("shows dismiss and link-to-case actions, and a create-case link, for a new alert", async () => {
    (getAlert as jest.Mock).mockResolvedValue(makeAlert());
    (listCases as jest.Mock).mockResolvedValue({
      data: [{ id: "c1", title: "Existing case", status: "OPEN" }],
      total: 1,
      limit: 100,
      offset: 0,
    });
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "a1" }) });
    render(jsx);
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/link to an existing case/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create case from this alert/i })).toHaveAttribute(
      "href",
      "/cases/new?alertIds=a1",
    );
  });

  it("hides dismiss and link-to-case actions once the alert is linked", async () => {
    (getAlert as jest.Mock).mockResolvedValue(makeAlert({ status: "linked" }));
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "a1" }) });
    render(jsx);
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
    expect(screen.getByText(/linked to a case/i)).toBeInTheDocument();
  });

  it("shows the dismissal reason and resolved dismisser name once dismissed", async () => {
    (getAlert as jest.Mock).mockResolvedValue(
      makeAlert({
        status: "dismissed",
        dismissReason: "False positive",
        dismissedById: "u1",
        dismissedAt: "2026-08-20T01:00:00.000Z",
      }),
    );
    (listUsers as jest.Mock).mockResolvedValue([
      { id: "u1", name: "Ada Lovelace", role: "analyst", disabledAt: null },
    ]);
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "a1" }) });
    render(jsx);
    expect(screen.getByText(/false positive/i)).toBeInTheDocument();
    expect(screen.getByText(/ada lovelace/i)).toBeInTheDocument();
  });

  it("excludes resolved cases from the link-to-case options", async () => {
    (getAlert as jest.Mock).mockResolvedValue(makeAlert());
    (listCases as jest.Mock).mockResolvedValue({
      data: [
        { id: "c1", title: "Open case", status: "OPEN" },
        { id: "c2", title: "Closed case", status: "RESOLVED" },
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "a1" }) });
    render(jsx);
    expect(screen.getByText("Open case")).toBeInTheDocument();
    expect(screen.queryByText("Closed case")).not.toBeInTheDocument();
  });

  it("renders the raw payload when present", async () => {
    (getAlert as jest.Mock).mockResolvedValue(makeAlert({ rawPayload: { host: "wks-014" } }));
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "a1" }) });
    render(jsx);
    expect(screen.getByText(/wks-014/)).toBeInTheDocument();
  });

  it("renders no raw-payload section when the alert has none", async () => {
    (getAlert as jest.Mock).mockResolvedValue(makeAlert({ rawPayload: null }));
    const jsx = await AlertDetailPage({ params: Promise.resolve({ id: "a1" }) });
    render(jsx);
    expect(screen.queryByText(/raw payload/i)).not.toBeInTheDocument();
  });
});
