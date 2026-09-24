# Mobile web parity

Branch: `codex/mobile-web-parity`, based on mobile `75ea8b6`.
Compared with web `2dbcbf8` (September 2026).

## Implemented

- Read the web's `tasks.sort_order`, `lists.sort_order` and `lists.sections`.
- Reorder own list tabs by holding them for two seconds; order is saved to Supabase.
- Reorder own tasks and section headers by holding them, with VoiceOver
  earlier/later actions. Completion remains on the check circle; holding a
  task no longer completes it accidentally.
- Display, add, rename, recolor and delete sections. Removing a section does
  not remove its tasks. Manual ordering matches the web, including new
  unpositioned tasks appearing above the manually ordered rows.
- Shared lists retain the web's existing automatic task ordering and do not
  expose owner-only ordering/section controls.
- Reuse the native iOS system font, match Apple neutral colors, use 17px
  semibold logo/calendar heading and improve list/task text readability.
- Add a repeat icon beside the date.
- One save action confirms both date and recurrence drafts and closes the
  date picker. Dismissing it discards drafts. Task changes are then persisted
  by the existing task editor's save action. The picker is an overlay within
  that editor instead of a second native iOS modal.
- Surface order-save failures, scope database writes by owner/list, and
  prevent stale reloads during ordering from replacing optimistic state.

## Verification

- `npm test`: 28 data mapping, ordering, error propagation and interaction
  tests. Native components are mocked; this is not physical-device testing.
- `npx expo export --platform ios --output-dir dist-ios`: successful Hermes
  bundle. This verifies compilation, not credentials or signed app delivery.
- No runtime/native dependencies added. `react-test-renderer` is a pinned
  development-only dependency, matching React 19.1.0.

## Review / Device Checks

- Check long-press gestures and visual stacking on a physical iPhone, including
  many tabs, large text and long task lists. Dragging now animates neighbouring
  cards to make a gap and auto-scrolls at the edges, including when held still.
- Check VoiceOver ordering, switching screens after cancelling a drag,
  section editing, recurrence saves and reopening the app to verify syncing.
- Ordering rows uses the existing web schema and separate writes; task/section
  updates are not a database transaction. Partial failures are reported and
  state is reloaded. No schema migration or production data changes were run.
- Desktop pane splitters/custom browser scrollbars are not appropriate for
  the phone pager; native swipe navigation and scrolling remain in place.

## Delivery State

Published to the production channel for iOS on September 21, 2026, after
Rinse explicitly approved publication. Not merged; the source checkout and
existing June worktrees remain untouched.

- Update group: `0a7795df-483d-4b66-98c8-60efe156449a`
- iOS update: `01a0c470-4ae0-7339-9f64-b9db78d741e9`
- Runtime: `7.2`
- Bundle: `index-d34d88f0b23dc6344149cc23cb727a8b.hbc`
- Published from this worktree's uncommitted changes; Expo reports the base
  commit `75ea8b6`, not a separate release commit.
- Reran all 16 tests. Rebuilt with the existing production Supabase URL and
  anonymous key from the source EAS config via process environment variables.
  Confirmed both values and the new sections feature are present in the
  published bundle, without printing the values or copying configuration files.

Expo read-only checks found iOS 7.2 build 21, runtime 7.2, production channel;
the most recent production OTA matches the August 13 mobile baseline.
This JS-only change used that existing OTA workflow. Existing
ignored environment/EAS configuration stays in the source checkout and has
not been copied into this branch. No Apple build or submission was started.

## Follow-up Release: September 21, 2026, 21:03 UTC

- Update group: `ca57f2a6-3c25-4344-b27e-7b3a6f89aaf4`
- iOS update: `01a0c5c8-29cb-792e-b80d-0762d164a9a1`, production, runtime `7.2`.
- Removed visible grips; two-second long press starts dragging. Neighbours
  animate aside, and edge scrolling accumulates into the drop position.
- Completion target is 48 points; visible circle is 30 points.
- Date picker always opens the current month, preserving the existing date
  until the user chooses a different one and saves.
- Task/event notes use an editor anchored above the keyboard. Titles can be
  edited multiline. List selection is a compact dropdown, restricted to lists
  with the same owner and appropriate edit permission.
- Saving a new task uses the selected destination, then scrolls to its saved
  ID, with retries for unmeasured FlatList rows. Moving lists resets manual
  sort position and translates shared-list IDs before database writes.
- New/renamed task titles longer than 48 characters use the existing Claude
  proxy to obtain a compact keyword title. Original text is appended to notes
  without overwriting existing notes. Notes are not sent to the model. Timeout,
  invalid response or network failure preserves the original title unchanged.
  Existing untouched task titles are not bulk-rewritten.
- 28 tests pass, iOS Hermes export succeeds. One synthetic request verified
  real AI shortening and text preservation. Physical iPhone validation remains
  necessary for actual gestures, keyboard geometry and dynamic text sizing.

## Compact Date Badges: September 21, 2026, 21:33 UTC

- Non-recurring date badges now fit their text with the standard badge padding.
  Recurring badges retain their minimum width and aligned repeat icon.
- 29 tests pass, including a rendered-card regression test for both cases.
- Published iOS production update `01a0c5e3-cb57-7e89-a502-ace97cbea513`,
  group `bfeb8549-7be5-4248-9f08-b138def32c26`, runtime `7.2`.

## Date Picker Layout: September 21, 2026, 21:37 UTC

- Save is centered under clear-date with 16-point bottom spacing.
- Calendar cells no longer shrink; the selection uses a centered 34-point
  square with explicit centered text metrics.
- 30 tests pass; iOS export and publication succeeded.
- iOS update `01a0c5e7-7af0-747f-9708-4e8824c8ddb0`, group
  `7f09f77b-09d5-40af-8786-739008c97fda`, production runtime `7.2`.

## Calendar Gestures: September 22, 2026, 08:47 UTC

- Hold an owned timed event to move it vertically while preserving duration.
  Selected events expose upper/lower resize handles and accessible time steps.
- Changes snap to 15 minutes, with a minimum duration of 15 minutes. A live
  preview shows start/end times and duration; release saves once.
- Cancelled gestures do not save; failed writes restore the original preview
  and show an error. Scrolling and page swipes are disabled during a gesture.
- The event editor also waits for save completion and reports database errors.
- All 37 tests pass; iOS Hermes export and production publication succeeded.
  Physical iPhone gesture validation remains outstanding.
- iOS update `01a0c84c-7b9f-779f-8302-4607dd0e904b`, group
  `fe670c75-1db4-4c38-a03c-3e7363b7f054`, production runtime `7.2`.
  The live production manifest was verified against this update ID.
- Published from this worktree's uncommitted changes, baseline `75ea8b6`.
  No web changes, new Apple build, merge or source-checkout changes.
