# Daily Math for Kids – Backend (Vercel + Supabase)

## Env vars (Vercel Project Settings → Environment Variables)
- `SUPABASE_URL` – your Supabase project URL
- `SUPABASE_SERVICE_ROLE` – Service Role key (server-side only). DO NOT expose on the client.

## Deploy
1. Create a new GitHub repo (e.g., `dailymathforkids-api`) and push these files.
2. Import the repo into Vercel (New Project → Import GitHub).
3. Add the env vars above in Vercel → Deploy.
4. Your API base URL will look like: `https://<project>.vercel.app`

## Supabase setup
Create a project at supabase.com, then run the SQL in `schema.sql`.

## API endpoints
- `POST /api/register` → body `{ "nickname": "Ravi" }` → returns `{ userId, nickname }`
- `POST /api/submit` → body `{ userId, quizId: "YYYY-MM-DD", answers: ["..","..","..","..",".."] }`
- `GET  /api/status?userId=...&quizId=YYYY-MM-DD` → `{ done: boolean, score }`

Make sure your site repo sets `PUBLIC_API_BASE` (in the GitHub Action env) to this backend URL.
