import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { CaseEntryForm } from "./case-entry-form";
import { addNoteAction } from "./actions";

describe("CaseEntryForm", () => {
  it("renders a labeled textarea and a submit button for the given kind", () => {
    render(<CaseEntryForm caseId="c1" kind="note" action={addNoteAction} />);
    expect(screen.getByLabelText(/note/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add note/i })).toBeInTheDocument();
  });

  it("includes the case id as a hidden field", () => {
    const { container } = render(<CaseEntryForm caseId="c1" kind="comment" action={addNoteAction} />);
    const hidden = container.querySelector('input[type="hidden"][name="caseId"]');
    expect(hidden).toHaveValue("c1");
  });
});
