import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Header } from "./header";

describe("Header", () => {
  it("renders the application name", () => {
    render(<Header />);
    expect(screen.getByText("OpsFlow")).toBeInTheDocument();
  });
});
