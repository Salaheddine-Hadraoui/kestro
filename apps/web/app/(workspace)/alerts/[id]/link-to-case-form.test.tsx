import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { LinkToCaseForm } from "./link-to-case-form";

describe("LinkToCaseForm", () => {
  it("renders a case select populated from the given cases", () => {
    render(<LinkToCaseForm alertId="a1" cases={[{ id: "c1", title: "Suspicious login" }]} />);
    expect(screen.getByLabelText(/link to an existing case/i)).toBeInTheDocument();
    expect(screen.getByText("Suspicious login")).toBeInTheDocument();
  });

  it("disables the submit button when there are no accessible cases", () => {
    render(<LinkToCaseForm alertId="a1" cases={[]} />);
    expect(screen.getByRole("button", { name: /link to case/i })).toBeDisabled();
  });

  it("includes the alert id as a hidden field", () => {
    const { container } = render(<LinkToCaseForm alertId="a1" cases={[]} />);
    const hidden = container.querySelector('input[type="hidden"][name="alertId"]');
    expect(hidden).toHaveValue("a1");
  });
});
