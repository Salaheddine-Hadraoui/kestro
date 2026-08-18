import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the title and optional description", () => {
    render(<EmptyState title="No cases assigned to you" description="Check back later." />);
    expect(screen.getByText("No cases assigned to you")).toBeInTheDocument();
    expect(screen.getByText("Check back later.")).toBeInTheDocument();
  });

  it("renders without a description", () => {
    render(<EmptyState title="No alerts pending triage" />);
    expect(screen.getByText("No alerts pending triage")).toBeInTheDocument();
  });
});
