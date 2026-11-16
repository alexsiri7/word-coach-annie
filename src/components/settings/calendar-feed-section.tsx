"use client";

import { CalendarClock, Check, Copy, Loader2, RefreshCw } from "lucide-react";
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
import type { CalendarFeed } from "./use-calendar-feed";

export function CalendarFeedSection({ feed }: { feed: CalendarFeed }) {
  return (
    <>
      {/* Deadline calendar feed */}
      <div className="glass-card p-6 mt-6">
        <div className="flex items-center gap-2 mb-1">
          <CalendarClock className="h-4 w-4 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Deadline calendar feed</h2>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          Subscribe to every open opportunity as all-day events on their close dates. The feed
          updates itself — closed or edited opportunities change on the next refresh.
        </p>

        {feed.loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : feed.feedUrl ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input readOnly value={feed.feedUrl} aria-label="Calendar subscription URL" className="font-mono text-xs" />
              <Button variant="outline" size="sm" onClick={feed.copy} className="gap-1.5 shrink-0">
                {feed.copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {feed.copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-text-muted">
              Anyone with this URL can read your opportunity deadlines — treat it as a password.
            </p>

            <div className="border-t border-border pt-4 space-y-3 text-xs text-text-muted">
              <div>
                <p className="text-sm text-text-primary mb-1">Google Calendar</p>
                <p>
                  Other calendars &rarr; From URL, paste the link, then Add calendar. Open its
                  settings and add two notifications — for example 2 weeks and 1 day before — which
                  then apply to every deadline in the feed.
                </p>
              </div>
              <div>
                <p className="text-sm text-text-primary mb-1">Apple Calendar</p>
                <p>
                  File &rarr; New Calendar Subscription, paste the link, then set Alerts to two
                  reminders (for example 2 weeks and 1 day before) and Auto-refresh to every day.
                </p>
              </div>
              <p>
                Reminder timings live in your calendar app rather than in the feed: Google discards
                alarms carried in a subscription, so offsets set here would silently never fire.
              </p>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-sm text-text-primary mb-1">Regenerate URL</p>
              <p className="text-xs text-text-muted mb-3">
                Issues a new address and stops the old one working. Use this if the link has been
                shared by accident — every subscribed calendar will need the new URL.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => feed.setRegenerateOpen(true)}
                className="gap-1.5"
              >
                <RefreshCw className="h-4 w-4" />
                Regenerate
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">
              Couldn&apos;t load your subscription URL. Any calendar already subscribed keeps
              working — this only affects showing the address here.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={feed.reload}
              className="gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={feed.regenerateOpen} onOpenChange={feed.setRegenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate calendar URL?</AlertDialogTitle>
            <AlertDialogDescription>
              The current URL stops working immediately. Any calendar already subscribed to it will
              stop updating until you give it the new address.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={feed.regenerating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={feed.regenerate} disabled={feed.regenerating}>
              {feed.regenerating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
