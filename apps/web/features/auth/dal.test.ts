/** @jest-environment node */

describe("verifySession", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("returns the user when one is present", async () => {
    const mockFetchCurrentUser = jest.fn().mockResolvedValue({ id: "u1", role: "analyst" });
    jest.doMock("./service", () => ({ fetchCurrentUser: mockFetchCurrentUser }));
    jest.doMock("next/navigation", () => ({
      redirect: jest.fn(() => {
        throw new Error("NEXT_REDIRECT");
      }),
    }));

    const { verifySession } = await import("./dal");
    await expect(verifySession()).resolves.toEqual({ id: "u1", role: "analyst" });

    const { redirect } = await import("next/navigation");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no user", async () => {
    const mockFetchCurrentUser = jest.fn().mockResolvedValue(null);
    jest.doMock("./service", () => ({ fetchCurrentUser: mockFetchCurrentUser }));
    jest.doMock("next/navigation", () => ({
      redirect: jest.fn(() => {
        throw new Error("NEXT_REDIRECT");
      }),
    }));

    const { verifySession } = await import("./dal");
    await expect(verifySession()).rejects.toThrow("NEXT_REDIRECT");

    const { redirect } = await import("next/navigation");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
