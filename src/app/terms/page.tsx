import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Word Coach Annie Terms of Service",
};

export default function TermsPage() {
  return (
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
          Terms of Service
        </h1>
        <p className="text-sm text-text-muted mb-8">
          Last updated: April 2026
        </p>

        <div className="space-y-8 text-sm text-text-secondary leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              What Word Coach Annie is
            </h2>
            <p>
              Word Coach Annie is a fiction writing and book management tool. It
              helps you organize manuscripts, track characters and worlds, and
              manage your creative projects.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Your content
            </h2>
            <p>
              You retain full ownership of everything you create in Word Coach
              Annie. We do not claim any intellectual property rights over your
              manuscripts, characters, world-building, or any other content you
              produce using the tool.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Prohibited content
            </h2>
            <p>
              You may not upload, store, or share through Word Coach Annie any
              of the following:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Child sexual abuse material (CSAM)</li>
              <li>Content that violates applicable laws</li>
              <li>Copyrighted content you do not own or have rights to distribute</li>
              <li>Content designed to harass, threaten, or defame real individuals</li>
            </ul>
            <p>
              Sharing content via the reader view or exporting it constitutes
              distribution. Word Coach Annie will remove prohibited content
              without notice and may cooperate with law enforcement where
              required by law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Acceptable use
            </h2>
            <p>
              You agree to use Word Coach Annie for its intended purpose as a
              writing tool. You may not:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Attempt to gain unauthorized access to other users&apos; accounts or data</li>
              <li>Use automated tools to scrape or overload the service</li>
              <li>Upload malicious content or code</li>
              <li>Upload or share child sexual abuse material (CSAM)</li>
              <li>Upload content that infringes third-party copyrights or other intellectual property rights</li>
              <li>Upload content that constitutes harassment, threats, or defamation of real individuals</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Your content representations
            </h2>
            <p>
              By uploading content to Word Coach Annie, you represent and
              warrant that:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>You own or have sufficient rights to all content you upload</li>
              <li>Your content does not infringe any third-party intellectual property rights</li>
              <li>Your content complies with all applicable laws</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Service availability
            </h2>
            <p>
              Word Coach Annie is provided as-is. While we strive to keep the
              service available and your data safe (with regular backups), we
              cannot guarantee uninterrupted access. We recommend keeping local
              copies of important work.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Data and privacy
            </h2>
            <p>
              Your use of Word Coach Annie is also governed by our{" "}
              <Link href="/privacy" className="text-accent hover:underline">
                Privacy Policy
              </Link>
              , which describes how we handle your data, including our commitment
              to never use your creative work for AI training.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Account termination
            </h2>
            <p>
              You may request deletion of your account and data at any time by
              contacting the instance administrator. We reserve the right to
              suspend or terminate accounts and remove content that violates
              these terms, including content that infringes third-party
              copyrights or other prohibited content. We will comply with valid
              DMCA takedown notices as described in our{" "}
              <Link href="/dmca" className="text-accent hover:underline">
                DMCA Policy
              </Link>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Indemnification
            </h2>
            <p>
              You agree to indemnify and hold harmless Word Coach Annie, its
              operators, and contributors from any claims, damages, losses, or
              expenses (including reasonable legal fees) arising from your
              content, your use of the service, or your violation of these
              terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Changes to these terms
            </h2>
            <p>
              If we make material changes to these terms, we will update this page
              and the &ldquo;last updated&rdquo; date above. Continued use of the
              service after changes constitutes acceptance.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-border text-xs text-text-muted">
          Questions? Contact the instance administrator. &middot;{" "}
          <Link href="/dmca" className="text-accent hover:underline">
            DMCA Policy
          </Link>
        </div>
      </div>
    </main>
  );
}
