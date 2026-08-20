import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import NotFound from "./not-found";

describe("NotFound", () => {
  it("renders a clear message and a link back to the workspace", () => {
    render(<NotFound />);
    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to workspace/i })).toHaveAttribute("href", "/");
  });
});
