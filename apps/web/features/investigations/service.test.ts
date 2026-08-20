/** @jest-environment node */
jest.mock("../../lib/server/api-client", () => {
  const actual = jest.requireActual("../../lib/server/api-client");
  return { ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "../../lib/server/api-client";
import {
  linkEvidenceToHypothesis,
  listHypotheses,
  proposeHypothesis,
  rejectHypothesis,
  validateHypothesis,
} from "./service";

describe("investigations service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("listHypotheses calls GET /cases/:id/hypotheses", async () => {
    (apiFetch as jest.Mock).mockResolvedValue([]);
    await listHypotheses("c1");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/hypotheses");
  });

  it("proposeHypothesis posts the statement", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "h1" });
    await proposeHypothesis("c1", "Phishing led to credential theft");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/hypotheses", {
      method: "POST",
      body: JSON.stringify({ statement: "Phishing led to credential theft" }),
    });
  });

  it("validateHypothesis posts the conclusionStatement to .../validate", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "h1" });
    await validateHypothesis("c1", "h1", "Confirmed via mail logs");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/hypotheses/h1/validate", {
      method: "POST",
      body: JSON.stringify({ conclusionStatement: "Confirmed via mail logs" }),
    });
  });

  it("rejectHypothesis posts to .../reject with no body", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "h1" });
    await rejectHypothesis("c1", "h1");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/hypotheses/h1/reject", { method: "POST" });
  });

  it("linkEvidenceToHypothesis posts the evidenceId to .../evidence", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "e1" });
    await linkEvidenceToHypothesis("c1", "h1", "e1");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/hypotheses/h1/evidence", {
      method: "POST",
      body: JSON.stringify({ evidenceId: "e1" }),
    });
  });

  it("encodes ids when building request paths", async () => {
    (apiFetch as jest.Mock).mockResolvedValue([]);
    await listHypotheses("has space/slash");
    expect(apiFetch).toHaveBeenCalledWith("/cases/has%20space%2Fslash/hypotheses");
  });
});
