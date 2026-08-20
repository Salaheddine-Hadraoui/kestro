import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { AddEvidenceForm } from "./add-evidence-form";

describe("AddEvidenceForm", () => {
  it("renders type, source, content, and timestamp fields, all required", () => {
    render(<AddEvidenceForm caseId="c1" />);
    expect(screen.getByLabelText(/type/i)).toBeRequired();
    expect(screen.getByLabelText(/source/i)).toBeRequired();
    expect(screen.getByLabelText(/content/i)).toBeRequired();
    expect(screen.getByLabelText(/observed at/i)).toBeRequired();
  });

  it("includes the case id as a hidden field", () => {
    const { container } = render(<AddEvidenceForm caseId="c1" />);
    expect(container.querySelector('input[type="hidden"][name="caseId"]')).toHaveValue("c1");
  });

  it("renders every EvidenceType as a select option", () => {
    render(<AddEvidenceForm caseId="c1" />);
    for (const type of ["LOG", "SCREENSHOT", "FILE", "URL", "COMMAND_OUTPUT", "OTHER"]) {
      expect(screen.getByRole("option", { name: type })).toBeInTheDocument();
    }
  });
});
