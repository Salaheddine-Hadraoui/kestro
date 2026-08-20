import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { RejectHypothesisForm } from "./reject-hypothesis-form";

describe("RejectHypothesisForm", () => {
  it("renders a reject button with secondary styling", () => {
    render(<RejectHypothesisForm caseId="c1" hypothesisId="h1" />);
    expect(screen.getByRole("button", { name: /reject/i })).toHaveClass("border");
  });

  it("includes the case id and hypothesis id as hidden fields", () => {
    const { container } = render(<RejectHypothesisForm caseId="c1" hypothesisId="h1" />);
    expect(container.querySelector('input[type="hidden"][name="caseId"]')).toHaveValue("c1");
    expect(container.querySelector('input[type="hidden"][name="hypothesisId"]')).toHaveValue("h1");
  });
});
