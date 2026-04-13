# Research Report: Multi-Perspective Story Review with Claude AI Agents

**Date:** April 13, 2026  
**Purpose:** Implementation research for a feature that sends a manuscript to three Claude AI agents in parallel (Publisher, Avid Reader, Experienced Writer personas), collects ~400-word structured feedback from each, then synthesizes agreement/disagreement into a structured JSON output.

---

## Table of Contents

1. [Claude Agent SDK — Overview & Parallel Execution](#1-claude-agent-sdk--overview--parallel-execution)
2. [Subagents: Defining & Running Personas in Parallel](#2-subagents-defining--running-personas-in-parallel)
3. [Structured Output / JSON Mode](#3-structured-output--json-mode)
4. [Direct Anthropic API — Parallel Concurrent Requests](#4-direct-anthropic-api--parallel-concurrent-requests)
5. [Rate Limits & Concurrency Constraints](#5-rate-limits--concurrency-constraints)
6. [Creative Writing Persona Prompting Best Practices](#6-creative-writing-persona-prompting-best-practices)
7. [Multi-Agent Architecture Patterns from Anthropic Engineering](#7-multi-agent-architecture-patterns-from-anthropic-engineering)
8. [Recommended Implementation Pattern](#8-recommended-implementation-pattern)
9. [Key Sources](#9-key-sources)

---

## 1. Claude Agent SDK — Overview & Parallel Execution

**Source:** https://code.claude.com/docs/en/agent-sdk/overview  
**Date context:** Current (April 2026), SDK was recently renamed from "Claude Code SDK" to "Claude Agent SDK."

### Installation

```bash
# TypeScript
npm install @anthropic-ai/claude-agent-sdk

# Python
pip install claude-agent-sdk
```

### Core `query()` API

The Agent SDK exposes a single streaming `query()` function for both Python and TypeScript:

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    async for message in query(
        prompt="Find and fix the bug in auth.py",
        options=ClaudeAgentOptions(allowed_tools=["Read", "Edit", "Bash"]),
    ):
        print(message)

asyncio.run(main())
```

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Find and fix the bug in auth.py",
  options: { allowedTools: ["Read", "Edit", "Bash"] }
})) {
  console.log(message);
}
```

### Key capabilities

| Feature | Description |
|---|---|
| Built-in tools | Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Monitor, AskUserQuestion |
| Subagents | Define named agents with custom prompts, tools, and models |
| Sessions | Resume agents with full conversation history via `resume: sessionId` |
| MCP | Connect to external systems (databases, browsers, etc.) |
| Hooks | Pre/post tool use callbacks for logging, validation, blocking |
| Structured output | Return validated JSON matching a schema from agent workflows |

### Agent SDK vs. Anthropic Client SDK

The Agent SDK handles the tool-execution loop automatically. The Client SDK requires you to implement the loop yourself:

```python
# Client SDK: you implement the loop
response = client.messages.create(...)
while response.stop_reason == "tool_use":
    result = your_tool_executor(response.tool_use)
    response = client.messages.create(tool_result=result, **params)

# Agent SDK: handled automatically
async for message in query(prompt="..."):
    print(message)
```

**Key implication for our feature:** For manuscript review we don't need file tools—we're sending text in a prompt and expecting a structured text response. The **Anthropic Client SDK** (`anthropic` package) is likely simpler and sufficient; the Agent SDK adds overhead (subprocesses, tool loops) that isn't needed for pure text → structured JSON tasks. However, the Agent SDK's subagent pattern is the canonical way to run multiple named personas.

---

## 2. Subagents: Defining & Running Personas in Parallel

**Source:** https://code.claude.com/docs/en/agent-sdk/subagents  
**Date context:** Current (April 2026)

### What subagents provide

- **Context isolation:** Each subagent runs in its own fresh conversation window. Intermediate steps stay inside the subagent; only its final message returns to the parent.
- **Parallelization:** Multiple subagents can run concurrently, dramatically speeding up workflows.
- **Specialized instructions:** Each subagent gets its own system prompt with tailored persona and constraints.
- **Tool restrictions:** Subagents can be limited to specific tools.

### Defining subagents programmatically

Use the `agents` parameter in `query()` options. Include `"Agent"` in `allowedTools` since Claude invokes subagents via the Agent tool.

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition

async def main():
    async for message in query(
        prompt="Use the code-reviewer agent to review this codebase",
        options=ClaudeAgentOptions(
            allowed_tools=["Read", "Glob", "Grep", "Agent"],
            agents={
                "code-reviewer": AgentDefinition(
                    description="Expert code reviewer for quality and security reviews.",
                    prompt="Analyze code quality and suggest improvements.",
                    tools=["Read", "Glob", "Grep"],
                )
            },
        ),
    ):
        if hasattr(message, "result"):
            print(message.result)

asyncio.run(main())
```

### AgentDefinition fields

| Field | Type | Required | Description |
|---|---|---|---|
| `description` | `string` | Yes | Tells Claude when to use this subagent (automatic matching) |
| `prompt` | `string` | Yes | The subagent's system prompt defining role and behavior |
| `tools` | `string[]` | No | Allowed tools. Omit to inherit all parent tools |
| `model` | `'sonnet' \| 'opus' \| 'haiku' \| 'inherit'` | No | Model override. Defaults to main model |
| `skills` | `string[]` | No | Skill names available to this agent |
| `memory` | `'user' \| 'project' \| 'local'` | No | Memory source (Python only) |
| `mcpServers` | `(string \| object)[]` | No | MCP servers available to this agent |

### Parallel subagent execution

Subagents run in parallel when Claude decides multiple independent tasks can be processed simultaneously. The key documentation note:

> "Multiple subagents can run concurrently, dramatically speeding up complex workflows. Example: during a code review, you can run `style-checker`, `security-scanner`, and `test-coverage` subagents simultaneously, reducing review time from minutes to seconds."

To **guarantee** Claude uses specific subagents, mention them by name explicitly in the prompt:

```text
"Use the publisher-reviewer, reader-reviewer, and writer-reviewer agents simultaneously to review the manuscript"
```

### What subagents inherit vs. don't inherit

| Subagent receives | Subagent does NOT receive |
|---|---|
| Its own system prompt + the Agent tool's prompt string | Parent's conversation history or tool results |
| Project CLAUDE.md (if `settingSources` configured) | Skills (unless listed in `AgentDefinition.skills`) |
| Tool definitions (inherited or restricted via `tools` field) | The parent's system prompt |

**Important:** The only channel from parent to subagent is the Agent tool's prompt string. Include all context (manuscript text, instructions) directly in that prompt.

### Detecting subagent invocation in message stream

```python
async for message in query(...):
    if hasattr(message, "content") and message.content:
        for block in message.content:
            if getattr(block, "type", None) == "tool_use" and block.name in ("Task", "Agent"):
                print(f"Subagent invoked: {block.input.get('subagent_type')}")
    
    if hasattr(message, "parent_tool_use_id") and message.parent_tool_use_id:
        print("  (running inside subagent)")
    
    if hasattr(message, "result"):
        print(message.result)
```

**Note:** The tool name was renamed from `"Task"` to `"Agent"` in Claude Code v2.1.63. Check both for compatibility.

### Limitation: Subagents cannot spawn their own subagents

> "Subagents cannot spawn their own subagents. Don't include `Agent` in a subagent's `tools` array."

---

## 3. Structured Output / JSON Mode

**Source:** https://code.claude.com/docs/en/agent-sdk/structured-outputs and https://platform.claude.com/docs/en/build-with-claude/structured-outputs  
**Date context:** Current (April 2026) — generally available for Claude Opus 4.6, Sonnet 4.6, Sonnet 4.5, Opus 4.5, Haiku 4.5, and Claude Mythos Preview.

### Overview

Structured outputs constrain Claude's responses to follow a specific JSON schema using constrained decoding — the schema is compiled into a grammar that prevents invalid JSON from being generated.

Two complementary features:
- **JSON outputs** (`output_config.format`): Get Claude's response in a specific JSON format  
- **Strict tool use** (`strict: true`): Guarantee schema validation on tool names and inputs

### Agent SDK: `outputFormat` / `output_format` option

Pass a JSON schema to `query()` via `outputFormat` (TypeScript) or `output_format` (Python). The result message includes a `structured_output` field.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

const schema = {
  type: "object",
  properties: {
    company_name: { type: "string" },
    founded_year: { type: "number" },
    headquarters: { type: "string" }
  },
  required: ["company_name"]
};

for await (const message of query({
  prompt: "Research Anthropic and provide key company information",
  options: {
    outputFormat: {
      type: "json_schema",
      schema: schema
    }
  }
})) {
  if (message.type === "result" && message.subtype === "success" && message.structured_output) {
    console.log(message.structured_output);
    // { company_name: "Anthropic", founded_year: 2021, headquarters: "San Francisco, CA" }
  }
}
```

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage

schema = {
    "type": "object",
    "properties": {
        "company_name": {"type": "string"},
        "founded_year": {"type": "number"},
        "headquarters": {"type": "string"},
    },
    "required": ["company_name"],
}

async def main():
    async for message in query(
        prompt="Research Anthropic and provide key company information",
        options=ClaudeAgentOptions(
            output_format={"type": "json_schema", "schema": schema}
        ),
    ):
        if isinstance(message, ResultMessage) and message.structured_output:
            print(message.structured_output)

asyncio.run(main())
```

### Type-safe schemas with Zod (TypeScript) and Pydantic (Python)

Instead of writing raw JSON Schema, use Zod or Pydantic to generate schemas and get typed output:

```typescript
import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";

const ReviewSchema = z.object({
  overall_impression: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  specific_feedback: z.string(),
  recommendation: z.enum(["publish", "revise", "reject"])
});

type Review = z.infer<typeof ReviewSchema>;

const schema = z.toJSONSchema(ReviewSchema);

for await (const message of query({
  prompt: "Review the manuscript as a Publisher...",
  options: { outputFormat: { type: "json_schema", schema } }
})) {
  if (message.type === "result" && message.subtype === "success" && message.structured_output) {
    const parsed = ReviewSchema.safeParse(message.structured_output);
    if (parsed.success) {
      const review: Review = parsed.data;
      console.log(review.recommendation);
    }
  }
}
```

```python
from pydantic import BaseModel
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage

class ManuscriptReview(BaseModel):
    overall_impression: str
    strengths: list[str]
    weaknesses: list[str]
    specific_feedback: str
    word_count_estimate: int
    recommendation: str  # 'publish', 'revise', 'reject'

async def main():
    async for message in query(
        prompt="Review the manuscript as a Publisher...",
        options=ClaudeAgentOptions(
            output_format={
                "type": "json_schema",
                "schema": ManuscriptReview.model_json_schema(),
            }
        ),
    ):
        if isinstance(message, ResultMessage) and message.structured_output:
            review = ManuscriptReview.model_validate(message.structured_output)
            print(review.recommendation)
```

### Error handling for structured output

```python
async for message in query(...):
    if isinstance(message, ResultMessage):
        if message.subtype == "success" and message.structured_output:
            # Use the validated output
            print(message.structured_output)
        elif message.subtype == "error_max_structured_output_retries":
            # Agent couldn't produce valid output after multiple attempts
            print("Could not produce valid output — retry with simpler schema")
```

| Result subtype | Meaning |
|---|---|
| `success` | Output generated and validated successfully |
| `error_max_structured_output_retries` | Agent couldn't produce valid output after multiple attempts |

### Direct API: `output_config.format` (non-Agent SDK)

For the Anthropic Client SDK (direct API, not the Agent SDK), the structured output parameter is `output_config.format`:

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=2048,
    system="You are a Publisher reviewing manuscripts.",
    messages=[{"role": "user", "content": manuscript_text}],
    output_config={
        "format": {
            "type": "json_schema",
            "json_schema": {
                "name": "manuscript_review",
                "schema": review_schema
            }
        }
    }
)
```

**Migration note:** The `output_format` parameter (beta) has moved to `output_config.format`. The old beta header `structured-outputs-2025-11-13` and `output_format` parameter will continue working during a transition period.

### Tips for reliable structured output

- **Keep schemas focused.** Deeply nested schemas with many required fields are harder to satisfy.
- **Match schema to task.** Make fields optional if the task might not always have that information.
- **Use clear prompts.** Ambiguous prompts make it harder for the agent to know what output to produce.
- **Use `enum` for categorical fields** like recommendation: `["publish", "revise", "reject"]`

---

## 4. Direct Anthropic API — Parallel Concurrent Requests

**Source:** https://deepwiki.com/anthropics/anthropic-sdk-python/4.2-synchronous-and-asynchronous-clients  
**Date context:** 2025

### Async client for concurrent requests

The Anthropic SDK provides both sync and async clients:

```python
import asyncio
import anthropic

async def get_review(client: anthropic.AsyncAnthropic, persona: str, manuscript: str) -> dict:
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=f"You are a {persona} reviewing manuscripts. Return JSON.",
        messages=[{"role": "user", "content": manuscript}]
    )
    return {"persona": persona, "review": response.content[0].text}

async def run_parallel_reviews(manuscript: str) -> list[dict]:
    client = anthropic.AsyncAnthropic()
    
    personas = [
        "seasoned Publisher focused on market viability",
        "passionate Avid Reader focused on engagement",
        "Experienced Writer focused on craft and technique"
    ]
    
    # Run all three reviews concurrently
    tasks = [get_review(client, persona, manuscript) for persona in personas]
    results = await asyncio.gather(*tasks)
    return list(results)

reviews = asyncio.run(run_parallel_reviews(manuscript_text))
```

### Using aiohttp for better async performance

```bash
pip install anthropic[aiohttp]
```

The async client supports `aiohttp` instead of `httpx` for potentially better concurrency. Install the extra and set:

```python
client = anthropic.AsyncAnthropic()  # automatically uses aiohttp if installed
```

### TypeScript parallel requests with Promise.all

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

async function getReview(persona: string, manuscript: string) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are a ${persona} reviewing manuscripts. Return JSON.`,
    messages: [{ role: "user", content: manuscript }]
  });
  return { persona, review: response.content[0] };
}

async function runParallelReviews(manuscript: string) {
  const personas = [
    "seasoned Publisher focused on market viability",
    "passionate Avid Reader focused on engagement",
    "Experienced Writer focused on craft and technique"
  ];

  // Run all three reviews concurrently
  const reviews = await Promise.all(
    personas.map(persona => getReview(persona, manuscript))
  );
  return reviews;
}
```

### Semaphore pattern for rate limit compliance

When running many requests in parallel, use a semaphore to avoid hitting rate limits:

```python
import asyncio
import anthropic

async def run_bounded_parallel(prompts: list[str], max_concurrent: int = 5):
    client = anthropic.AsyncAnthropic()
    semaphore = asyncio.Semaphore(max_concurrent)

    async def bounded_call(prompt: str) -> str:
        async with semaphore:
            response = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}]
            )
            return response.content[0].text

    return await asyncio.gather(*[bounded_call(p) for p in prompts])
```

For our 3-persona use case, a semaphore is unnecessary — 3 concurrent requests is well within all tier limits.

---

## 5. Rate Limits & Concurrency Constraints

**Source:** https://platform.claude.com/docs/en/api/rate-limits  
**Date context:** Current (April 2026)

### Rate limit types

Rate limits are measured in:
- **RPM** — requests per minute
- **ITPM** — input tokens per minute (uncached only for most models)
- **OTPM** — output tokens per minute

### Rate limits by tier (Claude Sonnet 4.x)

| Tier | RPM | ITPM | OTPM |
|---|---|---|---|
| Tier 1 | 50 | 30,000 | 8,000 |
| Tier 2 | 1,000 | 450,000 | 90,000 |
| Tier 3 | 2,000 | 800,000 | 160,000 |
| Tier 4 | 4,000 | 2,000,000 | 400,000 |

**Important:** Even Tier 1 supports 50 RPM — 3 simultaneous requests is easily within limits.

### Rate limits for Claude Opus 4.x

Same RPM/ITPM/OTPM as Sonnet 4.x per tier. The Opus limit applies to combined traffic across Opus 4.6, 4.5, 4.1, and 4.

### Key rate limit behaviors

- **Token bucket algorithm** — capacity replenishes continuously rather than resetting at fixed intervals.
- **Short bursts** can still exceed limits even if average rate is within bounds (e.g., 60 RPM enforced as 1 RPS).
- **Uncached tokens only** count toward ITPM for most models. Using prompt caching for the shared manuscript text can dramatically increase effective throughput.
- **429 errors** include a `retry-after` header. Response headers include `anthropic-ratelimit-*` fields for monitoring.
- **Acceleration limits** — sharp increases in usage can trigger 429s even below the standard limit. Ramp up gradually.
- **Rate limits are separate per model class** — you can use Opus and Sonnet simultaneously up to their respective limits.

### Response headers for rate limit monitoring

```
anthropic-ratelimit-requests-limit
anthropic-ratelimit-requests-remaining
anthropic-ratelimit-requests-reset
anthropic-ratelimit-input-tokens-limit
anthropic-ratelimit-input-tokens-remaining
anthropic-ratelimit-input-tokens-reset
anthropic-ratelimit-output-tokens-limit
anthropic-ratelimit-output-tokens-remaining
anthropic-ratelimit-output-tokens-reset
retry-after
```

### Prompt caching for manuscripts

Since all three reviewers receive the same manuscript text, prompt caching is highly applicable:

```python
response = await client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": manuscript_text,
            "cache_control": {"type": "ephemeral"}  # cache the manuscript
        }
    ],
    messages=[{"role": "user", "content": "Review as a Publisher..."}]
)
```

Cached tokens do NOT count toward ITPM (for non-legacy models), effectively multiplying available throughput.

---

## 6. Creative Writing Persona Prompting Best Practices

**Sources:**  
- https://www.superpath.co/blog/synthetic-feedback  
- https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices  
- https://minu.co.nz/using-claude-the-ai-chatbot-by-anthropic-as-a-line-editor-and-critique-group/  
- https://novelmage.com/blog/claude-4-for-writers-the-complete-ai-writing-assistant-guide-that-actually-works

### Persona structure for synthetic manuscript reviewers

From Superpath research, each persona should be defined with these five sections:

1. **Background** — career context, reporting relationships, experience level
2. **Daily Reality** — day-to-day activities, what success looks like for them
3. **Pain Points** — specific challenges and constraints they face
4. **Content Needs** — how they relate to and use manuscripts
5. **Review Lens** — their evaluation filters, what they're skeptical of

### Example persona prompts for the three reviewers

**Publisher persona:**
```text
You are a seasoned acquisitions editor at a major publishing house with 15 years of experience. 
Your background: You evaluate manuscripts for commercial viability, market positioning, and editorial quality.
Daily reality: You read 50+ query letters weekly, acquire 8-12 books per year, report to a publisher who cares about profit margins.
Pain points: Manuscripts that are technically competent but commercially risky; beautiful writing with no market; genre-bending work that's hard to position.
Review lens: Market fit, competitive titles, hook strength, pacing for modern readers, series potential, author platform.

Review the manuscript below. Provide ~400 words of structured feedback covering:
- Commercial viability and market positioning
- Hook and opening strength
- Pacing and structural issues
- Comparable titles
- Your acquisition recommendation

Return your response as JSON matching this schema: {...}
```

**Avid Reader persona:**
```text
You are an enthusiastic fiction reader who reads 4-5 books per month across genres.
Your background: You're active in book clubs, write Goodreads reviews, and have strong opinions about what makes a book unputdownable.
Daily reality: You read during commutes, before bed, on weekends. You abandon books after 50 pages if they don't grab you.
Pain points: Slow openings, inconsistent characters, info-dumping, purple prose, endings that don't satisfy.
Review lens: Emotional engagement, character relatability, dialogue authenticity, pacing momentum, satisfaction of story promises.

Review the manuscript below. Provide ~400 words of structured feedback covering:
- Would you keep reading past page 50? Why or why not?
- Which characters resonated or felt flat?
- Where did you feel bored, confused, or hooked?
- How does the emotional payoff feel?
- Your reader recommendation (1-5 stars with rationale)

Return your response as JSON matching this schema: {...}
```

**Experienced Writer persona:**
```text
You are a published novelist with three literary fiction titles and an MFA from Iowa.
Your background: You teach creative writing workshops and have deep craft knowledge.
Daily reality: You think about sentence rhythm, scene construction, point of view fidelity, and thematic coherence daily.
Pain points: Rushed scenes, head-hopping POV, passive constructions masking weak action, themes that aren't dramatized.
Review lens: Prose style, scene vs. summary balance, POV consistency, dialogue subtext, thematic coherence, voice distinctiveness.

Review the manuscript below. Provide ~400 words of structured feedback covering:
- Prose style and voice assessment
- Scene construction and pacing technique
- POV and narrative distance issues
- Dialogue effectiveness
- Thematic development
- Three specific craft recommendations

Return your response as JSON matching this schema: {...}
```

### Effective feedback request structure

From the Superpath research, standardized feedback sections improve consistency:

1. Initial reaction to relevance/engagement
2. Specific elements that resonate (with quoted passages)
3. Critical gaps and unanswered questions
4. Practical constraints ignored
5. Credibility/plausibility issues
6. Missing examples or supporting evidence
7. One prioritized fix

For the synthesis step, prompt Claude to generate "a table with: Reviewer, Issue, Recommended Change" and "a prioritized list of the top 5 cross-reviewer findings."

### Claude 4 best practices for persona prompting

From Anthropic's official Claude 4 prompting guide:

**Give Claude a role in the system prompt:**
```python
client.messages.create(
    model="claude-sonnet-4-6",
    system="You are a seasoned Publisher reviewing manuscripts with 15 years of acquisitions experience.",
    messages=[{"role": "user", "content": manuscript}]
)
```

**Use XML tags for structured manuscript delivery:**
```xml
<manuscript>
  <title>The Lost Harbor</title>
  <genre>Literary Fiction</genre>
  <excerpt>
    {{FIRST_50_PAGES}}
  </excerpt>
</manuscript>

Review this manuscript from your perspective as a Publisher...
```

**Put long content at the top of the prompt:**
> "Put longform data at the top: Place your long documents and inputs near the top of your prompt, above your query, instructions, and examples. This can significantly improve performance across all models."
> "Queries at the end can improve response quality by up to 30% in tests, especially with complex, multi-document inputs."

**Use examples to steer output format:**
Include 3-5 example review snippets in `<example>` tags to establish the tone and structure you want. This dramatically improves accuracy and consistency.

**Prompt for parallel tool use (if using Agent SDK):**
```text
If you intend to call multiple tools and there are no dependencies between the tool calls, make all of the independent tool calls in parallel.
```

**Explicit instructions for JSON output (without structured output mode):**
```text
Respond ONLY with valid JSON. Do not include any text before or after the JSON object. Do not use markdown code fences.
```

---

## 7. Multi-Agent Architecture Patterns from Anthropic Engineering

**Source:** https://www.anthropic.com/engineering/multi-agent-research-system  
**Date context:** 2025-2026

### Orchestrator-worker model

Anthropic's production multi-agent research system uses an **orchestrator-worker pattern**:

1. **Lead agent** analyzes the query, develops a strategy, spawns 3-5 subagents in parallel
2. **Subagents** independently execute their tasks, use 3+ tools in parallel internally
3. **Lead agent** synthesizes results and decides if more research is needed
4. **Separate CitationAgent** handles post-processing

This architecture **cut research time by up to 90%** for complex queries versus sequential execution.

### Model choice for orchestrator vs. workers

Performance testing at Anthropic showed:

> "A multi-agent system with Claude Opus 4 as the lead agent and Claude Sonnet 4 subagents outperformed single-agent Claude Opus 4 by 90.2%."

**Implication for manuscript review:** Consider using a cheaper/faster model (Haiku or Sonnet) for the three reviewer agents, and Sonnet or Opus for the synthesis/consensus step.

### Token economics

Multi-agent systems consume significantly more tokens:
- Agents use ~4× more tokens than chat interactions
- Multi-agent systems use ~15× more tokens than chat
- Token usage alone explains 80% of performance variance

**For manuscript review:** Three 400-word reviews (~1,200 output tokens total) is relatively lightweight. The manuscript input (~10,000-50,000 words) is the main cost driver — prompt caching is critical.

### Artifact system for passing results

Rather than loading all subagent results into context, Anthropic's system uses an **artifact pattern**:

> "Subagents call tools to store their work in external systems, then pass lightweight references back to the coordinator. This prevents information loss during multi-stage processing."

For manuscript review this is simpler: each reviewer returns its JSON directly. No external storage needed since the output is bounded (~400 words each).

### Current architectural limitation: synchronous subagent execution

> "Lead agents execute subagents synchronously, waiting for each set of subagents to complete before proceeding."

This means even in the Agent SDK, the orchestrator waits for all three reviewers to finish before proceeding to synthesis. **The parallelism is real** (reviewers run simultaneously), but the orchestrator blocks until all complete.

### Claude Managed Agents (April 2026, public beta)

Anthropic launched **Claude Managed Agents** on April 8, 2026 — a hosted infrastructure for deploying autonomous agents without managing runtime, sandboxing, or tool execution infrastructure. Separate rate limits apply:

| Operation | Limit |
|---|---|
| Create endpoints (agents, sessions, environments) | 60 requests/minute |
| Read endpoints (retrieve, list, stream) | 600 requests/minute |

This is an enterprise/production-scale option, but direct API calls or the Agent SDK are appropriate for the manuscript review feature.

---

## 8. Recommended Implementation Pattern

Based on all research, here is the recommended architecture for the multi-perspective story review feature:

### Option A: Direct Anthropic Client SDK (Recommended for simplicity)

Use `AsyncAnthropic` with `asyncio.gather()` / `Promise.all()` for true parallel execution. Use structured outputs via `output_config.format`. Apply prompt caching to the manuscript.

**Why:** No subagent overhead, simpler code, full control over prompts, works with structured output mode natively.

```python
import asyncio
import anthropic
from pydantic import BaseModel

class IndividualReview(BaseModel):
    persona: str  # "Publisher" | "Avid Reader" | "Experienced Writer"
    overall_impression: str
    strengths: list[str]
    weaknesses: list[str]
    detailed_feedback: str  # ~400 words
    recommendation: str  # "publish" | "revise" | "reject"

class Consensus(BaseModel):
    points_of_agreement: list[str]
    points_of_disagreement: list[str]
    synthesized_recommendation: str
    top_priorities: list[str]

class MultiPerspectiveReview(BaseModel):
    manuscript_title: str
    reviews: list[IndividualReview]
    consensus: Consensus

REVIEWER_PERSONAS = {
    "Publisher": """You are a seasoned acquisitions editor with 15 years of experience...""",
    "Avid Reader": """You are an enthusiastic fiction reader who reads 4-5 books per month...""",
    "Experienced Writer": """You are a published novelist with an MFA and deep craft knowledge...""",
}

REVIEW_SCHEMA = IndividualReview.model_json_schema()

async def get_single_review(
    client: anthropic.AsyncAnthropic,
    persona_name: str,
    persona_prompt: str,
    manuscript: str
) -> IndividualReview:
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=[
            {
                "type": "text",
                "text": manuscript,
                "cache_control": {"type": "ephemeral"}  # cache the manuscript
            },
            {
                "type": "text",
                "text": persona_prompt
            }
        ],
        messages=[{
            "role": "user",
            "content": f"Review this manuscript as a {persona_name}. Return ~400 words of feedback."
        }],
        output_config={
            "format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "individual_review",
                    "schema": REVIEW_SCHEMA
                }
            }
        }
    )
    data = response.content[0].text  # will be valid JSON
    return IndividualReview.model_validate_json(data)

async def synthesize_reviews(
    client: anthropic.AsyncAnthropic,
    reviews: list[IndividualReview]
) -> Consensus:
    reviews_text = "\n\n".join([
        f"## {r.persona}\n{r.detailed_feedback}\nRecommendation: {r.recommendation}"
        for r in reviews
    ])
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system="You are a senior editorial director synthesizing feedback from multiple manuscript reviewers.",
        messages=[{
            "role": "user",
            "content": f"Synthesize these three reviews into a consensus:\n\n{reviews_text}"
        }],
        output_config={
            "format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "consensus",
                    "schema": Consensus.model_json_schema()
                }
            }
        }
    )
    return Consensus.model_validate_json(response.content[0].text)

async def review_manuscript(manuscript: str, title: str) -> MultiPerspectiveReview:
    client = anthropic.AsyncAnthropic()

    # Step 1: Run all three reviews in parallel
    review_tasks = [
        get_single_review(client, name, prompt, manuscript)
        for name, prompt in REVIEWER_PERSONAS.items()
    ]
    reviews = await asyncio.gather(*review_tasks)

    # Step 2: Synthesize
    consensus = await synthesize_reviews(client, list(reviews))

    return MultiPerspectiveReview(
        manuscript_title=title,
        reviews=list(reviews),
        consensus=consensus
    )
```

### Option B: Agent SDK with Named Subagents

Use the Agent SDK's `agents` parameter to define named persona agents. The orchestrator prompt explicitly instructs Claude to run all three in parallel.

**Why:** More natural fit if already using the Agent SDK; subagents can use tools (e.g., if manuscript is a file on disk).

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition, ResultMessage

async def review_manuscript_with_agents(manuscript: str) -> dict:
    result = {}
    
    async for message in query(
        prompt=f"""Use the publisher-reviewer, avid-reader-reviewer, and writer-reviewer agents 
        simultaneously to review this manuscript, then synthesize their feedback:

        <manuscript>
        {manuscript}
        </manuscript>

        After all three reviews are complete, synthesize their findings into a consensus 
        identifying key agreements and disagreements. Return the complete review as JSON.""",
        options=ClaudeAgentOptions(
            allowed_tools=["Agent"],
            output_format={
                "type": "json_schema",
                "schema": MultiPerspectiveReview.model_json_schema()
            },
            agents={
                "publisher-reviewer": AgentDefinition(
                    description="Evaluates manuscripts from a commercial Publisher perspective. Use for market viability and editorial assessments.",
                    prompt=REVIEWER_PERSONAS["Publisher"],
                    tools=[],  # text-only, no file tools needed
                    model="sonnet",
                ),
                "avid-reader-reviewer": AgentDefinition(
                    description="Evaluates manuscripts from an Avid Reader's perspective. Use for reader engagement assessments.",
                    prompt=REVIEWER_PERSONAS["Avid Reader"],
                    tools=[],
                    model="sonnet",
                ),
                "writer-reviewer": AgentDefinition(
                    description="Evaluates manuscripts from an Experienced Writer's craft perspective. Use for technical writing assessments.",
                    prompt=REVIEWER_PERSONAS["Experienced Writer"],
                    tools=[],
                    model="sonnet",
                ),
            }
        ),
    ):
        if isinstance(message, ResultMessage) and message.structured_output:
            result = message.structured_output

    return result
```

### Output JSON structure

```json
{
  "manuscript_title": "The Lost Harbor",
  "reviews": [
    {
      "persona": "Publisher",
      "overall_impression": "Commercially promising literary fiction with strong voice...",
      "strengths": ["Distinctive narrative voice", "Strong sense of place", "Timely themes"],
      "weaknesses": ["Slow first act", "Unclear market positioning"],
      "detailed_feedback": "~400 words of structured feedback...",
      "recommendation": "revise"
    },
    {
      "persona": "Avid Reader",
      "overall_impression": "Beautifully written but I nearly put it down at chapter 3...",
      "strengths": ["Gorgeous prose", "Memorable secondary characters"],
      "weaknesses": ["Opening 50 pages drag", "Protagonist feels distant"],
      "detailed_feedback": "~400 words...",
      "recommendation": "revise"
    },
    {
      "persona": "Experienced Writer",
      "overall_impression": "Technically accomplished with some craft inconsistencies...",
      "strengths": ["Strong scene construction", "Distinctive voice"],
      "weaknesses": ["POV slippage in Ch. 4-6", "Some over-written passages"],
      "detailed_feedback": "~400 words...",
      "recommendation": "revise"
    }
  ],
  "consensus": {
    "points_of_agreement": [
      "Strong, distinctive voice is the manuscript's greatest asset",
      "Opening pacing needs work — all reviewers noted slow first act",
      "Revision recommended before submission"
    ],
    "points_of_disagreement": [
      "Publisher sees commercial potential; Writer questions market categorization",
      "Reader found secondary characters memorable; Writer found them underdeveloped"
    ],
    "synthesized_recommendation": "revise",
    "top_priorities": [
      "Tighten the first 50 pages — raise stakes earlier",
      "Address POV consistency issues in chapters 4-6",
      "Clarify genre positioning for market",
      "Develop protagonist's internal world more visibly",
      "Strengthen the ending's emotional payoff"
    ]
  }
}
```

---

## 9. Key Sources

| Topic | URL | Notes |
|---|---|---|
| Agent SDK overview | https://code.claude.com/docs/en/agent-sdk/overview | Primary SDK docs, current |
| Agent SDK subagents | https://code.claude.com/docs/en/agent-sdk/subagents | Parallel agent patterns |
| Agent SDK structured output | https://code.claude.com/docs/en/agent-sdk/structured-outputs | JSON schema output from agents |
| API structured outputs | https://platform.claude.com/docs/en/build-with-claude/structured-outputs | Direct API JSON mode |
| Rate limits | https://platform.claude.com/docs/en/api/rate-limits | Tier tables, caching guidance |
| Claude 4 prompting best practices | https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices | Parallel tools, personas, XML tags |
| Multi-agent research system | https://www.anthropic.com/engineering/multi-agent-research-system | Orchestrator-worker patterns |
| Claude Code agent teams | https://code.claude.com/docs/en/agent-teams | Cross-session parallel agents |
| Synthetic persona feedback | https://www.superpath.co/blog/synthetic-feedback | Persona structure, review sections |
| Parallel API calling library | https://github.com/milistu/anthropic-parallel-calling | Rate-limit-compliant parallel calls |
| Async SDK clients | https://deepwiki.com/anthropics/anthropic-sdk-python/4.2-synchronous-and-asynchronous-clients | AsyncAnthropic, aiohttp |
| Claude creative writing review | https://minu.co.nz/using-claude-the-ai-chatbot-by-anthropic-as-a-line-editor-and-critique-group/ | Real-world persona review usage |
| Claude Managed Agents | https://www.anthropic.com/engineering | Hosted agent infrastructure (April 2026) |
