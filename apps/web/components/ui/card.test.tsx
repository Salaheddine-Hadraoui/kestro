import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Card } from "./card";

describe("Card", () => {
  it("renders as a div by default", () => {
    render(<Card>content</Card>);
    const card = screen.getByText("content");
    expect(card.tagName).toBe("DIV");
  });

  it("renders as the element passed via `as`", () => {
    render(
      <ul>
        <Card as="li">item</Card>
      </ul>,
    );
    const card = screen.getByText("item");
    expect(card.tagName).toBe("LI");
  });

  it("merges a caller-supplied className with the base classes", () => {
    render(<Card className="p-4">content</Card>);
    const card = screen.getByText("content");
    expect(card).toHaveClass("rounded-md");
    expect(card).toHaveClass("p-4");
  });
});
