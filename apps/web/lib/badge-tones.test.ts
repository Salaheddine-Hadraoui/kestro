import { CASE_STATUS_BADGE_TONE, SEVERITY_BADGE_TONE } from "./badge-tones";
import type { CaseStatus, Severity } from "./api/types";

// Regression guard: a new Severity/CaseStatus value added to lib/api/types.ts
// without a matching tone entry would render `undefined` classes (an
// unstyled badge) rather than fail loudly -- these tests make that omission
// a test failure instead.
describe("badge-tones", () => {
  it("maps every Severity value to a tone", () => {
    const severities: Severity[] = ["low", "medium", "high", "critical"];
    for (const severity of severities) {
      expect(SEVERITY_BADGE_TONE[severity]).toBeDefined();
    }
  });

  it("maps every CaseStatus value to a tone", () => {
    const statuses: CaseStatus[] = [
      "OPEN",
      "TRIAGING",
      "INVESTIGATING",
      "ESCALATED",
      "MITIGATING",
      "VERIFYING",
      "RESOLVED",
    ];
    for (const status of statuses) {
      expect(CASE_STATUS_BADGE_TONE[status]).toBeDefined();
    }
  });

  it("gives every CaseStatus a distinct tone from its neighbors in the lifecycle", () => {
    expect(CASE_STATUS_BADGE_TONE.ESCALATED).not.toBe(CASE_STATUS_BADGE_TONE.INVESTIGATING);
    expect(CASE_STATUS_BADGE_TONE.RESOLVED).not.toBe(CASE_STATUS_BADGE_TONE.OPEN);
  });
});
