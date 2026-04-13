import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "DMCA Policy",
  description: "Word Coach Annie DMCA Takedown Policy",
};

export default function DmcaPage() {
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
          DMCA Policy
        </h1>
        <p className="text-sm text-text-muted mb-8">
          Last updated: April 2026
        </p>

        <div className="space-y-8 text-sm text-text-secondary leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Overview
            </h2>
            <p>
              Word Coach Annie respects the intellectual property rights of
              others and expects its users to do the same. In accordance with
              the Digital Millennium Copyright Act of 1998 (17 U.S.C. &sect;
              512), we will respond promptly to claims of copyright infringement
              that are reported to our designated agent.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Designated DMCA agent
            </h2>
            <p>
              To file a copyright infringement notification, please contact our
              designated DMCA agent:
            </p>
            <p>
              Email:{" "}
              <a
                href="mailto:dmca@wordcoachannie.com"
                className="text-accent hover:underline"
              >
                dmca@wordcoachannie.com
              </a>
            </p>
            <p>
              Our DMCA agent is registered with the U.S. Copyright Office as
              required by 17 U.S.C. &sect; 512(c)(2).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              How to submit a takedown notice
            </h2>
            <p>
              If you believe that content hosted on Word Coach Annie infringes
              your copyright, please send a written notification to our DMCA
              agent containing the following:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                A physical or electronic signature of the copyright owner or a
                person authorized to act on their behalf
              </li>
              <li>
                Identification of the copyrighted work claimed to have been
                infringed
              </li>
              <li>
                Identification of the material that is claimed to be infringing,
                including the URL or other specific location on our service
                where the material can be found
              </li>
              <li>
                Your contact information, including your name, address,
                telephone number, and email address
              </li>
              <li>
                A statement that you have a good faith belief that use of the
                material in the manner complained of is not authorized by the
                copyright owner, its agent, or the law
              </li>
              <li>
                A statement, made under penalty of perjury, that the information
                in the notification is accurate, and that you are the copyright
                owner or are authorized to act on behalf of the owner
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Counter-notice process
            </h2>
            <p>
              If you believe your content was removed or disabled by mistake or
              misidentification, you may submit a counter-notice to our DMCA
              agent containing the following:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Your physical or electronic signature</li>
              <li>
                Identification of the material that has been removed or to which
                access has been disabled, and the location at which the material
                appeared before it was removed or disabled
              </li>
              <li>
                A statement under penalty of perjury that you have a good faith
                belief that the material was removed or disabled as a result of
                mistake or misidentification
              </li>
              <li>
                Your name, address, and telephone number, and a statement that
                you consent to the jurisdiction of the federal district court for
                the judicial district in which your address is located, and that
                you will accept service of process from the person who provided
                the original takedown notification
              </li>
            </ul>
            <p>
              Upon receipt of a valid counter-notice, we will forward it to the
              original complainant. If the complainant does not file a court
              action within 10 business days, we will restore the removed
              material.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Repeat infringers
            </h2>
            <p>
              In accordance with the DMCA, we will terminate the accounts of
              users who are determined to be repeat infringers in appropriate
              circumstances.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Safe harbor
            </h2>
            <p>
              Word Coach Annie qualifies as a service provider under 17 U.S.C.
              &sect; 512. We do not monitor or pre-screen user content, and we
              act expeditiously to remove or disable access to infringing
              material upon receiving proper notification.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-border text-xs text-text-muted">
          Questions? Contact the instance administrator. &middot;{" "}
          <Link href="/terms" className="text-accent hover:underline">
            Terms of Service
          </Link>{" "}
          &middot;{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            Privacy Policy
          </Link>
        </div>
      </div>
    </main>
  );
}
