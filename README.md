# Daily Math for Kids – Backend (Vercel + Supabase)

Serverless API for [dailymathforkids.com](https://dailymathforkids.com) — handles student accounts, quiz submissions, practice sessions, mistake tracking, and progress history.

Frontend repo: [dailymathforkids](https://github.com/RavinderMogili/dailymathforkids)

## Environment Variables (Vercel Project Settings → Environment Variables)
| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE` | Service Role secret key — **server-side only, never expose on client** |
| `RESEND_API_KEY` | Optional — for weekly parent progress emails |

## Deploy Steps
1. Create a GitHub repo (e.g. `dailymathforkids-api`) and push these files.
2. Import the repo into [Vercel](https://vercel.com) → New Project → Import GitHub.
3. Add the env vars above in Vercel → Settings → Environment Variables → Deploy.
4. Your API base URL will be: `https://<project>.vercel.app`

## Supabase Setup
1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** and run the full contents of `schema.sql`.
3. This creates the `users`, `quizzes`, `submissions`, `practice_submissions`, `mistakes`, `groups`, and related tables.

## API Endpoints

### Accounts
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/register` | POST | Register a new student (nickname, grade, school, city) |
| `/api/lookup` | GET | Look up a returning student by nickname |
| `/api/set-pin` | POST | Set a PIN for account security (stored as SHA-256 hash) |
| `/api/forgot-pin` | POST | PIN recovery |
| `/api/forgot-nickname` | POST | Nickname recovery |
| `/api/update-email` | POST | Add/update a parent email |

### Quizzes & Practice
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/submit` | POST | Submit daily quiz answers, get score and points. Wrong answers are saved for later review |
| `/api/status` | GET | Check if a student already submitted today's quiz |
| `/api/practice-submit` | POST | Record a practice session with score and wrong answers |
| `/api/upsert-quiz` | POST | Store the daily quiz questions/answers (called by the generation workflow) |

### Progress & Review
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/history` | GET | Full progress history — quiz scores, practice stats, points |
| `/api/mistakes` | GET/POST/PATCH | Fetch, save, or resolve a student's mistakes (quiz + practice) |

### Other
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/groups` | GET/POST | Class/family groups with join codes |
| `/api/feedback` | POST | Bug reports and question issue reports from the site |
| `/api/analytics` | GET | Basic usage stats |
| `/api/weekly-email` | GET/POST | Weekly parent progress email (Vercel Cron, Sundays) |
| `/api/math-stars` | GET | Public weekly leaderboard (opted-in students only) |
| `/api/math-stars-opt` | POST | Toggle a student's Math Stars visibility |
| `/api/prize-club` | GET | Public "300-Point Club" — students who crossed a reward milestone and opted in |
| `/api/prize-club-opt` | POST | Toggle a student's 300-Point Club visibility (separate consent from Math Stars) |
| `/api/prize-winners` | GET | Admin-only — full milestone list including parent emails, for sending gift cards |
| `/api/send-prize-email` | POST | Admin-only — emails a Walmart eGift code to a winner's parent from `progress@dailymathforkids.com`, marks milestone delivered |

## Points System
- **+1 pt** per correct answer
- **+3 bonus pts** for a perfect quiz score
- Practice sessions earn points too, with a daily cap

## Testing
Local, fully-mocked unit tests (no network calls — safe to run anytime):
```bash
npm test
```
This is guaranteed safe against production by construction, not just
convention — [`tests/no-prod-in-default-run.test.js`](tests/no-prod-in-default-run.test.js)
regression-tests that jest's actual computed file list for `npm test` never
includes anything under `tests/live/` or any file containing the production
hostname. See `tests/live/INCIDENT_2026-09-06.md` and
`tests/live/INCIDENT_2026-09-07.md` for what happens when that guarantee
breaks (twice, so far) and why the checks now exist at three independent
layers instead of one.

Live/integration tests (`tests/live/`) make real network calls, and
`tests/live/integration.test.js` creates real accounts wherever they're
pointed at. They require explicit opt-in at two separate points — see
[`tests/live/liveGuard.js`](tests/live/liveGuard.js):
```bash
ALLOW_LIVE_TESTS=true LIVE_API_BASE_URL=https://your-staging-deploy.vercel.app npm run test:live
```
Pointing `LIVE_API_BASE_URL` at the production API host is refused even with
`ALLOW_LIVE_TESTS=true`, unless you also set a second, separate
acknowledgement naming the exact host:
```bash
ALLOW_LIVE_TESTS=true LIVE_API_BASE_URL=https://dailymathforkids-api.vercel.app CONFIRM_PRODUCTION_LIVE_TESTS=dailymathforkids-api.vercel.app npm run test:live
```
This opt-in is checked at module load time in every `tests/live/*.test.js`
file, so even running one of those files directly (bypassing jest's default
test-path exclusion entirely) still refuses to contact production without it.

## Notes
- Set `PUBLIC_API_BASE` as a GitHub Actions secret in the frontend repo so generated daily pages point to this API.
- Kid-friendly auth — students identify by nickname, with an optional PIN. No passwords or emails required for kids.
- All secrets live in environment variables — nothing sensitive is committed to the repo.
