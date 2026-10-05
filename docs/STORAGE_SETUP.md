# Recording Storage Setup (Supabase — free)

Practice recordings are stored in **Supabase Storage** (free tier: 1 GB storage,
2 GB downloads/month — roughly 300–500 voice recordings). Firebase is still used
for login and the database; only the audio files moved.

## One-time setup (about 5 minutes)

1. Go to **https://supabase.com** → *Start your project* → sign in with GitHub
   or Google (free, no card needed).
2. Click **New project**
   - Name: `sangeeta-gurukulam` (anything works)
   - Database password: pick anything strong (you won't need it again)
   - Region: **Mumbai (ap-south-1)** for fastest access from India
3. When the project finishes creating, open **Storage** (left sidebar)
   → **New bucket**
   - Name: `recordings`
   - **Keep "Public bucket" OFF** (recordings stay private; the app creates
     temporary signed links for playback)
4. Open **Project Settings → API** and copy two values:
   - **Project URL** (looks like `https://abcdxyz.supabase.co`)
   - **service_role key** (under "Project API keys" — keep this secret)

## Add the keys to the app

In the file `.env.local` (or your hosting provider's environment variables),
add:

```
SUPABASE_URL=https://abcdxyz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...   (the service_role key)
```

Then restart / redeploy the app. That's it — recording upload and playback
will work for students, teachers, and the super-admin.

## Notes

- The service_role key must only ever live in server environment variables —
  never commit it to git and never expose it in client code. The app only uses
  it inside API routes.
- Old recordings that were stored in Firebase (if any uploaded successfully)
  still play — the app falls back to Firebase for those.
- To free space later, delete old files from Supabase → Storage → recordings.
