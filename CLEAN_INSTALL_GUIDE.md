# Clean installation: GitHub, Netlify and Supabase

## 1. Supabase

Create a new Supabase project, then open **SQL Editor → New query**. Copy all of
`supabase/schema.sql` into the query and run it once.

Open **Authentication → Users → Add user**. Create the dedicated organiser with
your chosen email and a new secure password. Do not reuse the old prototype
password.

Open `supabase/bootstrap-admin.sql`, replace both instances of
`REPLACE_WITH_ORGANISER_EMAIL` with that exact email, and run it in a new SQL
query. Confirm the returned row has `is_player = false` and
`admin_tier = full`.

Run `supabase/enable-scheduled-start.sql`. If `pg_cron` is unavailable, enable
it under **Database → Extensions**, then run the file again.

Under **Authentication → URL Configuration**, enter the final Netlify URL as
the Site URL and add the same URL followed by `/**` under Redirect URLs.

## 2. GitHub

Create or empty the private repository `dartscoachuk-ladder-league`. Upload the
contents of this extracted package—not the ZIP itself—and commit to `main`.

## 3. Netlify

Import that GitHub repository. Use:

- Production branch: `main`
- Base directory: blank
- Build command: `npm run build:netlify`
- Publish directory: blank

Add these environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL` (add the Netlify URL after the first deployment if it
  was not available earlier)

Never add a Supabase secret/service-role key, database password or personal
access token.

Trigger **Clear cache and deploy site**. After the URL exists, update
`NEXT_PUBLIC_SITE_URL`, add it to Supabase URL Configuration and redeploy.

## 4. First use

Sign in with the organiser email and password created in Supabase. No organiser
credentials or examples appear on the login screen.

Create the first scheduled season. Test players can then create accounts. Add
at least £20.00 test credit to each player before they register: £10.00 pays the
test league fee and £10.00 remains as the minimum challenge balance.
