"use client";

import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import type { HashnodeIntegration } from "./use-hashnode-integration";

export function HashnodeSection({ hashnode }: { hashnode: HashnodeIntegration }) {
  return (
    <>
      <div className="glass-card p-6 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <Link2 className="h-4 w-4 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Hashnode</h2>
        </div>

        {hashnode.loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : hashnode.connected ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">
                Connected{hashnode.username ? ` as @${hashnode.username}` : ""}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                You can publish posts directly to Hashnode.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => hashnode.setDisconnectOpen(true)}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">Not connected</p>
              <p className="text-xs text-text-muted mt-0.5">
                Connect your Hashnode account to publish directly.
              </p>
            </div>
            <Button size="sm" onClick={hashnode.openConnect}>
              Connect
            </Button>
          </div>
        )}
      </div>

      {/* Hashnode Connect Dialog */}
      <Dialog open={hashnode.connectOpen} onOpenChange={hashnode.setConnectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Hashnode Account</DialogTitle>
            <DialogDescription>
              Paste your Hashnode Personal Access Token to link your account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="hashnode-token" className="block text-sm font-medium text-text-secondary mb-1.5">
                Personal Access Token
              </label>
              <Input
                id="hashnode-token"
                type="password"
                value={hashnode.token}
                onChange={(e) => { hashnode.setToken(e.target.value); if (hashnode.error) hashnode.setError(""); }}
                placeholder="Paste your token here"
                onKeyDown={(e) => e.key === "Enter" && hashnode.connect()}
                disabled={hashnode.connecting}
              />
              <p className="text-xs text-text-muted mt-1">
                Generate a token in your Hashnode dashboard under Settings &rarr; Developer.
              </p>
            </div>
            {hashnode.error && (
              <p className="text-xs text-danger">{hashnode.error}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => hashnode.setConnectOpen(false)} disabled={hashnode.connecting}>
                Cancel
              </Button>
              <Button size="sm" onClick={hashnode.connect} disabled={hashnode.connecting || !hashnode.token.trim()}>
                {hashnode.connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hashnode Disconnect Confirmation */}
      <AlertDialog open={hashnode.disconnectOpen} onOpenChange={hashnode.setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Hashnode?</AlertDialogTitle>
            <AlertDialogDescription>
              Your access token will be removed. You won&apos;t be able to publish to Hashnode until you reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={hashnode.disconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={hashnode.disconnect} disabled={hashnode.disconnecting}>
              {hashnode.disconnecting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
