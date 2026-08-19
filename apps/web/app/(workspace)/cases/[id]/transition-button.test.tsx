import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { TransitionButton } from "./transition-button";
import type { CaseTransitionRule } from "@/lib/case-transitions";

const rule: CaseTransitionRule = {
  action: "begin_triage",
  from: "OPEN",
  to: "TRIAGING",
  roles: ["analyst", "lead"],
  requiresResolutionSummary: false,
};

const resolveRule: CaseTransitionRule = {
  action: "resolve",
  from: "VERIFYING",
  to: "RESOLVED",
  roles: ["analyst", "lead"],
  requiresResolutionSummary: true,
};

describe("TransitionButton", () => {
  it("renders a submit button labeled with the action", () => {
    render(<TransitionButton caseId="c1" rule={rule} />);
    expect(screen.getByRole("button", { name: /begin triage/i })).toBeInTheDocument();
  });

  it("renders a required resolution summary field only for the resolve action", () => {
    render(<TransitionButton caseId="c1" rule={resolveRule} />);
    expect(screen.getByLabelText(/resolution summary/i)).toBeRequired();
  });

  it("does not render a resolution summary field for a non-resolve action", () => {
    render(<TransitionButton caseId="c1" rule={rule} />);
    expect(screen.queryByLabelText(/resolution summary/i)).not.toBeInTheDocument();
  });

  it("includes the case id as a hidden field", () => {
    const { container } = render(<TransitionButton caseId="c1" rule={rule} />);
    const hidden = container.querySelector('input[type="hidden"][name="caseId"]');
    expect(hidden).toHaveValue("c1");
  });
});
