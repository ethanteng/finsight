import { readGaClientId, isGaClientId } from "@/lib/ga-client-id";

function setCookie(value: string): void {
  Object.defineProperty(document, "cookie", {
    value,
    writable: true,
    configurable: true,
  });
}

describe("readGaClientId", () => {
  it("reads the client id out of a GA4 cookie", () => {
    setCookie("_ga=GA1.1.1234567890.1700000000");

    expect(readGaClientId()).toBe("1234567890.1700000000");
  });

  it("finds it among other cookies", () => {
    setCookie("foo=bar; _ga=GA1.2.987.654; _ga_G0QBF34C7VK=GS1.1.x");

    // The per-property `_ga_<id>` cookie holds a session, not a client id, and
    // must not be mistaken for one.
    expect(readGaClientId()).toBe("987.654");
  });

  it.each([
    ["no analytics cookie at all", "other=1"],
    ["an empty cookie jar", ""],
    ["a malformed value", "_ga=GA1.1.notanumber"],
    ["only the property-scoped cookie", "_ga_G0QBF34C7VK=GS1.1.1700000000"],
  ])("returns null for %s", (_label, cookie) => {
    setCookie(cookie);

    expect(readGaClientId()).toBeNull();
  });
});

describe("isGaClientId", () => {
  it.each([
    ["1234567890.1700000000", true],
    ["987.654", true],
    ["", false],
    ["abc.def", false],
    ["1234567890", false],
    ["1.2.3", false],
  ])("classifies %s", (value, expected) => {
    expect(isGaClientId(value)).toBe(expected);
  });

  it("rejects a non-string", () => {
    expect(isGaClientId(42)).toBe(false);
  });
});
