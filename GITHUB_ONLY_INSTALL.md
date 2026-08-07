# DartsCoachUK Official Ladder League — GitHub-only replacement

This package preserves the existing Supabase project and the environment variables already configured in Netlify. Do not create a new Supabase project and do not run any SQL during this replacement.

## Install

1. Download and extract this ZIP.
2. Open the GitHub repository currently connected to `https://dcukladdertest.netlify.app`.
3. Delete the old application files in that repository, while keeping the repository itself and its Git history.
4. Upload every file and folder from the extracted package to the repository root.
5. Commit the replacement to the branch Netlify deploys (normally `main`).
6. In Netlify, keep the existing environment variables unchanged:
   - `NEXT_PUBLIC_SUPABASE_URL=https://nfbylsdccxecykhwudhj.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — keep the current value already stored in Netlify.
   - `NEXT_PUBLIC_SITE_URL=https://dcukladdertest.netlify.app`
7. Select **Deploys → Trigger deploy → Clear cache and deploy site**.
8. Wait for the deploy to show **Published**, then open the site in a private/incognito window.

## Clean-start behaviour

- Existing Supabase accounts and the organiser account are preserved.
- No administrator credentials are displayed on the login page.
- Players can create accounts before a season exists.
- Before the first season is created, players see that no season is available.
- The full-access organiser can create the first scheduled season from **Organiser → League**.
- Player registration is separate from account creation.
- Live data, challenges, Power Plays, matches, scoring, venues, notifications, balances and audit records use the existing Supabase project.

## Verified checks

The packaged source passed:

- `npx tsc --noEmit`
- `npm run build:netlify`

No Supabase database or Netlify setting needs to be replaced.
