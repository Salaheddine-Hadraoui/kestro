import { getVisibleNavItems, NAV_ITEMS } from "./nav";

describe("getVisibleNavItems", () => {
  it("only returns items whose roles include the given role", () => {
    const forAnalyst = getVisibleNavItems("analyst");
    const forLead = getVisibleNavItems("lead");
    expect(forAnalyst.every((item) => item.roles.includes("analyst"))).toBe(true);
    expect(forLead.every((item) => item.roles.includes("lead"))).toBe(true);
  });

  it("only lists routes that actually exist in this milestone", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual(["/"]);
  });
});
