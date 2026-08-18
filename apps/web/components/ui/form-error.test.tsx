import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { FormError } from "./form-error";

describe("FormError", () => {
  it("renders the message prop and has role alert", () => {
    render(<FormError message="This field is required" />);
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("This field is required");
  });
});
