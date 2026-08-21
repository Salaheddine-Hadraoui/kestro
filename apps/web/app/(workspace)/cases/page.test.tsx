import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

// Relative (not "@/...") specifiers deliberately: this codebase's Jest setup
// rewrites path aliases at transform time via SWC, which does not rewrite the
// string literal inside a jest.mock() call -- so an aliased mock target simply
// isn't found. Matches features/auth/service.test.ts's existing convention.
jest.mock("../../../features/auth/dal", () => ({
  verifySession: jest.fn(),
}));
jest.mock("../../../features/cases/service", () => ({
  listCases: jest.fn(),
}));
jest.mock("../../../features/users/service", () => ({
  listUsers: jest.fn(),
}));

import { verifySession } from "../../../features/auth/dal";
import { listCases } from "../../../features/cases/service";
import { listUsers } from "../../../features/users/service";
import CasesPage from "./page";

function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    title: "Suspicious login",
    status: "OPEN",
    severity: "high",
    assigneeId: "u1",
    resolutionSummary: null,
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("CasesPage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (verifySession as jest.Mock).mockResolvedValue({
      id: "u1",
      name: "Ada Lovelace",
      role: "analyst",
    });
    (listUsers as jest.Mock).mockResolvedValue([
      { id: "u1", name: "Ada Lovelace", role: "analyst", disabledAt: null },
    ]);
  });

  it("renders a case row with its title, status, severity, and assignee name", async () => {
    (listCases as jest.Mock).mockResolvedValue({
      data: [makeCase()],
      total: 1,
      limit: 25,
      offset: 0,
    });

    const jsx = await CasesPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(screen.getByText("Suspicious login")).toBeInTheDocument();
    // "OPEN" also appears as a <select> option in the status filter, so this
    // scopes to the table cell rather than screen.getByText, which would
    // otherwise match both and throw for finding multiple elements.
    expect(screen.getByRole("cell", { name: "OPEN" })).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("renders an empty state when there are no cases", async () => {
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    const jsx = await CasesPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(screen.getByText(/no cases/i)).toBeInTheDocument();
  });

  it("does not render an assignee filter control for an Analyst", async () => {
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    const jsx = await CasesPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(screen.queryByLabelText(/assignee/i)).not.toBeInTheDocument();
  });

  it("renders an assignee filter control for a Lead", async () => {
    (verifySession as jest.Mock).mockResolvedValue({ id: "u2", name: "Grace Hopper", role: "lead" });
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    const jsx = await CasesPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(screen.getByLabelText(/assignee/i)).toBeInTheDocument();
  });

  it("passes status/severity/assigneeId query params through to listCases", async () => {
    (verifySession as jest.Mock).mockResolvedValue({ id: "u2", name: "Grace Hopper", role: "lead" });
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    // A real backend assigneeId is a UUID, and the page now allowlists it as
    // one (Finding 5), so this fixture uses a well-formed UUID rather than
    // the short "u1" placeholder the other fixtures use for display names.
    await CasesPage({
      searchParams: Promise.resolve({
        status: "OPEN",
        severity: "high",
        assigneeId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      }),
    });

    expect(listCases).toHaveBeenCalledWith({
      status: "OPEN",
      severity: "high",
      assigneeId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      limit: 25,
      offset: 0,
    });
  });

  it("never sends assigneeId to listCases for an Analyst, even if present in the URL", async () => {
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    await CasesPage({ searchParams: Promise.resolve({ assigneeId: "some-user-id" }) });

    expect(listCases).toHaveBeenCalledWith(
      expect.not.objectContaining({ assigneeId: "some-user-id" }),
    );
  });

  it("renders a search input", async () => {
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    const jsx = await CasesPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(screen.getByLabelText(/search/i)).toBeInTheDocument();
  });

  it("passes a trimmed q through to listCases", async () => {
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    await CasesPage({ searchParams: Promise.resolve({ q: "  vpn  " }) });

    expect(listCases).toHaveBeenCalledWith(expect.objectContaining({ q: "vpn" }));
  });

  it("drops a whitespace-only q instead of sending it", async () => {
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    await CasesPage({ searchParams: Promise.resolve({ q: "   " }) });

    expect(listCases).toHaveBeenCalledWith(expect.objectContaining({ q: undefined }));
  });

  it("drops a q longer than 200 characters instead of sending it", async () => {
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    await CasesPage({ searchParams: Promise.resolve({ q: "a".repeat(201) }) });

    expect(listCases).toHaveBeenCalledWith(expect.objectContaining({ q: undefined }));
  });

  it("shows a Next link when more cases exist beyond the current page", async () => {
    (listCases as jest.Mock).mockResolvedValue({
      data: [makeCase()],
      total: 30,
      limit: 25,
      offset: 0,
    });

    const jsx = await CasesPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(screen.getByRole("link", { name: "Next" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Previous" })).not.toBeInTheDocument();
  });

  it("shows a Previous link but no Next link on the last page", async () => {
    // A real last page is short: with total=30 and limit=25, offset=25
    // returns the remaining 5 cases, so offset + data.length === total and
    // there is nothing further to page to.
    (listCases as jest.Mock).mockResolvedValue({
      data: [1, 2, 3, 4, 5].map((n) => makeCase({ id: `c${n}`, title: `Case ${n}` })),
      total: 30,
      limit: 25,
      offset: 25,
    });

    const jsx = await CasesPage({ searchParams: Promise.resolve({ offset: "25" }) });
    render(jsx);

    expect(screen.getByRole("link", { name: "Previous" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Next" })).not.toBeInTheDocument();
  });

  it("falls back to offset 0 for a malformed offset value instead of throwing", async () => {
    (verifySession as jest.Mock).mockResolvedValue({ id: "u2", name: "Grace Hopper", role: "lead" });
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    await CasesPage({ searchParams: Promise.resolve({ offset: "not-a-number" }) });

    expect(listCases).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }));
  });

  it("drops a malformed assigneeId instead of passing it through for a Lead", async () => {
    (verifySession as jest.Mock).mockResolvedValue({ id: "u2", name: "Grace Hopper", role: "lead" });
    (listCases as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    await CasesPage({ searchParams: Promise.resolve({ assigneeId: "not-a-uuid" }) });

    expect(listCases).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: undefined }));
  });
});
