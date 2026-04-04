# Daily Math for Kids – Backend (Vercel + Supabase)

## Environment Variables (Vercel Project Settings → Environment Variables)
| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE` | Service Role secret key — **server-side only, never expose on client** |

## Deploy Steps
1. Create a GitHub repo (e.g. `dailymathforkids-api`) and push these files.
2. Import the repo into [Vercel](https://vercel.com) → New Project → Import GitHub.
3. Add the two env vars above in Vercel → Settings → Environment Variables → Deploy.
4. Your API base URL will be: `https://<project>.vercel.app`

## Supabase Setup
1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** and run the full contents of `schema.sql`.
3. This creates the `users`, `quizzes`, `submissions` tables plus the `leaderboard` view.

## API Endpoints

### `POST /api/register`
Register a new student or update an existing one.
```json
{ "nickname": "MathStar99", "grade": "Grade 4", "school": "Hillcrest Elementary", "city": "Moncton" }
```
Returns: `{ userId, nickname, grade, school, city }`

### `GET /api/lookup?nickname=MathStar99`
Look up an existing student by nickname (for returning users).
Returns: `{ userId, nickname, grade, school, city }` or `404`

### `POST /api/submit`
Submit quiz answers and earn points.
```json
{ "userId": "...", "quizId": "2025-09-01", "answers": ["53","53","42","8","22"] }
```
Returns: `{ score, outOf, points_earned, already }` — `already: true` if already submitted today.

### `GET /api/leaderboard?grade=Grade+4&city=Moncton&limit=50`
Get top students. All query params are optional.
Returns: `{ leaderboard: [{ nickname, grade, school, city, total_points, days_played, rank }] }`

### `GET /api/status?userId=...&quizId=YYYY-MM-DD`
Check if a student already submitted today's quiz.
Returns: `{ done: boolean, score }`

## Points System
- **+1 pt** per correct answer
- **+3 bonus pts** for a perfect score (all 5 correct)
- Maximum **8 pts** per quiz

## Notes
- Set `PUBLIC_API_BASE` as a GitHub Actions secret in the frontend repo so generated daily pages point to this API.
- No passwords — students identify by nickname only.
