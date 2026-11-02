# Free demo deployment: Supabase, Render, then Vercel

This configuration is for a private, single-user demo. It uses Supabase for PostgreSQL, private object storage, and password authentication; Render for the Express API; and Vercel for the Vite frontend.

## 1. Prepare the Supabase project

1. Create a Supabase project and save its project URL.
2. In **SQL Editor**, run `docs/database-schema.sql` against the empty project database.
3. In **Storage**, create a private bucket named `uploads`. Keep it private and set its maximum file size to 50 MB. The app limit below is 48 MiB to stay below the provider limit.
4. In **Authentication → Providers / Settings**, disable public sign-ups. This app stores one shared dataset, so use one owner account only.
5. In **Authentication → Users**, create the owner account and copy its user UUID. Mark its email as confirmed if the project requires email confirmation.
6. Copy the project API URL, the publishable/anon key, and the `service_role` key. The service-role key is a backend secret and must never be placed in a `VITE_` frontend variable.
7. Copy the PostgreSQL connection string. Use the Supabase session pooler if the direct connection is not reachable from Render. The connection must use TLS.

## 2. Deploy the API to Render

Before configuring the API, decide the Vercel production project name so you know its expected `https://<project-name>.vercel.app` origin. If Vercel assigns a different production domain, update `FRONTEND_ORIGIN` in Render and redeploy the API.

1. Create a **Web Service** connected to this repository.
2. Set **Root Directory** to `backend`, **Build Command** to `npm ci`, and **Start Command** to `npm start`. The package requires Node.js 22.13 or newer.
3. Pick a Render service name and choose the Free instance for a temporary demo.
4. Add the environment variables below. Replace values in angle brackets with the real values; do not include the brackets.

```dotenv
FRONTEND_ORIGIN=https://<your-vercel-project>.vercel.app
MAX_UPLOAD_MB=48
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<Supabase-publishable-or-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<Supabase-service-role-key>
SUPABASE_STORAGE_BUCKET=uploads
AUTH_REQUIRED=true
AUTH_ALLOWED_USER_ID=<owner-user-uuid>
REQUIRE_DATABASE=true
REQUIRE_STORAGE=true
DATABASE_URL=<Supabase-Postgres-connection-string>
DATABASE_SSL=true
LLM_PROVIDER=disabled
```

5. Deploy and wait for the service to become live. Copy its `https://<service>.onrender.com` URL.
6. Open `https://<service>.onrender.com/api/config/capabilities`. Confirm the reported persistence is PostgreSQL, YARA is accurately reported as unavailable unless separately installed, and storage reports available Supabase. `REQUIRE_DATABASE` and `REQUIRE_STORAGE` make startup fail rather than silently switching to local storage.

## 3. Deploy the frontend to Vercel last

1. Import the repository in Vercel, set the project root to `frontend`, and choose Node.js 22.x for the build runtime.
2. Set the build command to `npm ci && npm run build` and output directory to `dist`.
3. Add these Vercel environment variables for **Production**:

```dotenv
VITE_API_BASE_URL=https://<your-render-service>.onrender.com
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<Supabase-publishable-or-anon-key>
```

4. Deploy. The app uses the Render API URL directly, and the API allows only the exact Vercel origin configured in `FRONTEND_ORIGIN`.
5. Sign in with the owner account created in Supabase. There is no sign-up link in the app.

## 4. Verify persistence and access controls

1. In a private browser window, confirm the app prompts for sign-in and protected API calls return `401` without a session.
2. Sign in, upload a harmless sample file smaller than 50 MB, and run analysis.
3. Confirm the record appears in PostgreSQL, the object appears in the private `uploads` bucket, and the analysis/report works after the Render service wakes from idle.
4. Delete the sample and confirm the object is removed from Storage. If using the purge option, confirm the database record is also removed.
5. In Supabase Auth settings, confirm public sign-ups remain disabled. Do not give the service-role key to the frontend or commit any credentials.

## Free-plan limitations

Render Free services can sleep and use an ephemeral filesystem; analysis jobs in this app run in-process and can be interrupted by a restart. Supabase Free has limited database and object-storage quotas and may pause inactive projects. These services are suitable for a demo, not an availability or durability promise. This app has no per-user data separation, so keep it single-user with public sign-ups disabled. Do not upload sensitive files.

## Current environment-variable behavior

`AUTH_REQUIRED=true` requires Supabase URL, anon/publishable key, and `AUTH_ALLOWED_USER_ID`. `REQUIRE_DATABASE=true` makes startup fail rather than silently selecting local JSON if PostgreSQL is missing. `REQUIRE_STORAGE=true` makes startup fail if the private bucket is missing or unreachable. `STORAGE_PROVIDER=supabase` requires the Supabase URL, service-role key, and bucket. Keep the service-role credential only in Render's backend environment.
