/** @jest-environment node */
jest.mock("../../lib/server/api-client", () => {
  const actual = jest.requireActual("../../lib/server/api-client");
  return { ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "../../lib/server/api-client";
import { dismissAlert, getAlert, listAlerts } from "./service";

describe("alerts service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("listAlerts builds a query string from only the provided filters", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });
    await listAlerts({ status: "new", severity: "high", limit: 10, offset: 20 });
    expect(apiFetch).toHaveBeenCalledWith("/alerts?status=new&severity=high&limit=10&offset=20");
  });

  it("listAlerts omits filters that are undefined", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });
    await listAlerts({});
    expect(apiFetch).toHaveBeenCalledWith("/alerts?");
  });

  it("getAlert calls GET /alerts/:id", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "a1" });
    await getAlert("a1");
    expect(apiFetch).toHaveBeenCalledWith("/alerts/a1");
  });

  it("dismissAlert posts the reason to /alerts/:id/dismiss", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "a1" });
    await dismissAlert("a1", "False positive");
    expect(apiFetch).toHaveBeenCalledWith("/alerts/a1/dismiss", {
      method: "POST",
      body: JSON.stringify({ reason: "False positive" }),
    });
  });

  it("encodes the alert id when building the request path", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "a1" });
    await getAlert("has space/slash");
    expect(apiFetch).toHaveBeenCalledWith("/alerts/has%20space%2Fslash");
  });
});
