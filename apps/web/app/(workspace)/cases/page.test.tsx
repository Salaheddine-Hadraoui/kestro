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

    await CasesPage({
      searchParams: Promise.resolve({ status: "OPEN", severity: "high", assigneeId: "u1" }),
    });

    expect(listCases).toHaveBeenCalledWith({
      status: "OPEN",
      severity: "high",
      assigneeId: "u1",
      limit: 25,
      offset: 0,
    });
  });
});
