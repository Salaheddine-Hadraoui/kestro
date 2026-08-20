import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { CaseForm } from "./case-form";

describe("CaseForm", () => {
  it("does not render an assignee select for an Analyst", () => {
    render(<CaseForm role="analyst" activeUsers={[]} />);
    expect(screen.queryByLabelText(/assign to/i)).not.toBeInTheDocument();
  });

  it("renders an assignee select for a Lead, listing only active users", () => {
    render(
      <CaseForm
        role="lead"
        activeUsers={[
          { id: "u1", name: "Ada Lovelace" },
          { id: "u2", name: "Grace Hopper" },
        ]}
      />,
    );
    const select = screen.getByLabelText(/assign to/i);
    expect(select).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  });

  it("always renders a title field and a severity select", () => {
    render(<CaseForm role="analyst" activeUsers={[]} />);
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/severity/i)).toBeInTheDocument();
  });

  it("renders a hidden field for each given alertId, and none when omitted", () => {
    const { container, rerender } = render(
      <CaseForm role="analyst" activeUsers={[]} alertIds={["a1", "a2"]} />,
    );
    const hiddenInputs = container.querySelectorAll('input[type="hidden"][name="alertIds"]');
    expect(hiddenInputs).toHaveLength(2);
    expect([...hiddenInputs].map((el) => (el as HTMLInputElement).value)).toEqual(["a1", "a2"]);

    rerender(<CaseForm role="analyst" activeUsers={[]} />);
    expect(container.querySelectorAll('input[type="hidden"][name="alertIds"]')).toHaveLength(0);
  });
});
