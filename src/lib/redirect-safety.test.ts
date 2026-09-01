import { describe, expect, it } from "vitest";
import { sanitizeRedirectTarget } from "./redirect-safety";

describe("sanitizeRedirectTarget", () => {
  it("passes through a plain relative path", () => {
    expect(sanitizeRedirectTarget("/admin/users")).toBe("/admin/users");
  });

  it("passes through a relative path with a query string", () => {
    expect(sanitizeRedirectTarget("/mock/123?preview=1")).toBe("/mock/123?preview=1");
  });

  it("defaults to / for null or empty input", () => {
    expect(sanitizeRedirectTarget(null)).toBe("/");
    expect(sanitizeRedirectTarget(undefined)).toBe("/");
    expect(sanitizeRedirectTarget("")).toBe("/");
  });

  it("rejects an absolute external URL", () => {
    expect(sanitizeRedirectTarget("https://evil.example/phish")).toBe("/");
    expect(sanitizeRedirectTarget("http://evil.example")).toBe("/");
  });

  it("rejects a protocol-relative URL", () => {
    expect(sanitizeRedirectTarget("//evil.example")).toBe("/");
  });

  it("rejects a path with no leading slash", () => {
    expect(sanitizeRedirectTarget("evil.example")).toBe("/");
  });
});
