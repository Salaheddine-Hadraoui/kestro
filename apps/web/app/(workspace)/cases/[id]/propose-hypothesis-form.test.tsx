import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ProposeHypothesisForm } from "./propose-hypothesis-form";

describe("ProposeHypothesisForm", () => {
  it("renders a required statement field and a submit button", () => {
    render(<ProposeHypothesisForm caseId="c1" />);
    expect(screen.getByLabelText(/propose a hypothesis/i)).toBeRequired();
    expect(screen.getByRole("button", { name: /propose hypothesis/i })).toBeInTheDocument();
  });

  it("includes the case id as a hidden field", () => {
    const { container } = render(<ProposeHypothesisForm caseId="c1" />);
    expect(container.querySelector('input[type="hidden"][name="caseId"]')).toHaveValue("c1");
  });
});
