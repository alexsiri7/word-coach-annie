---
created: '2026-09-07'
github_issue: null
id: '031'
status: draft
title: Opportunity tracking with candidate entries and ICS deadline feed
updated: '2026-09-07'
---

## Why

Tracking a literary contest from "found it" to "submitted" currently spans three disconnected tools. An AI assistant searches for and summarises contests, Annie's submission tools only record an entry after it has been submitted, and deadline reminders have to be set up by hand in a calendar. There is no single place to see the contests under consideration, with their deadlines, rules and status, before a submission actually happens.

Two further gaps in the current model. First, the relationship between a piece and an opportunity is many-to-many in practice: one contest may suit several stories, and one story may suit several contests. The existing submission model assumes one submission per project. Second, the author often does not know what to submit at the point of discovery. A contest found six months out is worth recording immediately, but the decision about which piece to enter is made much later, typically once the deadline is近 enough to plan around. The system should support recording the opportunity first and attaching candidate pieces to it over time, rather than requiring the decision up front.

Discovery itself remains out of scope: researching and summarising contests stays a job for the AI assistant. Annie's job is to hold the resulting structured data, track its lifecycle, and surface deadlines where the author will see them.

## What

**Opportunities**

The author can record an opportunity — a contest or publication they are considering — independently of whether anything has been submitted to it. An opportunity carries its title, the provider it belongs to (reusing the existing Provider entity), a close date, an optional review/notification date, a link to the official rules, an optional entry fee, optional word and line limits, free-text genre restrictions, and free-text eligibility notes covering things like residency requirements or previously-published rules.

An opportunity has a status of found, considering or closed. Statuses describing the outcome of a submission do not live here — they belong to the candidate that was actually submitted.

The author can list opportunities filtered by status, provider or project, sorted by close date, so that "what is coming up next" is answerable in a single view or call.

**Candidate entries**

The author can attach zero or more projects to an opportunity as candidate entries, and the same project can be a candidate for several opportunities. Each candidate carries its own state — candidate, chosen, or dropped — and free-text notes on why the piece fits or does not.

More than one candidate may be marked chosen for the same opportunity. Contests vary on whether multiple entries per author are permitted, and that rule is captured in the opportunity's eligibility notes rather than enforced by the system.

A chosen candidate can be promoted into an actual contest submission without re-entering data already captured on the opportunity or the candidate.

**Deadline calendar feed**

Annie publishes a subscribable calendar feed containing every opportunity that is not closed, regardless of whether any candidates are attached. An opportunity recorded months ahead with no candidate yet still appears — the approaching deadline is precisely what prompts the author to decide what to enter.

Each opportunity appears as an all-day event on its close date. The event description carries the rules link, entry fee, and word or line limits, so the reminder is self-contained and does not require opening Annie to recall what the entry needs.

The feed reflects current state on each refresh: an opportunity that is closed, or whose close date changes, is reflected without the author having to clear stale entries by hand.

The feed itself does not specify reminder timings. The author configures alerts once in their own calendar application — for example two weeks and one day before — and those apply to every deadline in the feed. Per-opportunity reminder offsets are deliberately not supported: Google Calendar discards alarm definitions carried in a subscribed feed, so offsets set by Annie would not survive. A single set of author-configured rules is the reliable path to a notification actually firing.

Subscription is authenticated by an unguessable feed URL that the author can regenerate, since calendar clients cannot perform an interactive login.

## Issues

_None yet._