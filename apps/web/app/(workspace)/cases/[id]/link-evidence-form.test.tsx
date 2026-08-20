import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { LinkEvidenceForm } from "./link-evidence-form";

describe("LinkEvidenceForm", () => {
  it("renders an evidence select populated from the given options", () => {
    render(
      <LinkEvidenceForm caseId="c1" hypothesisId="h1" evidenceOptions={[{ id: "e1", source: "auth-server" }]} />,
    );
    expect(screen.getByLabelText(/link evidence/i)).toBeInTheDocument();
    expect(screen.getByText("auth-server")).toBeInTheDocument();
  });

  it("disables the submit button when there is no unlinked evidence", () => {
    render(<LinkEvidenceForm caseId="c1" hypothesisId="h1" evidenceOptions={[]} />);
    expect(screen.getByRole("button", { name: /link evidence/i })).toBeDisabled();
  });

  it("includes the case id and hypothesis id as hidden fields", () => {
    const { container } = render(<LinkEvidenceForm caseId="c1" hypothesisId="h1" evidenceOptions={[]} />);
    expect(container.querySelector('input[type="hidden"][name="caseId"]')).toHaveValue("c1");
    expect(container.querySelector('input[type="hidden"][name="hypothesisId"]')).toHaveValue("h1");
  });
});
