import { describe, expect, it } from "vitest";
import { shareableSignInLink } from "./shareable-sign-in-link";

describe("shareableSignInLink", () => {
  it("copies only the sign-in address, without page path, query or fragment", () => {
    expect(shareableSignInLink("https://portal.itinium.co.uk/jobs/9?email=example%40test.com&password=secret#token")).toBe(
      "https://portal.itinium.co.uk/login",
    );
  });

  it("rejects credentials in the configured address and insecure links", () => {
    expect(() => shareableSignInLink("https://user:secret@portal.itinium.co.uk/")).toThrow();
    expect(() => shareableSignInLink("http://portal.itinium.co.uk/")).toThrow();
  });
});