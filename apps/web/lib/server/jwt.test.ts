import { decodeJwtExpirySeconds } from "./jwt";

function makeFakeJwt(payload: Record<string, unknown>): string {
  const base64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(payload)}.fake-signature`;
}

describe("decodeJwtExpirySeconds", () => {
  it("reads the numeric exp claim from a well-formed token", () => {
    const token = makeFakeJwt({ sub: "user-1", exp: 1_800_000_000 });
    expect(decodeJwtExpirySeconds(token)).toBe(1_800_000_000);
  });

  it("throws on a token that isn't three dot-separated segments", () => {
    expect(() => decodeJwtExpirySeconds("not-a-jwt")).toThrow(/three segments/);
  });

  it("throws when the payload has no numeric exp claim", () => {
    const token = makeFakeJwt({ sub: "user-1" });
    expect(() => decodeJwtExpirySeconds(token)).toThrow(/exp/);
  });
});
