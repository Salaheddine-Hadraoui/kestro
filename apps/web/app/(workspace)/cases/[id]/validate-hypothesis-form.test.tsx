import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ValidateHypothesisForm } from "./validate-hypothesis-form";

describe("ValidateHypothesisForm", () => {
  it("renders a required conclusion field and a validate button", () => {
    render(<ValidateHypothesisForm caseId="c1" hypothesisId="h1" />);
    expect(screen.getByLabelText(/conclusion/i)).toBeRequired();
    expect(screen.getByRole("button", { name: /validate/i })).toBeInTheDocument();
  });

  it("includes the case id and hypothesis id as hidden fields", () => {
    const { container } = render(<ValidateHypothesisForm caseId="c1" hypothesisId="h1" />);
    expect(container.querySelector('input[type="hidden"][name="caseId"]')).toHaveValue("c1");
    expect(container.querySelector('input[type="hidden"][name="hypothesisId"]')).toHaveValue("h1");
  });
});
