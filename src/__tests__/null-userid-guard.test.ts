import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---

const mockGetCurrentUserId = vi.fn();
vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
}));

const mockEnv = { GOOGLE_CLIENT_ID: "", API_TOKEN: "" };
vi.mock("@/lib/env", () => ({
  env: new Proxy({} as Record<string, string>, {
    get: (_t, key: string) => (mockEnv as Record<string, string>)[key] ?? "",
  }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    project: { create: vi.fn().mockResolvedValue({ id: "proj-1", title: "Test" }) },
    universe: { create: vi.fn().mockResolvedValue({ id: "uni-1", title: "Test" }) },
    $transaction: vi.fn().mockImplementation((fn: unknown) =>
      typeof fn === "function" ? fn({ project: { create: vi.fn().mockResolvedValue({ id: "proj-1" }) } }) : Promise.resolve([])
    ),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/sanitize-server", () => ({
  sanitizeInput: vi.fn((x: string) => x),
}));

vi.mock("@/lib/import-json", () => ({
  importProjectJson: vi.fn().mockResolvedValue({ projectId: "proj-sample" }),
}));

// --- Helpers ---

function makeRequest(path: string, body: Record<string, unknown> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe("userId=NULL guard — POST /api/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.GOOGLE_CLIENT_ID = "";
    mockEnv.API_TOKEN = "";
  });

  it("returns 401 in Google Auth mode when no userId", async () => {
    mockEnv.GOOGLE_CLIENT_ID = "google-id";
    mockGetCurrentUserId.mockReturnValue(null);

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(makeRequest("/api/projects", { title: "Test" }));
    expect(res.status).toBe(401);
  });

  it("allows creation in API_TOKEN mode without userId", async () => {
    mockEnv.API_TOKEN = "token-123";
    mockGetCurrentUserId.mockReturnValue(null);

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(makeRequest("/api/projects", { title: "Test" }));
    expect(res.status).not.toBe(401);
  });

  it("allows creation in dev mode (no auth) without userId", async () => {
    mockGetCurrentUserId.mockReturnValue(null);

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(makeRequest("/api/projects", { title: "Test" }));
    expect(res.status).not.toBe(401);
  });

  it("allows creation in Google Auth mode when userId is present", async () => {
    mockEnv.GOOGLE_CLIENT_ID = "google-id";
    mockGetCurrentUserId.mockReturnValue("user-abc");

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(makeRequest("/api/projects", { title: "Test" }));
    expect(res.status).not.toBe(401);
  });
});

describe("userId=NULL guard — POST /api/universes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.GOOGLE_CLIENT_ID = "";
    mockEnv.API_TOKEN = "";
  });

  it("returns 401 in Google Auth mode when no userId", async () => {
    mockEnv.GOOGLE_CLIENT_ID = "google-id";
    mockGetCurrentUserId.mockReturnValue(null);

    const { POST } = await import("@/app/api/universes/route");
    const res = await POST(makeRequest("/api/universes", { title: "Test Universe" }));
    expect(res.status).toBe(401);
  });

  it("allows creation in API_TOKEN mode without userId", async () => {
    mockEnv.API_TOKEN = "token-123";
    mockGetCurrentUserId.mockReturnValue(null);

    const { POST } = await import("@/app/api/universes/route");
    const res = await POST(makeRequest("/api/universes", { title: "Test Universe" }));
    expect(res.status).not.toBe(401);
  });

  it("allows creation in dev mode (no auth) without userId", async () => {
    mockGetCurrentUserId.mockReturnValue(null);

    const { POST } = await import("@/app/api/universes/route");
    const res = await POST(makeRequest("/api/universes", { title: "Test Universe" }));
    expect(res.status).not.toBe(401);
  });

  it("allows creation in Google Auth mode when userId is present", async () => {
    mockEnv.GOOGLE_CLIENT_ID = "google-id";
    mockGetCurrentUserId.mockReturnValue("user-abc");

    const { POST } = await import("@/app/api/universes/route");
    const res = await POST(makeRequest("/api/universes", { title: "Test Universe" }));
    expect(res.status).not.toBe(401);
  });
});

describe("userId=NULL guard — POST /api/onboarding/sample", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.GOOGLE_CLIENT_ID = "";
    mockEnv.API_TOKEN = "";
  });

  it("returns 401 in Google Auth mode when no userId", async () => {
    mockEnv.GOOGLE_CLIENT_ID = "google-id";
    mockGetCurrentUserId.mockReturnValue(null);

    const { POST } = await import("@/app/api/onboarding/sample/route");
    const res = await POST(makeRequest("/api/onboarding/sample"));
    expect(res.status).toBe(401);
  });

  it("allows creation in API_TOKEN mode without userId", async () => {
    mockEnv.API_TOKEN = "token-123";
    mockGetCurrentUserId.mockReturnValue(null);

    const { POST } = await import("@/app/api/onboarding/sample/route");
    const res = await POST(makeRequest("/api/onboarding/sample"));
    expect(res.status).not.toBe(401);
  });

  it("allows creation in dev mode (no auth) without userId", async () => {
    mockGetCurrentUserId.mockReturnValue(null);

    const { POST } = await import("@/app/api/onboarding/sample/route");
    const res = await POST(makeRequest("/api/onboarding/sample"));
    expect(res.status).not.toBe(401);
  });

  it("allows creation in Google Auth mode when userId is present", async () => {
    mockEnv.GOOGLE_CLIENT_ID = "google-id";
    mockGetCurrentUserId.mockReturnValue("user-abc");

    const { POST } = await import("@/app/api/onboarding/sample/route");
    const res = await POST(makeRequest("/api/onboarding/sample"));
    expect(res.status).not.toBe(401);
  });
});

describe("userId=NULL guard — POST /api/projects/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.GOOGLE_CLIENT_ID = "";
    mockEnv.API_TOKEN = "";
  });

  it("returns 401 in Google Auth mode when no userId", async () => {
    mockEnv.GOOGLE_CLIENT_ID = "google-id";
    mockGetCurrentUserId.mockReturnValue(null);

    const { POST } = await import("@/app/api/projects/import/route");
    const res = await POST(makeRequest("/api/projects/import", { title: "Imported" }));
    expect(res.status).toBe(401);
  });

  it("allows creation in API_TOKEN mode without userId", async () => {
    mockEnv.API_TOKEN = "token-123";
    mockGetCurrentUserId.mockReturnValue(null);

    const { POST } = await import("@/app/api/projects/import/route");
    const res = await POST(makeRequest("/api/projects/import", { title: "Imported" }));
    expect(res.status).not.toBe(401);
  });

  it("allows creation in dev mode (no auth) without userId", async () => {
    mockGetCurrentUserId.mockReturnValue(null);

    const { POST } = await import("@/app/api/projects/import/route");
    const res = await POST(makeRequest("/api/projects/import", { title: "Imported" }));
    expect(res.status).not.toBe(401);
  });

  it("allows creation in Google Auth mode when userId is present", async () => {
    mockEnv.GOOGLE_CLIENT_ID = "google-id";
    mockGetCurrentUserId.mockReturnValue("user-abc");

    const { POST } = await import("@/app/api/projects/import/route");
    const res = await POST(makeRequest("/api/projects/import", { title: "Imported" }));
    expect(res.status).not.toBe(401);
  });
});
