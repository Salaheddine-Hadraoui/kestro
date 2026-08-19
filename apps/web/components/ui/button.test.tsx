import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

describe("Button", () => {
  it("renders its children and forwards the type prop", () => {
    render(<Button type="submit">Sign in</Button>);
    const button = screen.getByRole("button", { name: "Sign in" });
    expect(button).toHaveAttribute("type", "submit");
  });

  it("disables the button when disabled is passed", () => {
    render(<Button disabled>Sign in</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
