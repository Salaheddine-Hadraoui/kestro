import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { DismissForm } from "./dismiss-form";

describe("DismissForm", () => {
  it("renders a required reason field and a dismiss button", () => {
    render(<DismissForm alertId="a1" />);
    expect(screen.getByLabelText(/dismiss reason/i)).toBeRequired();
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
  });

  it("includes the alert id as a hidden field", () => {
    const { container } = render(<DismissForm alertId="a1" />);
    const hidden = container.querySelector('input[type="hidden"][name="alertId"]');
    expect(hidden).toHaveValue("a1");
  });

  it("uses the warning button styling, matching other consequential, irreversible actions", () => {
    render(<DismissForm alertId="a1" />);
    expect(screen.getByRole("button", { name: /dismiss/i })).toHaveClass("bg-amber-600");
  });
});
