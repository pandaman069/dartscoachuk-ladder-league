# DartsCoachUK Official Ladder League — live multiplayer test

This release uses Supabase for real accounts and shared league state. Players
on different devices see the same registrations, ladder, challenges, matches,
scores and notifications. Refreshing or logging out does not erase data.

No payment provider is connected. All balances are test credits adjusted by
the full organiser.

Start with `CLEAN_INSTALL_GUIDE.md`, then use `LIVE_TEST_CHECKLIST.md` before
inviting a larger testing group.

## Included live workflows

- Email/password signup, confirmation, login, logout and password recovery.
- Server-created player profiles with unique usernames.
- One dedicated full organiser account with no credentials displayed in-app.
- Scheduled season registration using organiser-issued test credits.
- Automatic season start, recommended balanced divisions and seven-day
  postponement when too few eligible players are ready.
- Normal challenge range and weekly allowance enforcement.
- Power Play opening/closing windows, countdown and automatic restoration after
  refusal or cancellation.
- Challenge acceptance, refusal, cancellation and match arrangement.
- Shared best-of-seven scoring, double attempts, confirmation and ladder
  movement.
- Realtime ladder, match, challenge and in-app notification updates.
- Approved venue register and player venue proposals.
- Full-admin test-credit adjustments and permanent player deletion.
- Row Level Security and protected database functions.

## Deliberate test exclusions

- No card payments, withdrawals or real-money refunds.
- Email and SMS league notifications require separate delivery providers;
  in-app notifications are fully shared and persistent.
- GPS check-in, guest referee access and production identity verification are
  not enabled in this closed-test release.
