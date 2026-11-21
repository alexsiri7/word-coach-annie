"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiTokensCard } from "@/components/api-tokens-card";
import { useAiSettings } from "@/components/settings/use-ai-settings";
import { useHashnodeIntegration } from "@/components/settings/use-hashnode-integration";
import { useGoogleDocsIntegration } from "@/components/settings/use-google-docs-integration";
import { usePrivacySettings } from "@/components/settings/use-privacy-settings";
import { useCalendarFeed } from "@/components/settings/use-calendar-feed";
import { AiProviderSection } from "@/components/settings/ai-provider-section";
import { AiBehaviorSection } from "@/components/settings/ai-behavior-section";
import { ChatCompressionSection } from "@/components/settings/chat-compression-section";
import { AiSettingsSaveBar } from "@/components/settings/ai-settings-save-bar";
import { HashnodeSection } from "@/components/settings/hashnode-section";
import { HashnodeDetailsSection } from "@/components/settings/hashnode-details-section";
import { GoogleDocsSection } from "@/components/settings/google-docs-section";
import { CalendarFeedSection } from "@/components/settings/calendar-feed-section";
import { PrivacySection } from "@/components/settings/privacy-section";

export default function SettingsPage() {
  const router = useRouter();
  // Hooks are called here rather than inside the sections so every section starts
  // loading on mount, including those hidden until the AI settings have loaded.
  const ai = useAiSettings();
  const hashnode = useHashnodeIntegration();
  const googleDocs = useGoogleDocsIntegration();
  const privacy = usePrivacySettings();
  const feed = useCalendarFeed();

  return (
    <main className="min-h-screen">
      <div className="h-1 accent-gradient" />
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-accent" />
            <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
          </div>
        </div>

        <AiProviderSection ai={ai} />
        {!ai.loading && (
          <>
            <AiBehaviorSection ai={ai} />
            <ChatCompressionSection ai={ai} />
          </>
        )}
        <HashnodeSection hashnode={hashnode} />
        {!ai.loading && (
          <>
            <GoogleDocsSection googleDocs={googleDocs} />
            <AiSettingsSaveBar ai={ai} />
            <HashnodeDetailsSection hashnode={hashnode} />
          </>
        )}
        <CalendarFeedSection feed={feed} />
        <ApiTokensCard />
        <PrivacySection privacy={privacy} />
      </div>
    </main>
  );
}
