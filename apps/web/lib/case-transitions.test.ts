import { getAvailableActions } from "./case-transitions";

describe("getAvailableActions", () => {
  it("returns begin_triage for an OPEN case, for either role", () => {
    expect(getAvailableActions("OPEN", "analyst").map((r) => r.action)).toEqual(["begin_triage"]);
    expect(getAvailableActions("OPEN", "lead").map((r) => r.action)).toEqual(["begin_triage"]);
  });

  it("returns start_investigation and escalate for a TRIAGING case", () => {
    const actions = getAvailableActions("TRIAGING", "analyst").map((r) => r.action);
    expect(actions.sort()).toEqual(["escalate", "start_investigation"]);
  });

  it("only offers accept_escalation to a Lead, never an Analyst", () => {
    expect(getAvailableActions("ESCALATED", "lead").map((r) => r.action)).toEqual([
      "accept_escalation",
    ]);
    expect(getAvailableActions("ESCALATED", "analyst")).toEqual([]);
  });

  it("only offers reopen to a Lead, never an Analyst", () => {
    expect(getAvailableActions("RESOLVED", "lead").map((r) => r.action)).toEqual(["reopen"]);
    expect(getAvailableActions("RESOLVED", "analyst")).toEqual([]);
  });

  it("returns no actions for a status/role combination with none", () => {
    expect(getAvailableActions("VERIFYING", "analyst").map((r) => r.action)).toEqual(["resolve"]);
  });
});
