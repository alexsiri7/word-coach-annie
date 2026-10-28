import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    chatMessage: { count: vi.fn(async () => 1) },
    conversation: { update: vi.fn() },
  };
  return { prisma: { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)), tx } };
});
vi.mock("@/lib/ai/adk-agent", () => ({
  runSimpleCompletion: vi.fn(async () => "Summary of discussion."),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { compressConversation } from "@/lib/ai/chat-compression";
import { runSimpleCompletion } from "@/lib/ai/adk-agent";
import { prisma } from "@/lib/db";

const { tx } = prisma as unknown as { tx: {
  chatMessage: { count: ReturnType<typeof vi.fn> };
  conversation: { update: ReturnType<typeof vi.fn> };
} };

const baseConversation = {
  id: "conv-1",
  projectId: "proj-1",
  title: "Test chat",
  type: "chat",
  summary: null,
  summarizedThroughMessageId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const makeMessage = (id: string, role: string, content: string) => ({
  id,
  conversationId: "conv-1",
  role,
  content,
  createdAt: new Date(),
});

const settings = { chatWindowSize: 5, messagesUntilCompression: 15, compressionModel: "" };
const aiConfig = { apiKey: "test-key", model: "test-model" };

describe("compressConversation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls runSimpleCompletion with messages excluding the window", async () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      makeMessage(`msg-${i}`, i % 2 === 0 ? "user" : "assistant", `message ${i}`)
    );

    await compressConversation(baseConversation, messages, settings, aiConfig);

    expect(runSimpleCompletion).toHaveBeenCalledOnce();
    const callArg = vi.mocked(runSimpleCompletion).mock.calls[0][0];
    expect(callArg.userMessage).toContain("message 0");
    expect(callArg.userMessage).not.toContain("message 9");
  });

  it("updates Conversation.summary and summarizedThroughMessageId", async () => {
    const messages = Array.from({ length: 8 }, (_, i) =>
      makeMessage(`msg-${i}`, "user", `content ${i}`)
    );

    await compressConversation(baseConversation, messages, settings, aiConfig);

    expect(tx.chatMessage.count).toHaveBeenCalledWith({
      where: { id: "msg-2", conversationId: "conv-1" },
    });
    expect(tx.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: {
        summary: "Summary of discussion.",
        summarizedThroughMessageId: "msg-2",
      },
    });
  });

  it("uses compressionModel when set, falls back to aiConfig.model", async () => {
    const settingsWithModel = { ...settings, compressionModel: "gemini-flash" };
    const messages = Array.from({ length: 8 }, (_, i) =>
      makeMessage(`msg-${i}`, "user", `content ${i}`)
    );

    await compressConversation(baseConversation, messages, settingsWithModel, aiConfig);

    const callArg = vi.mocked(runSimpleCompletion).mock.calls[0][0];
    expect(callArg.aiConfig.model).toBe("gemini-flash");
  });

  it("does nothing when toCompress is empty", async () => {
    const messages = Array.from({ length: 5 }, (_, i) =>
      makeMessage(`msg-${i}`, "user", `content ${i}`)
    );

    await compressConversation(baseConversation, messages, settings, aiConfig);

    expect(runSimpleCompletion).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
