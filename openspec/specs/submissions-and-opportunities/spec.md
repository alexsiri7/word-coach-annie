# Submissions and Opportunities

## Purpose

A story's life after drafting — finding contests and venues, deciding what to enter, submitting, waiting, getting rejected and sending it out again — otherwise lives in spreadsheets and memory. Annie holds that lifecycle next to the story, makes silent failures visible (missed deadlines, stories that stopped circulating), and puts deadlines in the author's own calendar. Discovering contests is left to the AI assistant; Annie stores the result.

## Requirements

### Requirement: Providers are reusable

The author SHALL be able to manage providers — magazines, journals, contest hosts — each with a name and optional website and notes, independent of any project so the same provider is reused across submissions and opportunities. A provider still referenced by a submission or opportunity SHALL NOT be deletable.

#### Scenario: Provider in use
- GIVEN a provider with one contest submission
- WHEN the author tries to delete the provider
- THEN the deletion is refused

### Requirement: Submissions are recorded per story

For each project the author SHALL be able to record publication submissions (venue, submission date, status) and contest submissions (contest name, provider, submission date, optional result date, submission URL, status), and edit or delete them. The project dashboard SHALL show a compact activity summary — active and pending counts and upcoming contest result dates — linking to the full submissions page.

#### Scenario: Summary on the dashboard
- GIVEN a project with two pending submissions and one contest result due next month
- WHEN the author opens the project dashboard
- THEN the summary shows two pending and the upcoming result date

### Requirement: Opportunities are recorded before anything is submitted

The author SHALL be able to record an opportunity with a title, provider, close date, optional review date, rules link, entry fee, word and line limits, genre restrictions and eligibility notes. Its status SHALL be found, considering or closed; submission outcomes SHALL NOT be opportunity statuses.

#### Scenario: Record six months out
- GIVEN a contest closing in six months and no story chosen
- WHEN the author records it as found
- THEN it is saved with no candidates

### Requirement: Stories are candidates for opportunities

The author SHALL be able to attach any number of projects to an opportunity as candidates, and a project SHALL be attachable to any number of opportunities, once each. Each candidate SHALL carry a state of candidate, chosen or dropped and free-text notes. More than one candidate MAY be chosen for the same opportunity. A chosen candidate SHALL be promotable to a contest submission that carries over the provider, title and dates already known, and the candidate SHALL stay linked to the resulting submission. Deleting an opportunity SHALL delete its candidates; deleting a project SHALL delete its candidacies but not the opportunities.

#### Scenario: Promote without retyping
- GIVEN a chosen candidate on an opportunity with provider and close date set
- WHEN the author promotes it
- THEN a contest submission exists with that provider and contest name
- AND the candidate links to it

#### Scenario: Several chosen
- GIVEN a contest allowing two entries
- WHEN the author marks two candidates chosen
- THEN both are accepted

### Requirement: Each contest shows one readable state

The contests list SHALL be sorted by close date, filterable by status, provider and project, and SHALL show planned and submitted contests together. Each row SHALL name the stories involved and show one state resolved from the opportunity, its candidates and any submission: no candidates yet, considering (names), chosen (names), submitted (names), accepted or rejected (names), or closed with nothing entered. A contest whose close date passed with nothing submitted SHALL be visibly distinct from open and entered contests.

#### Scenario: Missed deadline
- GIVEN an opportunity whose close date has passed and whose candidates were never promoted
- WHEN the author views the contests list
- THEN its row reads "Closed, nothing entered" and is highlighted

### Requirement: Each story shows where it is

A Publishing and contests hub SHALL list every story with one state across both submission kinds and all candidacies: not out anywhere, shortlisted, chosen, out with a provider (with days waiting), accepted, or back on the shelf — last submission rejected and nothing sent since. Stories SHALL be ordered by what most needs action, a story in several places SHALL show all of them, and a story out with more than one provider at once SHALL be noted without anything being blocked. Each project SHALL also show the opportunities it is a candidate for.

#### Scenario: Back on the shelf
- GIVEN a story whose only submission was rejected last month
- WHEN the author opens the hub
- THEN the story reads "Back on the shelf" and is listed first

#### Scenario: Simultaneous submissions noted
- GIVEN a story out with two providers
- WHEN the author views it in the hub
- THEN a note names both providers and suggests checking their rules

### Requirement: The home dashboard flags only what needs a decision

The home dashboard SHALL link to the Publishing and contests hub with a count of items needing attention — open contests with an approaching deadline and no candidate, and stories back on the shelf — and SHALL show no count when that number is zero.

#### Scenario: Nothing to do
- GIVEN every open contest has a candidate and no story is back on the shelf
- WHEN the author opens the home dashboard
- THEN the hub link shows no count

### Requirement: Deadlines reach the author's calendar

The system SHALL publish a per-account calendar feed at an unguessable URL, needing no login, that the author can copy from settings and regenerate, invalidating the old URL. The feed SHALL contain one all-day event on the close date for every opportunity that is not closed, whether or not it has candidates, with the rules link, entry fee and limits in the description and a link back to Annie. Events SHALL keep a stable identity so a changed close date moves the event, the feed SHALL reflect current state on every fetch, and it SHALL NOT carry reminder alarms; reminders are set once in the author's calendar client.

#### Scenario: Date change moves the event
- GIVEN a subscribed calendar showing an opportunity on 1 March
- WHEN the author changes its close date to 8 March
- THEN after refresh the calendar shows one event on 8 March

#### Scenario: Closed drops out
- GIVEN an opportunity in the feed
- WHEN the author marks it closed
- THEN it is absent from the next fetch

#### Scenario: Regenerated URL
- GIVEN the author regenerates the feed URL
- WHEN a calendar fetches the old URL
- THEN it receives not found
