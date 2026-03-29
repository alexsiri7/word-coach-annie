"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Check, Terminal, LogIn, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";

const MCP_COMMAND =
  "claude mcp add annie --transport http https://annie.interstellarai.net/api/mcp";

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-surface-sunken border border-border rounded-lg p-4 pr-12 overflow-x-auto text-sm font-mono text-text-primary">
        {text}
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy to clipboard"}
      >
        {copied ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

export default function SetupPage() {
  const router = useRouter();

  return (
    <main id="main-content" className="min-h-screen">
      <div className="h-1 accent-gradient" />

      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-text-muted hover:text-text-primary"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>

        {/* Title */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-2">
            Connect Claude Code
          </h1>
          <p className="text-text-muted">
            Connect Claude Code to Annie and let AI help you write, edit, and
            manage your projects.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-8">
          {/* Step 1 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
                <Terminal className="h-4 w-4 text-accent" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">
                1. Add the MCP server
              </h2>
            </div>
            <p className="text-sm text-text-secondary ml-11">
              Run this command in your terminal:
            </p>
            <div className="ml-11">
              <CopyBlock text={MCP_COMMAND} />
            </div>
          </section>

          {/* Step 2 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
                <LogIn className="h-4 w-4 text-accent" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">
                2. Approve access
              </h2>
            </div>
            <p className="text-sm text-text-secondary ml-11">
              Your browser will open for Google sign-in. After approving, Claude
              Code can access your Annie projects.
            </p>
          </section>

          {/* Step 3 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
                <Wrench className="h-4 w-4 text-accent" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">
                3. Start using it
              </h2>
            </div>
            <p className="text-sm text-text-secondary ml-11 mb-3">
              Once connected, Claude can help you with:
            </p>
            <ul className="ml-11 space-y-2 text-sm text-text-secondary">
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">&#8226;</span>
                <span>
                  <strong className="text-text-primary">Read and write scenes</strong>{" "}
                  &mdash; draft new content, revise existing scenes, or
                  reorganize your outline
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">&#8226;</span>
                <span>
                  <strong className="text-text-primary">Manage characters and world-building</strong>{" "}
                  &mdash; create and update characters, locations, plotlines, and
                  world elements
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">&#8226;</span>
                <span>
                  <strong className="text-text-primary">Export manuscripts</strong>{" "}
                  &mdash; generate full manuscripts and story bibles
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">&#8226;</span>
                <span>
                  <strong className="text-text-primary">Track relationships</strong>{" "}
                  &mdash; map connections between characters, locations, and plot
                  threads
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5">&#8226;</span>
                <span>
                  <strong className="text-text-primary">Manage universes</strong>{" "}
                  &mdash; organize shared worlds across multiple projects
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
