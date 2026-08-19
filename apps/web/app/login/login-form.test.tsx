import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { LoginForm } from "./login-form";

// React's useActionState needs a real (or realistic-enough) action; this
// test only exercises rendering, not submission -- submission against a
// real backend is covered by the manual verification pass (Task 10),
// which is the only place an actual HTTP round trip and redirect can be
// observed end-to-end.
describe("LoginForm", () => {
  it("renders labeled email and password fields and a submit button", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});
