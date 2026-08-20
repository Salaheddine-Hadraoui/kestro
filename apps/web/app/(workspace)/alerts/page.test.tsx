import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

jest.mock("../../../features/alerts/service", () => ({
  listAlerts: jest.fn(),
}));

import { listAlerts } from "../../../features/alerts/service";
import AlertsPage from "./page";

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

describe("AlertsPage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("renders an alert row with its summary, status, severity, and source", async () => {
    (listAlerts as jest.Mock).mockResolvedValue({ data: [makeAlert()], total: 1, limit: 25, offset: 0 });

    const jsx = await AlertsPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(screen.getByText("Suspicious login")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "new" })).toBeInTheDocument();
    expect(screen.getByText("manual")).toBeInTheDocument();
  });

  it("renders an empty state when there are no alerts", async () => {
    (listAlerts as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });
    const jsx = await AlertsPage({ searchParams: Promise.resolve({}) });
    render(jsx);
    expect(screen.getByText(/no alerts/i)).toBeInTheDocument();
  });

  it("renders a selection checkbox only for a 'new' alert, not a linked or dismissed one", async () => {
    (listAlerts as jest.Mock).mockResolvedValue({
      data: [
        makeAlert({ id: "a1", status: "new" }),
        makeAlert({ id: "a2", status: "dismissed", summary: "Old alert" }),
      ],
      total: 2,
      limit: 25,
      offset: 0,
    });
    const jsx = await AlertsPage({ searchParams: Promise.resolve({}) });
    render(jsx);
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  it("wraps the table in a form that submits selected alertIds to /cases/new", async () => {
    (listAlerts as jest.Mock).mockResolvedValue({ data: [makeAlert()], total: 1, limit: 25, offset: 0 });
    const { container } = render(await AlertsPage({ searchParams: Promise.resolve({}) }));
    const form = container.querySelector('form[action="/cases/new"]');
    expect(form).not.toBeNull();
    expect(form?.querySelector('input[type="checkbox"][name="alertIds"]')).not.toBeNull();
  });

  it("passes status/severity query params through to listAlerts", async () => {
    (listAlerts as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });
    await AlertsPage({ searchParams: Promise.resolve({ status: "new", severity: "high" }) });
    expect(listAlerts).toHaveBeenCalledWith({ status: "new", severity: "high", limit: 25, offset: 0 });
  });

  it("shows a Next link when more alerts exist beyond the current page", async () => {
    (listAlerts as jest.Mock).mockResolvedValue({ data: [makeAlert()], total: 30, limit: 25, offset: 0 });
    const jsx = await AlertsPage({ searchParams: Promise.resolve({}) });
    render(jsx);
    expect(screen.getByRole("link", { name: "Next" })).toBeInTheDocument();
  });

  it("falls back to offset 0 for a malformed offset value instead of throwing", async () => {
    (listAlerts as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });
    await AlertsPage({ searchParams: Promise.resolve({ offset: "not-a-number" }) });
    expect(listAlerts).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }));
  });
});
