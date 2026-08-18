import { render, screen } from "@testing-library/react";
import { TextField } from "./text-field";

describe("TextField", () => {
  it("associates the label with the input", () => {
    render(<TextField label="Email" name="email" type="email" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("name", "email");
    expect(input).toHaveAttribute("type", "email");
  });
});
