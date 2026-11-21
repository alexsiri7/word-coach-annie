"use client";

import { Download, Loader2, Shield, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PrivacySettings } from "./use-privacy-settings";

export function PrivacySection({ privacy }: { privacy: PrivacySettings }) {
  return (
    <>
      {/* Privacy & Data */}
      <div className="glass-card p-6 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-4 w-4 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Privacy & Data</h2>
        </div>
        {privacy.consentLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">Session recording (Sentry replay)</p>
                <p className="text-xs text-text-muted mt-0.5">
                  Anonymised recordings of errors to help fix bugs. Manuscript content is masked.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={privacy.replayAllowed}
                onClick={() => privacy.toggleReplay(!privacy.replayAllowed)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  privacy.replayAllowed ? "bg-accent" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    privacy.replayAllowed ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-sm text-text-primary mb-1">Download your data</p>
              <p className="text-xs text-text-muted mb-3">
                Export all your projects, settings, and account data as a ZIP file (GDPR Article 20).
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={privacy.exportData}
                disabled={privacy.exporting}
                className="gap-1.5"
              >
                {privacy.exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download my data
              </Button>
              {privacy.exportError && (
                <p className="text-xs text-red-500 mt-2">{privacy.exportError}</p>
              )}
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-red-600 mb-1">Delete account</p>
              <p className="text-xs text-text-muted mb-3">
                Permanently delete your account and all associated data (GDPR Article 17).
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={privacy.openDelete}
                className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
                Delete my account
              </Button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={privacy.deleteOpen} onOpenChange={privacy.onDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your account and all associated data including projects, universes, writing sessions, and settings. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Type your email address to confirm
            </label>
            <Input
              type="email"
              value={privacy.deleteConfirmEmail}
              onChange={(e) => privacy.setDeleteConfirmEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="off"
            />
            {privacy.deleteError && <p className="text-xs text-red-500 mt-2">{privacy.deleteError}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={privacy.deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                privacy.deleteAccount();
              }}
              disabled={privacy.deleting || !privacy.deleteConfirmEmail.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {privacy.deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Delete my account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
