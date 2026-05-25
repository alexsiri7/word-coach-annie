import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Annie — Writing Companion",
  description: "A manuscript tool for novelists powered by Claude via MCP.",
};

export default function LandingPage() {
  return (
    <>
      <main id="main-content" className="min-h-screen">
        <div className="h-1 accent-gradient" />

        {/* ── Header ────────────────────────────────────────── */}
        <header className="sticky top-0 z-40 bg-surface">
          <div className="flex items-center justify-between w-full max-w-[1600px] mx-auto px-8 py-4">
            <span className="text-2xl font-headline italic font-bold text-text-primary">
              Annie
            </span>
            <div className="flex items-center gap-4">
              <Button asChild variant="default">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </header>

        {/* ── Hero ──────────────────────────────────────────── */}
        <section className="mb-14">
          <div className="grid md:grid-cols-2 gap-12 items-center bg-surface-container-low p-8 md:p-12">
            <div className="relative z-10">
              <span className="font-label text-xs uppercase tracking-[0.2em] text-accent mb-4 block">
                Writing Companion
              </span>
              <h1 className="font-headline text-4xl md:text-5xl mb-6 leading-tight text-text-primary">
                Your manuscript, <em>structured by Claude</em>
              </h1>
              <p className="font-headline italic text-xl text-on-surface-variant mb-8 max-w-md">
                Annie helps novelists organise projects, scenes, and beats —
                then connects Claude as a structural partner via MCP, so the AI
                coaches your craft while you keep the prose.
              </p>
              <Button asChild size="lg">
                <Link href="/login">Start Writing</Link>
              </Button>
            </div>
            <div className="hidden md:block relative h-64">
              <div className="absolute inset-0 bg-surface-container-highest rounded-sm border-l-8 border-primary rotate-3 shadow-xl p-8">
                <div className="space-y-4 opacity-40">
                  <div className="h-2 bg-on-surface w-full" />
                  <div className="h-2 bg-on-surface w-3/4" />
                  <div className="h-2 bg-on-surface w-5/6" />
                  <div className="h-2 bg-on-surface w-2/3" />
                  <div className="h-2 bg-on-surface w-full" />
                  <div className="h-2 bg-on-surface w-1/2" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ──────────────────────────────────────── */}
        <section className="max-w-[1600px] mx-auto px-8 mb-14">
          <h2 className="font-headline text-3xl text-text-primary mb-8 text-center">
            Everything your manuscript needs
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="glass-card p-6 space-y-3">
              <span className="stamp-chip">Projects</span>
              <h3 className="font-headline text-xl text-text-primary">
                Manuscript projects
              </h3>
              <p className="text-sm text-text-secondary">
                Organise your novel into parts, chapters, and scenes. Every
                project is a self-contained workspace with its own structure and
                story objects.
              </p>
            </div>

            <div className="glass-card p-6 space-y-3">
              <span className="stamp-chip">Scenes</span>
              <h3 className="font-headline text-xl text-text-primary">
                Scenes &amp; beats
              </h3>
              <p className="text-sm text-text-secondary">
                Break scenes into granular beats — purpose, conflict, emotional
                arc — so every page carries narrative weight.
              </p>
            </div>

            <div className="glass-card p-6 space-y-3">
              <span className="stamp-chip">World</span>
              <h3 className="font-headline text-xl text-text-primary">
                Story objects
              </h3>
              <p className="text-sm text-text-secondary">
                Characters, locations, plotlines, and world elements. Build a
                living reference library that Claude can draw on when coaching
                your scenes.
              </p>
            </div>

            <div className="glass-card p-6 space-y-3">
              <span className="stamp-chip">Focus</span>
              <h3 className="font-headline text-xl text-text-primary">
                Focus mode
              </h3>
              <p className="text-sm text-text-secondary">
                A distraction-free writing environment that lets you concentrate
                on the prose while Annie keeps track of structure in the
                background.
              </p>
            </div>

            <div className="glass-card p-6 space-y-3">
              <span className="stamp-chip">MCP</span>
              <h3 className="font-headline text-xl text-text-primary">
                Claude integration
              </h3>
              <p className="text-sm text-text-secondary">
                Connect Claude as your writing partner via MCP. Get structural
                feedback, brainstorm beats, and refine your narrative — without
                the AI writing for you.
              </p>
            </div>

            <div className="glass-card p-6 space-y-3">
              <span className="stamp-chip">Export</span>
              <h3 className="font-headline text-xl text-text-primary">
                Export anywhere
              </h3>
              <p className="text-sm text-text-secondary">
                Export your manuscript to Markdown, PDF, or EPUB. Your
                work is always portable and fully yours.
              </p>
            </div>
          </div>
        </section>

        {/* ── Philosophy ────────────────────────────────────── */}
        <section className="bg-surface-container-low p-8 md:p-12 mb-14">
          <div className="max-w-3xl mx-auto text-center">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-accent mb-4 block">
              Philosophy
            </span>
            <blockquote className="font-headline italic text-2xl md:text-3xl text-text-primary mb-6 leading-relaxed">
              &ldquo;Claude is the structural partner. The author keeps the
              prose.&rdquo;
            </blockquote>
            <p className="text-text-secondary max-w-xl mx-auto">
              Annie is built on the belief that AI should coach, not ghostwrite.
              Claude helps you see your story&apos;s architecture — pacing,
              tension, character arcs — while every word on the page remains
              yours.
            </p>
          </div>
        </section>

        {/* ── Getting Started ───────────────────────────────── */}
        <section className="max-w-[1600px] mx-auto px-8 mb-14">
          <div className="glass-card p-8 md:p-12 max-w-2xl mx-auto">
            <h2 className="font-headline text-2xl text-text-primary mb-6">
              Get started in three steps
            </h2>
            <ol className="space-y-4 text-text-secondary mb-8">
              <li className="flex gap-4">
                <span className="font-headline text-xl font-bold text-accent flex-shrink-0">
                  1.
                </span>
                <span>
                  <strong className="text-text-primary">Sign in</strong> — create
                  your account with Google OAuth.
                </span>
              </li>
              <li className="flex gap-4">
                <span className="font-headline text-xl font-bold text-accent flex-shrink-0">
                  2.
                </span>
                <span>
                  <strong className="text-text-primary">
                    Create a project
                  </strong>{" "}
                  — set up your manuscript with parts, chapters, and scenes.
                </span>
              </li>
              <li className="flex gap-4">
                <span className="font-headline text-xl font-bold text-accent flex-shrink-0">
                  3.
                </span>
                <span>
                  <strong className="text-text-primary">Connect Claude</strong>{" "}
                  — add Annie&apos;s MCP server to Claude and start getting
                  structural coaching.
                </span>
              </li>
            </ol>
            <Button asChild size="lg">
              <Link href="/login">Sign in to get started</Link>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
