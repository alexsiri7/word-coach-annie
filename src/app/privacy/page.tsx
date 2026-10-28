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
          Last updated: October 2026
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
              Your data is stored in a PostgreSQL database on the server that hosts
              your instance. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Your account information (email address, display name)</li>
              <li>Projects, scenes, and all manuscript content you create</li>
              <li>Universes, characters, locations, and world-building entries</li>
              <li>Version history of your writing (for the undo/version feature)</li>
              <li>
                Email addresses of people you share a project with. They are not
                notified by Annie. Removing a person from a project deletes their
                email, and when someone you shared with deletes their own account,
                their shares are deleted too
              </li>
              <li>
                Comments imported from a Google Doc you exported, with their
                quoted text. Commenters&apos; names are not stored
              </li>
              <li>
                The IP address that registered an MCP client app, kept for 24
                hours to limit abuse and then cleared
              </li>
            </ul>
            <p>
              We do not store passwords. Authentication is handled through Google
              OAuth or admin-issued access tokens.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              AI-assisted features
            </h2>
            <p>
              When you use Annie&apos;s AI-assisted features (chat, brainstorming,
              peer review), the relevant text is sent to Google&apos;s Gemini API to
              generate a response. For chat, this is the content you&apos;re
              discussing; for peer review, it&apos;s up to the first 50,000
              characters of your manuscript. This content is not used to train
              Annie. Whether Google itself may use that content to improve its own
              products depends on the type of API key your instance is configured
              with — see Google&apos;s current Gemini API terms for details.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Data sharing
            </h2>
            <p>
              We do not sell your personal data or creative work. Data is shared
              with external services only as needed to provide the features you
              use:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong>Google OAuth</strong> — your email address, solely for
                authentication
              </li>
              <li>
                <strong>Google Gemini</strong> — the content you send to AI-assisted
                features (see above)
              </li>
              <li>
                <strong>GitHub</strong> — if you submit feedback or report content,
                the report is filed as an issue in the tracker your instance&apos;s
                administrator has configured (which may include a screenshot you
                attach)
              </li>
              <li>
                <strong>Google Docs</strong> and <strong>Hashnode</strong> — only
                when you explicitly connect an account and export to them
              </li>
              <li>
                <strong>Sentry</strong> — error reports tagged with your internal
                account ID (not your email) to help us fix bugs. Before sending we
                drop request bodies and console logs, mask email addresses in error
                messages, and redact credentials and fields that hold text or
                response bodies. An error message itself can still include a short
                fragment of what caused it. Session replay, if enabled, requires
                your separate consent in Settings
              </li>
            </ul>
            <p>
              If your instance has telemetry enabled, trace data (tool usage,
              timings — not manuscript content) is sent to a tracing service that
              your administrator runs themselves, not a third party.
            </p>
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
              <Link href="/settings" className="text-accent hover:underline">Settings → Privacy & Data → Delete account</Link>.
              Your projects, universes, and connected-service credentials are
              removed from the database immediately. Any offline copy of your
              projects stored in your browser is not cleared automatically — clear
              your browser storage for this site if you&apos;d like to remove it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Cookies and local storage
            </h2>
            <p>
              We use a session cookie and a longer-lived refresh cookie to keep you
              signed in, plus short-lived cookies during the Google/Hashnode OAuth
              connection flow. We do not use tracking cookies or third-party
              analytics. The app also stores a few preference flags and, for
              offline use, a local copy of your projects in your browser&apos;s
              storage (IndexedDB) — this data stays on your device.
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
