# Incident: a third occurrence, in a freshly created worktree (2026-09-07)

> See [`INCIDENT_2026-09-06.md`](INCIDENT_2026-09-06.md) (the original) and
> [`INCIDENT_2026-09-07.md`](INCIDENT_2026-09-07.md) (a second occurrence,
> same day, different branch/session) for the full root-cause writeup and
> remediation this incident doesn't repeat. This file only records that a
> **third, independent occurrence** happened, with different specifics.

## What happened

While implementing the server-side practice-scoring feature
(`feature/practice-server-side-scoring`), I created a new `git worktree`
for isolation (to avoid disturbing another in-progress checkout of this
repo), cut from `origin/main` — the same root cause `INCIDENT_2026-09-07.md`
already identifies: `main` didn't yet have the not-yet-merged
`fix/local-tests-no-prod-writes` guard. I ran a bare `npm test` in that new
worktree to sanity-check dependency installation, without first checking
`jest.config.js` or running `--listTests` — despite already knowing, from
writing `INCIDENT_2026-09-06.md` myself earlier in this same work, exactly
this failure mode. `tests/integration.test.js` (at its old, unguarded,
repo-root `tests/` location in that worktree) ran to completion against
production (17/17 assertions "passed").

I noticed this immediately afterward (checking `jest.config.js` while
investigating something else) and:
1. Manually copied the guard files into that worktree before running any
   further tests there.
2. Later rebased the feature branch onto the fully-hardened
   `fix/local-tests-no-prod-writes` (commit `298837b`, from the other
   session's work) rather than my own earlier, less-hardened version.
3. Found and deleted **stray untracked leftover copies** of the old,
   unguarded `tests/integration.test.js` / `tests/live-api.test.js` that
   the rebase's merge mechanics left behind in the worktree — these would
   have been picked up by a future bare `npm test` in that worktree despite
   the branch itself being fixed, had they not been caught. (Root cause:
   these files were tracked in the worktree's original `main`-based commit;
   a `git reset` to a commit where they'd been renamed away doesn't delete
   untracked leftovers on disk, it just stops tracking them — verified
   deleted, verified `--listTests` no longer includes them afterward.)

## Confirmed / unrecoverable effects

Same shape as the other two incidents — I won't repeat the full account
here. Two more `test_<6-char timestamp>_kid[2]` accounts, same endpoints
called, same "no email, no other tables" conclusion **with the same
caveat as the other incidents: this is based on reading the application
code paths, not on inspecting the database or infrastructure — see the
qualification note added to `INCIDENT_2026-09-06.md`, which applies
equally here.** Exact nickname/timestamp not recoverable (not logged,
verbose output not captured, no DB access requested or used).

## What was NOT done

No cleanup endpoint called, no further live calls made after discovery, no
credentials requested or printed. Cleanup remains an unexecuted proposal —
see `INCIDENT_2026-09-06.md`'s "Proposed cleanup," which applies to this
run's rows too (they'll be the most recent ones matching that query).

## The uncomfortable pattern worth naming directly

Three occurrences of the identical failure mode, in one day, across at
least two different sessions/agents working on this repo, despite the
first incident being fully diagnosed and a fix already written before the
second and third happened. The common thread every time: a **fresh branch
or worktree cut from `origin/main`**, where the guard doesn't exist yet
because it's only a local, unpushed branch. `INCIDENT_2026-09-07.md`
already says this plainly: merging the guard into `main` promptly, rather
than leaving it as unpushed local work, is itself part of the fix — this
third occurrence is further evidence for that, not a reason to add a fourth
layer of defense in this branch. The regression test
(`tests/no-prod-in-default-run.test.js`) and the three existing layers are
sufficient *once merged*; the remaining exposure is entirely about how long
this fix sits unmerged.
