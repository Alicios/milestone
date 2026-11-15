# Milestone finalization and presentation backlog

Scope: the four active patient relationships currently assigned to LeBron James. The discharged test relationship is excluded. As checked on 2026-11-15, one active patient account is linked and three relationships are pending account setup. Use authorized test accounts and synthetic presentation data; do not expose patient contact or clinical details in presentation materials.

These tasks are ordered for a small finalization sprint. Completion means recording evidence and closing any defect found, not merely running a test.

## 1. Verify the active cohort across provider web and provider mobile

**Priority:** P1 · **Area:** Provider experience

Confirm all four active relationships appear in both provider patient lists, while the discharged test relationship appears only in the archive. Open each patient detail and compare shared fields, weekly routine status, and navigation back to the list. Edit an allowed field on the web and verify it refreshes read-only on provider mobile.

**Done when:** Both provider clients show the same four active relationships and current data after refresh/resume; any discrepancies have a linked fix and a passing recheck.

## 2. Complete a live three-app care walkthrough with the linked patient account

**Priority:** P1 · **Area:** Patient/provider integration

Using the already linked account and authorized sessions, exercise a scheduled routine, save exercise feedback, and inspect the result on patient mobile, provider web, and provider mobile. Check completion, issue labels, comments, and return-to-screen refresh. Include sign-out and sign-in to prove results persist.

**Done when:** The same saved assignment and feedback are visible after fresh sessions in all three clients; capture a short evidence log without private clinical text.

## 3. Decide and verify the pending-patient presentation path

**Priority:** P1 · **Area:** Onboarding/demo setup

For the three active relationships without linked patient accounts, decide whether the presentation shows provider-only care or an approved test onboarding flow. If onboarding is used, verify identity binding, one-time code expiry, collision handling, and first sign-in with designated test accounts before the demo. Do not issue or share credentials as part of backlog preparation.

**Done when:** Each pending relationship has an explicit demo role; any onboarding shown has a documented, successful and authorization-safe test path.

## 4. Verify messaging and schedule changes across the cohort

**Priority:** P1 · **Area:** Shared workflows

For the linked account, send and read messages from patient and provider clients; confirm unread and archive behavior across provider web/mobile. For the four active relationships, verify that assigning, replacing, and removing eligible routines on provider mobile appears on provider web and the patient's app where applicable. Check that ineligible started care is protected.

**Done when:** The cross-client state converges after refresh, retries do not duplicate changes, and any mismatch has a tracked fix.

## 5. Finish native acceptance on the two mobile apps

**Priority:** P1 · **Area:** Device QA

Run compiled Android and iOS builds on physical devices. Check authentication, cold restore, background lock, real keyboard avoidance, short screens, rotation/tablet layout, calendar touch targets, screen-reader navigation, and sign-out cleanup. Include the provider scheduling and conversation flows and the patient exercise controls.

**Done when:** A device/platform checklist records pass/fail and build versions; blocking failures are fixed and retested. Browser simulation alone does not close this task.

## 6. Prepare a repeatable, time-current demonstration

**Priority:** P1 · **Area:** Demo data

Choose a presentation date and confirm that the four active relationships have appropriate visible routine dates and statuses for that date. Keep historical demo results labeled as simulated. Use a reviewed, repeatable setup or reset procedure that preserves existing records; verify the display in all shown clients after setup.

**Done when:** A teammate can start the demo from a written checklist and reach the planned screens without editing live records during the presentation.

## 7. Rehearse and package the presentation

**Priority:** P1 · **Area:** Presentation

Create a short story showing provider overview, one patient's routine and feedback, cross-client refresh, and messaging. Assign a presenter and device for each transition. Prepare screenshots or a recording as a fallback, with private patient details hidden, and rehearse the full flow against the final build.

**Done when:** The timed rehearsal completes within the presentation slot, every transition has an owner and fallback, and slides/screens match the verified product behavior.

## 8. Record release gates and known limitations

**Priority:** P2 · **Area:** Release readiness

Run the current web and both mobile validation commands on the presentation revision. Record remaining device, security, and deployment limitations from the existing validation/readiness documents. State clearly whether the presentation is a prototype demonstration or a production release claim.

**Done when:** One dated sign-off lists the tested revision, results, owners for open blockers, and the exact claim the team will make during the presentation.
