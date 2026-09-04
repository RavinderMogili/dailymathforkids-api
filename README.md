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
Unit tests with Jest:
```bash
npm test
```

## Notes
- Set `PUBLIC_API_BASE` as a GitHub Actions secret in the frontend repo so generated daily pages point to this API.
- Kid-friendly auth — students identify by nickname, with an optional PIN. No passwords or emails required for kids.
- All secrets live in environment variables — nothing sensitive is committed to the repo.
