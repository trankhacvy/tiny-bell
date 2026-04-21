import { describe, expect, it } from "vitest"

import { buildLoopbackRedirect, isLoopbackRedirect } from "../src/index"

describe("isLoopbackRedirect", () => {
  it("accepts allowed loopback callbacks", () => {
    expect(isLoopbackRedirect("http://127.0.0.1:53123/callback")).toBe(true)
    expect(isLoopbackRedirect("http://127.0.0.1:53124/callback")).toBe(true)
    expect(isLoopbackRedirect("http://localhost:53125/callback")).toBe(true)
  })

  it("rejects non-http protocols", () => {
    expect(isLoopbackRedirect("https://127.0.0.1:53123/callback")).toBe(false)
    expect(isLoopbackRedirect("javascript:alert(1)")).toBe(false)
  })

  it("rejects non-loopback hosts", () => {
    expect(isLoopbackRedirect("http://evil.com:53123/callback")).toBe(false)
    expect(isLoopbackRedirect("http://10.0.0.1:53123/callback")).toBe(false)
  })

  it("rejects wrong paths", () => {
    expect(isLoopbackRedirect("http://127.0.0.1:53123/")).toBe(false)
    expect(isLoopbackRedirect("http://127.0.0.1:53123/evil")).toBe(false)
  })

  it("rejects ports outside the allowed range", () => {
    expect(isLoopbackRedirect("http://127.0.0.1:80/callback")).toBe(false)
    expect(isLoopbackRedirect("http://127.0.0.1:65000/callback")).toBe(false)
  })

  it("rejects garbage input", () => {
    expect(isLoopbackRedirect("")).toBe(false)
    expect(isLoopbackRedirect("not-a-url")).toBe(false)
  })
})

describe("buildLoopbackRedirect", () => {
  it("appends params to the loopback", () => {
    const url = buildLoopbackRedirect("http://127.0.0.1:53123/callback", {
      state: "abc",
      token: "tok_123",
      team_id: "team_xyz",
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.get("state")).toBe("abc")
    expect(parsed.searchParams.get("token")).toBe("tok_123")
    expect(parsed.searchParams.get("team_id")).toBe("team_xyz")
  })

  it("encodes special characters", () => {
    const url = buildLoopbackRedirect("http://127.0.0.1:53123/callback", {
      error_description: "hello world & more",
    })
    expect(url).toContain("hello+world+%26+more")
  })
})
