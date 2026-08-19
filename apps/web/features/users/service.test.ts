/** @jest-environment node */
jest.mock("../../lib/server/api-client", () => {
  const actual = jest.requireActual("../../lib/server/api-client");
  return { ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "../../lib/server/api-client";
import { listUsers } from "./service";

describe("listUsers", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("fetches every user from GET /users", async () => {
    const users = [
      { id: "u1", email: "a@b.com", name: "Ada", role: "analyst", disabledAt: null, createdAt: "", updatedAt: "" },
    ];
    (apiFetch as jest.Mock).mockResolvedValue(users);

    await expect(listUsers()).resolves.toEqual(users);
    expect(apiFetch).toHaveBeenCalledWith("/users");
  });
});
