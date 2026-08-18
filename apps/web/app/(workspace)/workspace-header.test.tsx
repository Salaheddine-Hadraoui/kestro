import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { WorkspaceHeader } from "./workspace-header";

jest.mock("./logout-button", () => ({
  LogoutButton: () => <button>Log out</button>,
}));

describe("WorkspaceHeader", () => {
  it("shows the signed-in user's name and role, and only their visible nav items", () => {
    render(
      <WorkspaceHeader
        user={{
          id: "u1",
          email: "a@b.com",
          name: "Ada",
          role: "analyst",
          disabledAt: null,
          createdAt: "",
          updatedAt: "",
        }}
        navItems={[{ label: "Workspace", href: "/", roles: ["analyst", "lead"] }]}
      />,
    );

    expect(screen.getByText(/Ada/)).toBeInTheDocument();
    expect(screen.getByText(/analyst/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Workspace" })).toHaveAttribute("href", "/");
  });
});
