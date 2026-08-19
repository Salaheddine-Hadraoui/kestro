import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ReassignForm } from "./reassign-form";

describe("ReassignForm", () => {
  it("lists only the given active users as options", () => {
    render(
      <ReassignForm
        caseId="c1"
        activeUsers={[
          { id: "u1", name: "Ada Lovelace" },
          { id: "u2", name: "Grace Hopper" },
        ]}
      />,
    );
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  });

  it("includes the case id as a hidden field", () => {
    const { container } = render(<ReassignForm caseId="c1" activeUsers={[]} />);
    const hidden = container.querySelector('input[type="hidden"][name="caseId"]');
    expect(hidden).toHaveValue("c1");
  });
});
