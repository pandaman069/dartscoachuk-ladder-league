# DartsCoachUK Official Ladder League

Complete prototype-design frontend connected to the existing Supabase multiplayer project and deployed through GitHub to Netlify.

This is a GitHub-only replacement. Follow `GITHUB_ONLY_INSTALL.md`. Do not change the Supabase project, run a database reset, recreate the organiser, or replace the Netlify environment variables.

The application opens in a pre-season state when no league exists. Players may create accounts immediately; joining a season remains a separate action that appears when the organiser publishes one.

Included areas cover the player dashboard, ladder, normal challenges, Power Play, match arrangement, match lobby, scoring and statistics, venues and attendance, notifications, settings, organiser queues, players, season/division setup, permissions and audit history.

## Local verification

```text
npm ci
npx tsc --noEmit
npm run build:netlify
```

No real payment provider is included. Balances are test credit for live testing.
