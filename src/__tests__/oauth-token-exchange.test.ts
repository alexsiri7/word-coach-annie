import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import { NextRequest } from "next/server";
import "./setup";

vi.mock("@/lib/oauth-tokens", async () => ({
  ...(await vi.importActual("@/lib/oauth-tokens")),
  createMcpToken: vi.fn(async () => "mock-token"),
}));

import { registerClient, createAuthCode } from "@/lib/oauth-store";
import { prisma } from "@/lib/db";
import { POST } from "@/app/oauth/token/route";

// Exercises /oauth/token against the real auth-code store, so code
// consumption order and single-use semantics are checked end to end.

const CLIENT_ID = "exchange-client";
const REDIRECT_URI = "http://localhost:4000/callback";
const VERIFIER = "correct-verifier-0123456789abcdefghijklmnopqrstuvwxyz";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

function exchange(overrides: Record<string, string> = {}): Promise<Response> {
  return POST(
    new NextRequest("http://localhost/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: overrides.code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        code_verifier: VERIFIER,
        ...overrides,
      }),
    }),
  );
}

async function issueCode(): Promise<string> {
  const { code } = await createAuthCode({
    userId: "user-1",
    email: "user@test.com",
    codeChallenge: CHALLENGE,
    codeChallengeMethod: "S256",
    redirectUri: REDIRECT_URI,
    clientId: CLIENT_ID,
  });
  return code;
}

describe("POST /oauth/token authorization_code exchange", () => {
  beforeEach(async () => {
    await prisma.oAuthAuthCode.deleteMany();
    for (const id of [CLIENT_ID, "other-client"]) {
      await registerClient({
        client_id: id,
        client_name: "Exchange App",
        redirect_uris: [REDIRECT_URI],
        grant_types: ["authorization_code", "refresh_token"],
        registered_at: Date.now(),
      });
    }
  });

  afterEach(async () => {
    await prisma.oAuthAuthCode.deleteMany();
  });

  it.each([
    ["client_id", { client_id: "other-client" }],
    ["redirect_uri", { redirect_uri: "http://localhost:4000/other" }],
    ["code_verifier", { code_verifier: "wrong-verifier" }],
  ])("a wrong %s does not consume the code, and the legitimate exchange still succeeds", async (_, bad) => {
    const code = await issueCode();

    const rejected = await exchange({ code, ...bad });
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error).toBe("invalid_grant");

    const legit = await exchange({ code });
    expect(legit.status).toBe(200);
    expect((await legit.json()).access_token).toBe("mock-token");
  });

  it("a code is single-use", async () => {
    const code = await issueCode();
    expect((await exchange({ code })).status).toBe(200);

    const replay = await exchange({ code });
    expect(replay.status).toBe(400);
    expect((await replay.json()).error).toBe("invalid_grant");
  });

  it("concurrent exchanges of one code cannot both succeed", async () => {
    const code = await issueCode();
    const statuses = (await Promise.all(Array.from({ length: 5 }, () => exchange({ code })))).map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 400)).toHaveLength(4);
  });

  it("an expired code is rejected and deleted", async () => {
    const code = await issueCode();
    await prisma.oAuthAuthCode.update({ where: { code }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await exchange({ code });
    expect(res.status).toBe(400);
    expect(await prisma.oAuthAuthCode.findUnique({ where: { code } })).toBeNull();
  });
});
