import { renderCaseExport } from "./case-export";
import type { CaseWithAlerts, Evidence, Hypothesis, PublicUser } from "./api/types";
import type { HumanEntry } from "./case-notes";

function makeCase(overrides: Partial<CaseWithAlerts> = {}): CaseWithAlerts {
  return {
    id: "c1",
    title: "Suspicious VPN login",
    status: "RESOLVED",
    severity: "high",
    assigneeId: "u1",
    resolutionSummary: "Credential reset, access revoked.",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    alerts: [],
    ...overrides,
  };
}

const userNames = new Map<string, PublicUser>([
  ["u1", { id: "u1", email: "ada@example.com", name: "Ada Lovelace", role: "analyst", disabledAt: null, createdAt: "", updatedAt: "" }],
]);

describe("renderCaseExport", () => {
  it("includes case metadata and the resolution summary", () => {
    const markdown = renderCaseExport({
      kase: makeCase(),
      userNames,
      hypotheses: [],
      evidence: [],
      notesAndComments: [],
      exportedAt: "2026-08-21T12:00:00.000Z",
    });

    expect(markdown).toContain("Suspicious VPN login");
    expect(markdown).toContain("RESOLVED");
    expect(markdown).toContain("Ada Lovelace");
    expect(markdown).toContain("Credential reset, access revoked.");
    expect(markdown).toContain("2026-08-21T12:00:00.000Z");
  });

  it("includes hypotheses with author, conclusion, and linked evidence", () => {
    const hypothesis: Hypothesis = {
      id: "h1",
      caseId: "c1",
      authorId: "u1",
      statement: "Attacker used a phished credential",
      status: "validated",
      conclusionStatement: "Confirmed via mail logs",
      resolvedAt: "2026-08-20T10:00:00.000Z",
      createdAt: "2026-08-20T01:00:00.000Z",
    };
    const evidence: Evidence = {
      id: "e1",
      caseId: "c1",
      timelineEventId: "t1",
      hypothesisId: "h1",
      type: "LOG",
      source: "vpn-gateway-01",
      content: "Failed login at 03:00 UTC",
      timestamp: "2026-08-20T03:00:00.000Z",
      authorId: "u1",
      createdAt: "2026-08-20T03:01:00.000Z",
    };

    const markdown = renderCaseExport({
      kase: makeCase(),
      userNames,
      hypotheses: [hypothesis],
      evidence: [evidence],
      notesAndComments: [],
      exportedAt: "2026-08-21T12:00:00.000Z",
    });

    expect(markdown).toContain("Attacker used a phished credential");
    expect(markdown).toContain("Confirmed via mail logs");
    expect(markdown).toContain("Linked evidence: vpn-gateway-01");
    expect(markdown).toContain("Linked to hypothesis: Attacker used a phished credential");
  });

  it("includes notes and comments with author attribution", () => {
    const entry: HumanEntry = {
      id: "ev1",
      kind: "note",
      text: "Confirmed the source IP is outside the VPN's normal range.",
      authorName: "Ada Lovelace",
      authorRole: "analyst",
      createdAt: "2026-08-20T02:00:00.000Z",
    };

    const markdown = renderCaseExport({
      kase: makeCase(),
      userNames,
      hypotheses: [],
      evidence: [],
      notesAndComments: [entry],
      exportedAt: "2026-08-21T12:00:00.000Z",
    });

    expect(markdown).toContain("Confirmed the source IP is outside the VPN's normal range.");
    expect(markdown).toContain("Ada Lovelace");
  });

  it("renders a graceful message for a case with no hypotheses, evidence, or notes", () => {
    const markdown = renderCaseExport({
      kase: makeCase(),
      userNames,
      hypotheses: [],
      evidence: [],
      notesAndComments: [],
      exportedAt: "2026-08-21T12:00:00.000Z",
    });

    expect(markdown).toContain("No hypotheses proposed.");
    expect(markdown).toContain("No evidence recorded.");
    expect(markdown).toContain("No notes or comments.");
  });

  it("does not include raw internal timeline event type names", () => {
    const markdown = renderCaseExport({
      kase: makeCase(),
      userNames,
      hypotheses: [],
      evidence: [],
      notesAndComments: [],
      exportedAt: "2026-08-21T12:00:00.000Z",
    });

    expect(markdown).not.toContain("status_change");
    expect(markdown).not.toContain("alert_linked");
    expect(markdown).not.toContain("evidence_added");
  });
});
