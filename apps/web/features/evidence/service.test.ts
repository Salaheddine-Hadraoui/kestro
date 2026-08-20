/** @jest-environment node */
jest.mock("../../lib/server/api-client", () => {
  const actual = jest.requireActual("../../lib/server/api-client");
  return { ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "../../lib/server/api-client";
import { addEvidence, listEvidence } from "./service";

describe("evidence service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("listEvidence calls GET /cases/:id/evidence", async () => {
    (apiFetch as jest.Mock).mockResolvedValue([]);
    await listEvidence("c1");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/evidence");
  });

  it("addEvidence posts the type/source/content/timestamp", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "e1" });
    await addEvidence("c1", {
      type: "LOG",
      source: "auth-server",
      content: "Failed login at 03:00 UTC",
      timestamp: "2026-08-20T03:00:00.000Z",
    });
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/evidence", {
      method: "POST",
      body: JSON.stringify({
        type: "LOG",
        source: "auth-server",
        content: "Failed login at 03:00 UTC",
        timestamp: "2026-08-20T03:00:00.000Z",
      }),
    });
  });

  it("encodes the case id when building the request path", async () => {
    (apiFetch as jest.Mock).mockResolvedValue([]);
    await listEvidence("has space/slash");
    expect(apiFetch).toHaveBeenCalledWith("/cases/has%20space%2Fslash/evidence");
  });
});
