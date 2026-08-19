/** @jest-environment node */
jest.mock("../../lib/server/api-client", () => {
  const actual = jest.requireActual("../../lib/server/api-client");
  return { ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "../../lib/server/api-client";
import {
  addComment,
  addNote,
  createCase,
  getCase,
  listCases,
  listCaseTimelineEntries,
  reassignCase,
  transitionCase,
} from "./service";

describe("cases service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("listCases builds a query string from only the provided filters", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    await listCases({ status: "OPEN", limit: 10, offset: 20 });

    expect(apiFetch).toHaveBeenCalledWith("/cases?status=OPEN&limit=10&offset=20");
  });

  it("listCases omits filters that are undefined", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    await listCases({});

    expect(apiFetch).toHaveBeenCalledWith("/cases?");
  });

  it("getCase calls GET /cases/:id", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "c1" });
    await getCase("c1");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1");
  });

  it("createCase posts title/severity/assigneeId", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "c1" });
    await createCase({ title: "Suspicious login", severity: "high", assigneeId: "u1" });
    expect(apiFetch).toHaveBeenCalledWith("/cases", {
      method: "POST",
      body: JSON.stringify({ title: "Suspicious login", severity: "high", assigneeId: "u1" }),
    });
  });

  it("createCase omits assigneeId when not provided", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "c1" });
    await createCase({ title: "Suspicious login", severity: "high" });
    expect(apiFetch).toHaveBeenCalledWith("/cases", {
      method: "POST",
      body: JSON.stringify({ title: "Suspicious login", severity: "high" }),
    });
  });

  it("transitionCase posts the action, and resolutionSummary when given", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "c1" });
    await transitionCase("c1", "resolve", "Root cause identified and fixed.");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/transitions", {
      method: "POST",
      body: JSON.stringify({ action: "resolve", resolutionSummary: "Root cause identified and fixed." }),
    });
  });

  it("transitionCase omits resolutionSummary when not given", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "c1" });
    await transitionCase("c1", "begin_triage");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/transitions", {
      method: "POST",
      body: JSON.stringify({ action: "begin_triage" }),
    });
  });

  it("reassignCase patches the case with the new assigneeId", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "c1" });
    await reassignCase("c1", "u2");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1", {
      method: "PATCH",
      body: JSON.stringify({ assigneeId: "u2" }),
    });
  });

  it("addNote posts content to /cases/:id/notes", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "e1" });
    await addNote("c1", "Checked the logs");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/notes", {
      method: "POST",
      body: JSON.stringify({ content: "Checked the logs" }),
    });
  });

  it("addComment posts content to /cases/:id/comments", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "e1" });
    await addComment("c1", "Agreed, escalating");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/comments", {
      method: "POST",
      body: JSON.stringify({ content: "Agreed, escalating" }),
    });
  });

  it("listCaseTimelineEntries fetches up to 100 entries from the timeline endpoint", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ data: [], total: 40, limit: 100, offset: 0 });
    await listCaseTimelineEntries("c1");
    expect(apiFetch).toHaveBeenCalledWith("/cases/c1/timeline?limit=100&offset=0");
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("listCaseTimelineEntries fetches the tail page when total exceeds 100", async () => {
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce({ data: [], total: 137, limit: 100, offset: 0 })
      .mockResolvedValueOnce({ data: [], total: 137, limit: 100, offset: 37 });

    await listCaseTimelineEntries("c1");

    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(apiFetch).toHaveBeenNthCalledWith(1, "/cases/c1/timeline?limit=100&offset=0");
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/cases/c1/timeline?limit=100&offset=37");
  });

  it("encodes the case id when building the request path", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ id: "c1" });
    await getCase("has space/slash");
    expect(apiFetch).toHaveBeenCalledWith("/cases/has%20space%2Fslash");
  });
});
