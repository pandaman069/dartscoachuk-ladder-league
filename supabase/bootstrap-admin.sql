-- Run only after creating the dedicated organiser user in Supabase Authentication.
-- Replace the email below with that organiser user's real email address.
update public.profiles
set is_player = false,
    admin_tier = 'full',
    display_name = 'League Organiser',
    status = 'active'
where email = 'REPLACE_WITH_ORGANISER_EMAIL';

-- Confirm exactly one row is returned and that is_player is false.
select id, username, display_name, email, is_player, admin_tier
from public.profiles
where email = 'REPLACE_WITH_ORGANISER_EMAIL';

