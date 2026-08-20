import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Section } from "./section";

describe("Section", () => {
  it("renders the title as a level-2 heading and renders its children", () => {
    render(
      <Section title="Linked alerts">
        <p>No alerts linked to this case.</p>
      </Section>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Linked alerts" })).toBeInTheDocument();
    expect(screen.getByText("No alerts linked to this case.")).toBeInTheDocument();
  });
});
