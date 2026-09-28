import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./setup";
import { pruneExpiredAuthRows } from "@/lib/expired-auth-cleanup";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const now = new Date("2026-01-01T12:00:00Z");
const past = new Date(now.getTime() - 1000);
const future = new Date(now.getTime() + 1000);

function authCode(code: string, expiresAt: Date) {
  return {
    code,
    userId: "user-1",
    email: "a@example.com",
    codeChallenge: "challenge",
    codeChallengeMethod: "S256",
    redirectUri: "https://example.com/cb",
    clientId: "client-1",
    expiresAt,
  };
}

describe("pruneExpiredAuthRows", () => {
  beforeEach(async () => {
    await testPrisma.revokedToken.deleteMany();
    await testPrisma.oAuthAuthCode.deleteMany();
  });

  it("deletes expired revoked tokens and auth codes, keeping unexpired ones", async () => {
    await testPrisma.revokedToken.createMany({
      data: [
        { jti: "expired", userId: "user-1", expiresAt: past },
        { jti: "live", userId: "user-1", expiresAt: future },
      ],
    });
    await testPrisma.oAuthAuthCode.createMany({
      data: [authCode("expired", past), authCode("live", future)],
    });

    await pruneExpiredAuthRows(now);

    const tokens = await testPrisma.revokedToken.findMany();
    const codes = await testPrisma.oAuthAuthCode.findMany();
    expect(tokens.map((t) => t.jti)).toEqual(["live"]);
    expect(codes.map((c) => c.code)).toEqual(["live"]);
  });

  it("logs and swallows database errors", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    vi.spyOn(prisma.revokedToken, "deleteMany").mockRejectedValueOnce(new Error("db down"));

    await expect(pruneExpiredAuthRows(now)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      "[expired-auth-cleanup] Failed to prune expired rows:",
      expect.any(Error)
    );
  });
});
