import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

jest.mock("../../../../features/auth/dal", () => ({ verifySession: jest.fn() }));
jest.mock("../../../../features/users/service", () => ({ listUsers: jest.fn() }));
jest.mock("../../../../features/alerts/service", () => ({ getAlert: jest.fn() }));

import { verifySession } from "../../../../features/auth/dal";
import { listUsers } from "../../../../features/users/service";
import { getAlert } from "../../../../features/alerts/service";
import NewCasePage from "./page";

describe("NewCasePage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (verifySession as jest.Mock).mockResolvedValue({ id: "u1", name: "Ada Lovelace", role: "analyst" });
    (listUsers as jest.Mock).mockResolvedValue([]);
  });

  it("renders the form with no alert preview when no alertIds are given", async () => {
    const jsx = await NewCasePage({ searchParams: Promise.resolve({}) });
    render(jsx);
    expect(screen.queryByText(/linked alert/i)).not.toBeInTheDocument();
    expect(getAlert).not.toHaveBeenCalled();
  });

  it("previews the selected alerts and passes their resolved ids through to the form", async () => {
    (getAlert as jest.Mock).mockResolvedValue({
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
    });

    const { container } = render(
      await NewCasePage({
        searchParams: Promise.resolve({ alertIds: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
      }),
    );

    expect(screen.getByText("Suspicious login")).toBeInTheDocument();
    expect(container.querySelector('input[type="hidden"][name="alertIds"]')).toHaveValue("a1");
  });

  it("drops a malformed alertId instead of throwing or fetching it", async () => {
    const jsx = await NewCasePage({ searchParams: Promise.resolve({ alertIds: "not-a-uuid" }) });
    render(jsx);
    expect(getAlert).not.toHaveBeenCalled();
    expect(screen.queryByText(/linked alert/i)).not.toBeInTheDocument();
  });

  it("silently drops an alert id that no longer resolves", async () => {
    (getAlert as jest.Mock).mockRejectedValue(new Error("not found"));
    const jsx = await NewCasePage({
      searchParams: Promise.resolve({ alertIds: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
    });
    render(jsx);
    expect(screen.queryByText(/linked alert/i)).not.toBeInTheDocument();
  });

  it("silently drops an alert that is no longer linkable (status changed since selection)", async () => {
    const newAlertId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    const linkedAlertId = "3fa85f64-5717-4562-b3fc-2c963f66afa7";
    (getAlert as jest.Mock).mockImplementation((id: string) =>
      Promise.resolve({
        id,
        source: "manual",
        summary: id === newAlertId ? "Suspicious login" : "Already linked alert",
        severity: "high",
        status: id === newAlertId ? "new" : "linked",
        dismissReason: null,
        dismissedById: null,
        dismissedAt: null,
        rawPayload: null,
        createdAt: "2026-08-20T00:00:00.000Z",
      }),
    );

    const { container } = render(
      await NewCasePage({
        searchParams: Promise.resolve({ alertIds: [newAlertId, linkedAlertId] }),
      }),
    );

    expect(screen.getByText("Suspicious login")).toBeInTheDocument();
    expect(screen.queryByText("Already linked alert")).not.toBeInTheDocument();
    expect(screen.getByText(/1 linked alert\b/i)).toBeInTheDocument();

    const hiddenInputs = container.querySelectorAll('input[type="hidden"][name="alertIds"]');
    expect(hiddenInputs).toHaveLength(1);
    expect(hiddenInputs[0]).toHaveValue(newAlertId);
  });

  it("accepts multiple alertIds from a repeated query param", async () => {
    (getAlert as jest.Mock).mockImplementation((id: string) =>
      Promise.resolve({
        id,
        source: "manual",
        summary: `Alert ${id}`,
        severity: "medium",
        status: "new",
        dismissReason: null,
        dismissedById: null,
        dismissedAt: null,
        rawPayload: null,
        createdAt: "2026-08-20T00:00:00.000Z",
      }),
    );

    render(
      await NewCasePage({
        searchParams: Promise.resolve({
          alertIds: [
            "3fa85f64-5717-4562-b3fc-2c963f66afa6",
            "3fa85f64-5717-4562-b3fc-2c963f66afa7",
          ],
        }),
      }),
    );

    expect(screen.getByText(/2 linked alerts/i)).toBeInTheDocument();
  });
});
