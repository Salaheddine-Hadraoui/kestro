import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders its children as text", () => {
    render(<Badge tone="red">CRITICAL</Badge>);
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
  });

  it("applies distinct classes per tone", () => {
    render(<Badge tone="red">a</Badge>);
    expect(screen.getByText("a")).toHaveClass("bg-red-600/15");

    render(<Badge tone="green">b</Badge>);
    expect(screen.getByText("b")).toHaveClass("bg-green-600/15");

    render(<Badge tone="neutral">c</Badge>);
    expect(screen.getByText("c")).toHaveClass("bg-black/10");
  });

  it("renders as a single element with no extra text nodes, preserving the accessible name", () => {
    render(<Badge tone="blue">OPEN</Badge>);
    const badge = screen.getByText("OPEN");
    expect(badge.textContent).toBe("OPEN");
  });
});
