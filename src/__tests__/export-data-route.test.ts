import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest } from "next/server";
import JSZip from "jszip";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => null),
}));
vi.mock("@/lib/auth", () => ({
  isGoogleAuthMode: vi.fn(() => true),
}));
vi.mock("@/lib/export-json", () => ({
  exportProjectJson: vi.fn(async (id: string) => ({
    exportVersion: 1,
    project: { id, title: "Test" },
    structureNodes: [],
    contentVersions: [],
    storyObjects: [],
  })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getCurrentUserId } from "@/lib/api-auth";
import { isGoogleAuthMode } from "@/lib/auth";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/auth/export-data", { method: "GET" });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/auth/export-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockReturnValue(null);
    vi.mocked(isGoogleAuthMode).mockReturnValue(true);
  });

  it("returns 401 for unauthenticated request in Google auth mode", async () => {
    const { GET } = await import("@/app/api/auth/export-data/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when userId exists but user is not in DB", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("nonexistent-user");
    const { GET } = await import("@/app/api/auth/export-data/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns ZIP without profile/ai-settings in API_TOKEN mode", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue(null);
    vi.mocked(isGoogleAuthMode).mockReturnValue(false);

    const user = await testPrisma.user.create({
      data: { id: "token-user", email: "t@test.com", googleId: "g-t" },
    });
    await testPrisma.project.create({
      data: { title: "Token Project", author: "Author", userId: user.id },
    });

    const { GET } = await import("@/app/api/auth/export-data/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);

    expect(zip.file("profile.json")).toBeNull();
    expect(zip.file("ai-settings.json")).toBeNull();
    const projectFiles = Object.keys(zip.files).filter((n) => n.startsWith("projects/"));
    expect(projectFiles.length).toBeGreaterThan(0);
  });

  it("returns ZIP with correct headers for authenticated user", async () => {
    const user = await testPrisma.user.create({
      data: { id: "u1", email: "x@test.com", googleId: "g1" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { GET } = await import("@/app/api/auth/export-data/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/zip");
    expect(res.headers.get("content-disposition")).toContain("annie-full-export-");

    // ZIP magic bytes: PK\x03\x04
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it("does NOT include apiKey in AI settings export", async () => {
    const user = await testPrisma.user.create({
      data: { id: "u2", email: "y@test.com", googleId: "g2" },
    });
    await testPrisma.userAiSettings.create({
      data: {
        userId: user.id,
        apiKey: "sk-secret-key",
        model: "claude-opus-4-6",
      },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { GET } = await import("@/app/api/auth/export-data/route");
    const res = await GET(makeRequest());
    const buf = Buffer.from(await res.arrayBuffer());

    const zip = await JSZip.loadAsync(buf);
    const aiFile = zip.file("ai-settings.json");
    expect(aiFile).not.toBeNull();
    const aiContent = JSON.parse(await aiFile!.async("string"));
    expect(aiContent).not.toHaveProperty("apiKey");
    expect(aiContent).toHaveProperty("model", "claude-opus-4-6");
  });

  it("includes profile.json without sensitive fields", async () => {
    const user = await testPrisma.user.create({
      data: { id: "u3", email: "z@test.com", googleId: "g3", name: "Test User" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { GET } = await import("@/app/api/auth/export-data/route");
    const res = await GET(makeRequest());
    const buf = Buffer.from(await res.arrayBuffer());

    const zip = await JSZip.loadAsync(buf);
    const profileFile = zip.file("profile.json");
    expect(profileFile).not.toBeNull();
    const profile = JSON.parse(await profileFile!.async("string"));
    expect(profile).toHaveProperty("id", user.id);
    expect(profile).toHaveProperty("email", "z@test.com");
    expect(profile).not.toHaveProperty("googleId");
  });

  it("includes consents.json in export for authenticated user", async () => {
    const user = await testPrisma.user.create({
      data: { id: "u-consent", email: "consent@test.com", googleId: "g-consent" },
    });
    await testPrisma.userConsent.create({
      data: {
        userId: user.id,
        feature: "sentry_replay",
        consentGiven: false,
      },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { GET } = await import("@/app/api/auth/export-data/route");
    const res = await GET(makeRequest());
    const buf = Buffer.from(await res.arrayBuffer());

    const zip = await JSZip.loadAsync(buf);
    const consentsFile = zip.file("consents.json");
    expect(consentsFile).not.toBeNull();
    const consents = JSON.parse(await consentsFile!.async("string"));
    expect(consents).toHaveLength(1);
    expect(consents[0].feature).toBe("sentry_replay");
    expect(consents[0].consentGiven).toBe(false);
    expect(consents[0]).toHaveProperty("updatedAt");
  });

  it("sanitizes project titles in ZIP filenames", async () => {
    const user = await testPrisma.user.create({
      data: { id: "u4", email: "w@test.com", googleId: "g4" },
    });
    await testPrisma.project.create({
      data: { title: "My Project: Draft #1!", author: "Author", userId: user.id },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { GET } = await import("@/app/api/auth/export-data/route");
    const res = await GET(makeRequest());
    const buf = Buffer.from(await res.arrayBuffer());

    const zip = await JSZip.loadAsync(buf);
    const entries = Object.keys(zip.files);
    const projectFiles = entries.filter((n) => n.startsWith("projects/"));
    expect(projectFiles.length).toBeGreaterThan(0);
    // Title should have special chars replaced with underscores
    expect(projectFiles[0]).toMatch(/^projects\/My_Project__Draft__1_\.json$/);
  });
});
