import { Hono } from "hono"
import { sign, verify } from "hono/jwt"
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie"

export type Env = {
  BROKER_SIGNING_KEY: string
  VERCEL_CLIENT_ID: string
  VERCEL_CLIENT_SECRET: string
  VERCEL_INTEGRATION_SLUG: string
}

type SessionClaims = {
  loopback: string
  app_state: string
  provider: string
  exp: number
}

const LOOPBACK_HOST_ALLOWLIST = ["127.0.0.1", "localhost"]
const LOOPBACK_PORT_MIN = 53000
const LOOPBACK_PORT_MAX = 53999
const SESSION_TTL_SECONDS = 300

const app = new Hono<{ Bindings: Env }>()

app.get("/", (c) =>
  c.json({
    name: "tiny-bell-broker",
    ok: true,
  }),
)

app.get("/health", (c) => c.json({ ok: true }))

app.get("/vercel/authorize", async (c) => {
  const url = new URL(c.req.url)
  const loopback = url.searchParams.get("redirect")
  const appState = url.searchParams.get("state")

  if (!loopback || !appState) {
    return c.text("missing redirect or state", 400)
  }
  if (!isLoopbackRedirect(loopback)) {
    return c.text("redirect must be a Tiny Bell loopback URL", 400)
  }

  const brokerState = crypto.randomUUID()
  const claims: SessionClaims = {
    loopback,
    app_state: appState,
    provider: "vercel",
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }
  const signed = await sign(claims, c.env.BROKER_SIGNING_KEY, "HS256")

  await setSignedCookie(
    c,
    sessionCookieName(brokerState),
    signed,
    c.env.BROKER_SIGNING_KEY,
    {
      path: "/vercel",
      sameSite: "Lax",
      secure: true,
      httpOnly: true,
      maxAge: SESSION_TTL_SECONDS,
    },
  )

  const callback = `${new URL(c.req.url).origin}/vercel/callback`
  const authorize = new URL(
    `https://vercel.com/integrations/${c.env.VERCEL_INTEGRATION_SLUG}/new`,
  )
  authorize.searchParams.set("redirect_uri", callback)
  authorize.searchParams.set("state", brokerState)
  return c.redirect(authorize.toString(), 302)
})

app.get("/vercel/callback", async (c) => {
  const code = c.req.query("code")
  const brokerState = c.req.query("state")
  const providerError = c.req.query("error")

  if (!brokerState) {
    return c.text("missing state", 400)
  }

  const raw = await getSignedCookie(
    c,
    c.env.BROKER_SIGNING_KEY,
    sessionCookieName(brokerState),
  )
  deleteCookie(c, sessionCookieName(brokerState), { path: "/vercel" })

  if (!raw) {
    return c.text("session expired — please retry from Tiny Bell", 400)
  }

  const claims = await readSession(raw, c.env.BROKER_SIGNING_KEY)
  if (!claims) {
    return c.text("invalid session", 400)
  }

  if (claims.provider !== "vercel") {
    return c.text("provider mismatch", 400)
  }
  if (!isLoopbackRedirect(claims.loopback)) {
    return c.text("invalid loopback in session", 400)
  }

  if (providerError) {
    return c.redirect(
      buildLoopbackRedirect(claims.loopback, {
        state: claims.app_state,
        error: providerError,
        error_description: c.req.query("error_description") ?? "",
      }),
      302,
    )
  }

  if (!code) {
    return c.text("missing code", 400)
  }

  const callback = `${new URL(c.req.url).origin}/vercel/callback`
  const tokenResult = await exchangeVercelCode(c.env, code, callback)
  if (!tokenResult.ok) {
    return c.redirect(
      buildLoopbackRedirect(claims.loopback, {
        state: claims.app_state,
        error: "token_exchange_failed",
        error_description: tokenResult.error.slice(0, 200),
      }),
      302,
    )
  }

  const params: Record<string, string> = {
    state: claims.app_state,
    token: tokenResult.access_token,
  }
  if (tokenResult.team_id) {
    params.team_id = tokenResult.team_id
  }
  return c.redirect(buildLoopbackRedirect(claims.loopback, params), 302)
})

export default app

export function isLoopbackRedirect(raw: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  if (parsed.protocol !== "http:") return false
  if (!LOOPBACK_HOST_ALLOWLIST.includes(parsed.hostname)) return false
  if (parsed.pathname !== "/callback") return false
  const port = parsed.port ? Number.parseInt(parsed.port, 10) : NaN
  if (!Number.isFinite(port)) return false
  if (port < LOOPBACK_PORT_MIN || port > LOOPBACK_PORT_MAX) return false
  return true
}

export function buildLoopbackRedirect(
  loopback: string,
  params: Record<string, string>,
): string {
  const url = new URL(loopback)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

type TokenOk = {
  ok: true
  access_token: string
  team_id: string | null
}

type TokenErr = {
  ok: false
  error: string
}

export async function exchangeVercelCode(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<TokenOk | TokenErr> {
  const body = new URLSearchParams({
    client_id: env.VERCEL_CLIENT_ID,
    client_secret: env.VERCEL_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
  })
  const res = await fetch("https://api.vercel.com/v2/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    return { ok: false, error: `${res.status}: ${text}` }
  }
  const parsed = (await res.json()) as {
    access_token: string
    team_id?: string | null
  }
  return {
    ok: true,
    access_token: parsed.access_token,
    team_id: parsed.team_id ?? null,
  }
}

function sessionCookieName(state: string): string {
  return `tb_oauth_${state}`
}

async function readSession(
  raw: string,
  key: string,
): Promise<SessionClaims | null> {
  let payload: Record<string, unknown>
  try {
    payload = (await verify(raw, key, "HS256")) as Record<string, unknown>
  } catch {
    return null
  }
  const loopback = payload.loopback
  const appState = payload.app_state
  const provider = payload.provider
  const exp = payload.exp
  if (
    typeof loopback !== "string" ||
    typeof appState !== "string" ||
    typeof provider !== "string" ||
    typeof exp !== "number"
  ) {
    return null
  }
  return { loopback, app_state: appState, provider, exp }
}
