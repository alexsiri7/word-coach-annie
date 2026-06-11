import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Word Coach Annie Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <>
    <main id="main-content" className="min-h-screen">
      <div className="h-1 accent-gradient" />

      <div className="max-w-2xl mx-auto px-6 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary mb-10"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-text-muted mb-8">
          Last updated: April 2026
        </p>

        <div className="space-y-8 text-sm text-text-secondary leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Your manuscripts are yours
            </h2>
            <p>
              Word Coach Annie is a writing tool. Everything you write — manuscripts,
              scenes, notes, character sheets, world-building documents — belongs
              entirely to you. We do not claim any rights to your creative work.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              What we store
            </h2>
            <p>
              Your data is stored in a private SQLite database on the server that
              hosts your instance. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Your account information (email address, display name)</li>
              <li>Projects, scenes, and all manuscript content you create</li>
              <li>Universes, characters, locations, and world-building entries</li>
              <li>Version history of your writing (for the undo/version feature)</li>
            </ul>
            <p>
              We do not store passwords. Authentication is handled through Google
              OAuth or admin-issued access tokens.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              No AI training on your work
            </h2>
            <p>
              Your manuscripts and creative content are never used to train AI
              models. If you use Annie&apos;s optional AI-assisted features (such as
              brainstorming prompts), your content is sent to the AI provider only
              for that specific request and is not retained for training purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Data sharing
            </h2>
            <p>
              We do not sell, share, or distribute your personal data or creative
              work to third parties. The only external services that may receive
              data are:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong>Google OAuth</strong> — your email address, solely for
                authentication
              </li>
              <li>
                <strong>Sentry</strong> — anonymous error reports to help us fix
                bugs (no manuscript content is included)
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Your right to delete
            </h2>
            <p>
              You can delete any project, scene, or universe entry at any time from
              within the app. Deleted items are removed from the database.
            </p>
            <p>
              To delete your entire account and all associated data, go to{" "}
              <Link href="/settings" className="underline hover:text-text-primary">
                Settings &rarr; Privacy & Data
              </Link>
              . This is a permanent action and cannot be undone.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Cookies
            </h2>
            <p>
              We use a single session cookie to keep you signed in. We do not use
              tracking cookies or third-party analytics.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Changes to this policy
            </h2>
            <p>
              If we make material changes to this privacy policy, we will update
              this page and the &ldquo;last updated&rdquo; date above.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-border text-xs text-text-muted">
          Questions? Contact the instance administrator. &middot;{" "}
          <Link href="/terms" className="text-accent hover:underline">
            Terms of Service
          </Link>{" "}
          &middot;{" "}
          <Link href="/dmca" className="text-accent hover:underline">
            DMCA Policy
          </Link>
        </div>
      </div>
    </main>
    <SiteFooter />
    </>
  );
}
