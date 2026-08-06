-- DartsCoachUK Official Ladder League — fresh live-test installation
-- Run once in a brand-new Supabase project. No real payment provider is used.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{4,24}$'),
  display_name text not null,
  email text not null,
  mobile text,
  status text not null default 'active' check (status in ('active','review','inactive','suspended','secured','removed')),
  admin_tier text check (admin_tier in ('full','manager','operations')),
  is_player boolean not null default true,
  test_credit_pence integer not null default 0 check (test_credit_pence >= 0),
  notification_preferences jsonb not null default '{"inApp":true,"email":true,"sms":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season_name text not null,
  starts_on date not null,
  ends_on date not null,
  week_number integer not null default 0,
  status text not null default 'scheduled' check (status in ('scheduled','live','paused','stopped','completed')),
  registration_open boolean not null default true,
  league_fee_pence integer not null default 1000,
  minimum_challenge_balance_pence integer not null default 1000,
  minimum_players integer not null default 12 check (minimum_players between 2 and 100),
  preferred_division_size integer not null default 20 check (preferred_division_size between 4 and 40),
  challenge_reach integer not null default 3 check (challenge_reach between 1 and 20),
  weekly_challenges integer not null default 2 check (weekly_challenges between 0 and 10),
  max_active_challenges integer not null default 2 check (max_active_challenges between 1 and 10),
  response_days integer not null default 3 check (response_days between 1 and 14),
  completion_days integer not null default 7 check (completion_days between 1 and 28),
  opponent_cooldown_weeks integer not null default 2 check (opponent_cooldown_weeks between 0 and 12),
  normal_close_weeks integer not null default 1 check (normal_close_weeks between 0 and 8),
  power_plays_per_player integer not null default 1 check (power_plays_per_player between 0 and 10),
  power_play_open_week integer not null default 2 check (power_play_open_week between 1 and 52),
  power_play_close_weeks integer not null default 4 check (power_play_close_weeks between 0 and 12),
  settings_locked boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null,
  sort_order integer not null,
  unique (league_id, sort_order), unique (league_id, name)
);

create table public.league_players (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  division_id uuid references public.divisions(id) on delete set null,
  player_id uuid not null references public.profiles(id) on delete cascade,
  ladder_position integer,
  previous_division integer,
  previous_position integer,
  is_new_player boolean not null default true,
  registration_status text not null default 'registered' check (registration_status in ('registered','waiting','withdrawn','removed')),
  league_fee_recorded boolean not null default false,
  starting_balance_recorded boolean not null default false,
  weekly_challenges_used integer not null default 0,
  refusals_used integer not null default 0,
  power_plays_used integer not null default 0,
  played integer not null default 0,
  won integer not null default 0,
  lost integer not null default 0,
  legs_for integer not null default 0,
  legs_against integer not null default 0,
  joined_at timestamptz not null default now(),
  unique (league_id, player_id), unique (division_id, ladder_position)
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  postcode text not null,
  boards integer not null default 1,
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  submitted_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  division_id uuid not null references public.divisions(id) on delete cascade,
  challenger_id uuid not null references public.profiles(id),
  challenged_id uuid not null references public.profiles(id),
  is_power_play boolean not null default false,
  status text not null default 'pending' check (status in ('pending','accepted','refused','cancelled','scheduled','completed','expired')),
  response_due_at timestamptz not null,
  play_due_at timestamptz not null,
  refusal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (challenger_id <> challenged_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null unique references public.challenges(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  division_id uuid not null references public.divisions(id) on delete cascade,
  player_one_id uuid not null references public.profiles(id),
  player_two_id uuid not null references public.profiles(id),
  venue_id uuid references public.venues(id),
  scheduled_at timestamptz,
  status text not null default 'arranging' check (status in ('arranging','scheduled','live','awaiting_confirmation','confirmed','disputed','cancelled')),
  player_one_legs integer not null default 0,
  player_two_legs integer not null default 0,
  player_one_remaining integer not null default 501,
  player_two_remaining integer not null default 501,
  current_thrower uuid,
  current_leg integer not null default 1,
  player_one_confirmed boolean not null default false,
  player_two_confirmed boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (player_one_id <> player_two_id)
);

create table public.match_visits (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  leg_number integer not null,
  player_id uuid not null references public.profiles(id),
  visit_number integer not null,
  score integer not null check (score between 0 and 180),
  remaining_before integer not null,
  remaining_after integer not null,
  darts_used integer not null check (darts_used between 1 and 3),
  double_attempts integer not null default 0 check (double_attempts between 0 and 3),
  is_bust boolean not null default false,
  is_checkout boolean not null default false,
  entered_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  title text not null,
  message text not null,
  priority text not null default 'normal',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.wallet_adjustments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id),
  amount_pence integer not null,
  balance_before_pence integer not null,
  balance_after_pence integer not null,
  reason text not null,
  adjusted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  subject_type text not null,
  subject_id text,
  detail jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create view public.player_directory as
select id,username,display_name,status,is_player
from public.profiles;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and admin_tier is not null); $$;

create or replace function public.is_full_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and admin_tier='full'); $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare desired text; final_username text;
begin
  desired := lower(coalesce(nullif(new.raw_user_meta_data->>'username',''),split_part(coalesce(new.email,''),'@',1)));
  desired := regexp_replace(desired,'[^a-z0-9._-]','','g');
  if length(desired)<4 then desired := 'player'||substr(new.id::text,1,8); end if;
  final_username := left(desired,24);
  if exists(select 1 from public.profiles where username=final_username) then final_username := left(desired,19)||substr(new.id::text,1,4); end if;
  insert into public.profiles(id,username,display_name,email,mobile)
  values(new.id,final_username,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),'New player'),coalesce(new.email,''),new.raw_user_meta_data->>'mobile');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.adjust_test_balance(target_player uuid, amount integer, adjustment_reason text)
returns integer language plpgsql security definer set search_path=public
as $$ declare old_balance integer; new_balance integer;
begin
  if not public.is_full_admin() then raise exception 'Full administrator access required'; end if;
  if amount=0 or length(trim(adjustment_reason))<5 then raise exception 'A non-zero amount and meaningful reason are required'; end if;
  select test_credit_pence into old_balance from public.profiles where id=target_player for update;
  new_balance := old_balance+amount; if new_balance<0 then raise exception 'Balance cannot become negative'; end if;
  update public.profiles set test_credit_pence=new_balance,updated_at=now() where id=target_player;
  insert into public.wallet_adjustments values(default,target_player,amount,old_balance,new_balance,trim(adjustment_reason),auth.uid(),default);
  insert into public.audit_log(actor_id,action,subject_type,subject_id,detail,reason) values(auth.uid(),'test_balance_adjusted','profile',target_player::text,jsonb_build_object('before',old_balance,'after',new_balance),trim(adjustment_reason));
  return new_balance;
end $$;

create or replace function public.register_for_league(target_league uuid)
returns uuid language plpgsql security definer set search_path=public
as $$ declare rules public.leagues%rowtype; balance integer; membership_id uuid;
begin
  select * into rules from public.leagues where id=target_league and status='scheduled' and registration_open;
  if rules.id is null then raise exception 'Registration is not open'; end if;
  select test_credit_pence into balance from public.profiles where id=auth.uid() and is_player and status='active' for update;
  if balance < rules.league_fee_pence+rules.minimum_challenge_balance_pence then raise exception 'Insufficient test credit for the fee and minimum challenge balance'; end if;
  update public.profiles set test_credit_pence=test_credit_pence-rules.league_fee_pence where id=auth.uid();
  insert into public.league_players(league_id,player_id,league_fee_recorded,starting_balance_recorded)
  values(target_league,auth.uid(),true,true) returning id into membership_id;
  insert into public.audit_log(actor_id,action,subject_type,subject_id,detail,reason) values(auth.uid(),'season_registered','league',target_league::text,jsonb_build_object('fee',rules.league_fee_pence),'Player completed season registration');
  return membership_id;
end $$;

create or replace function public.issue_challenge(target_player uuid,target_league uuid,power_play boolean default false)
returns uuid language plpgsql security definer set search_path=public
as $$ declare me public.league_players%rowtype; opponent public.league_players%rowtype; rules public.leagues%rowtype; active_count integer; weeks_left integer; challenge_id uuid;
begin
  select * into rules from public.leagues where id=target_league and status='live'; if rules.id is null then raise exception 'League is not live'; end if;
  select * into me from public.league_players where league_id=target_league and player_id=auth.uid() and registration_status='registered' for update;
  select * into opponent from public.league_players where league_id=target_league and player_id=target_player and registration_status='registered';
  if me.id is null or opponent.id is null or me.division_id<>opponent.division_id then raise exception 'Players must be active in the same division'; end if;
  if exists(select 1 from public.profiles where id=target_player and status<>'active') then raise exception 'Target is unavailable'; end if;
  select count(*) into active_count from public.challenges where challenger_id=auth.uid() and status in ('pending','accepted','scheduled');
  if active_count>=rules.max_active_challenges then raise exception 'Maximum active challenges reached'; end if;
  weeks_left := greatest(0,ceil((rules.ends_on-current_date)/7.0)::integer);
  if power_play then
    if rules.week_number<rules.power_play_open_week or weeks_left<=rules.power_play_close_weeks then raise exception 'Power Play window is closed'; end if;
    if me.power_plays_used>=rules.power_plays_per_player then raise exception 'No Power Plays remain'; end if;
    update public.league_players set power_plays_used=power_plays_used+1 where id=me.id;
  else
    if weeks_left<=rules.normal_close_weeks then raise exception 'Normal challenge window is closed'; end if;
    if opponent.ladder_position>=me.ladder_position or me.ladder_position-opponent.ladder_position>rules.challenge_reach then raise exception 'Target is outside normal challenge range'; end if;
    if me.weekly_challenges_used>=rules.weekly_challenges then raise exception 'Weekly allowance used'; end if;
    update public.league_players set weekly_challenges_used=weekly_challenges_used+1 where id=me.id;
  end if;
  if exists(select 1 from public.challenges where league_id=target_league and status='completed' and ((challenger_id=auth.uid() and challenged_id=target_player) or (challenger_id=target_player and challenged_id=auth.uid())) and updated_at>now()-make_interval(weeks=>rules.opponent_cooldown_weeks)) then raise exception 'Opponent cooldown is active'; end if;
  insert into public.challenges(league_id,division_id,challenger_id,challenged_id,is_power_play,response_due_at,play_due_at)
  values(target_league,me.division_id,auth.uid(),target_player,power_play,now()+make_interval(days=>rules.response_days),now()+make_interval(days=>rules.completion_days)) returning id into challenge_id;
  insert into public.notifications(recipient_id,category,title,message,priority) values(target_player,'challenge',case when power_play then 'Power Play challenge' else 'New challenge' end,'Open the Challenge Centre to respond.','important');
  return challenge_id;
end $$;

create or replace function public.respond_to_challenge(target_challenge uuid,decision text,reason_text text default null)
returns uuid language plpgsql security definer set search_path=public
as $$ declare item public.challenges%rowtype; match_id uuid;
begin
  select * into item from public.challenges where id=target_challenge for update;
  if item.challenged_id<>auth.uid() or item.status<>'pending' then raise exception 'Challenge cannot be changed'; end if;
  if decision='refuse' then
    update public.challenges set status='refused',refusal_reason=reason_text,updated_at=now() where id=item.id;
    update public.league_players set refusals_used=refusals_used+1 where league_id=item.league_id and player_id=auth.uid();
    if item.is_power_play then update public.league_players set power_plays_used=greatest(0,power_plays_used-1) where league_id=item.league_id and player_id=item.challenger_id; end if;
    insert into public.notifications(recipient_id,category,title,message,priority) values(item.challenger_id,'challenge',case when item.is_power_play then 'Power Play restored' else 'Challenge refused' end,case when item.is_power_play then 'The challenge was refused, so your Power Play has been returned.' else 'The opponent refused your challenge.' end,'important');
    return null;
  elsif decision<>'accept' then raise exception 'Decision must be accept or refuse'; end if;
  update public.challenges set status='accepted',updated_at=now() where id=item.id;
  insert into public.matches(challenge_id,league_id,division_id,player_one_id,player_two_id,current_thrower)
  values(item.id,item.league_id,item.division_id,item.challenger_id,item.challenged_id,item.challenger_id) returning id into match_id;
  insert into public.notifications(recipient_id,category,title,message,priority) values(item.challenger_id,'challenge','Challenge accepted','Arrange the match date and approved venue.','important');
  return match_id;
end $$;

create or replace function public.schedule_match(target_match uuid,when_to_play timestamptz,target_venue uuid)
returns void language plpgsql security definer set search_path=public
as $$ begin
  update public.matches set scheduled_at=when_to_play,venue_id=target_venue,status='scheduled',updated_at=now()
  where id=target_match and auth.uid() in (player_one_id,player_two_id);
  if not found then raise exception 'Match not found or permission denied'; end if;
end $$;

create or replace function public.record_visit(target_match uuid,visit_score integer,darts integer default 3,double_attempt_count integer default 0)
returns public.matches language plpgsql security definer set search_path=public
as $$ declare game public.matches%rowtype; before_score integer; after_score integer; bust boolean; checkout boolean; visit_no integer;
begin
  select * into game from public.matches where id=target_match for update;
  if game.id is null or auth.uid() not in (game.player_one_id,game.player_two_id) then raise exception 'Only a match player may score'; end if;
  if game.status not in ('scheduled','live') then raise exception 'Match is not available for scoring'; end if;
  if game.current_thrower<>auth.uid() then raise exception 'It is not your turn'; end if;
  if visit_score<0 or visit_score>180 or darts<1 or darts>3 then raise exception 'Invalid visit'; end if;
  before_score := case when auth.uid()=game.player_one_id then game.player_one_remaining else game.player_two_remaining end;
  after_score := before_score-visit_score;
  bust := after_score<0 or after_score=1;
  checkout := after_score=0;
  if bust then after_score:=before_score; checkout:=false; end if;
  if checkout and double_attempt_count<1 then raise exception 'A checkout must include at least one dart at double'; end if;
  select coalesce(max(visit_number),0)+1 into visit_no from public.match_visits where match_id=target_match and leg_number=game.current_leg and player_id=auth.uid();
  insert into public.match_visits(match_id,leg_number,player_id,visit_number,score,remaining_before,remaining_after,darts_used,double_attempts,is_bust,is_checkout,entered_by)
  values(target_match,game.current_leg,auth.uid(),visit_no,visit_score,before_score,after_score,darts,double_attempt_count,bust,checkout,auth.uid());
  if checkout then
    if auth.uid()=game.player_one_id then game.player_one_legs:=game.player_one_legs+1; else game.player_two_legs:=game.player_two_legs+1; end if;
    if game.player_one_legs=4 or game.player_two_legs=4 then
      update public.matches set player_one_legs=game.player_one_legs,player_two_legs=game.player_two_legs,status='awaiting_confirmation',completed_at=now(),updated_at=now() where id=target_match returning * into game;
    else
      update public.matches set player_one_legs=game.player_one_legs,player_two_legs=game.player_two_legs,player_one_remaining=501,player_two_remaining=501,current_leg=current_leg+1,current_thrower=case when current_thrower=player_one_id then player_two_id else player_one_id end,status='live',started_at=coalesce(started_at,now()),updated_at=now() where id=target_match returning * into game;
    end if;
  else
    update public.matches set player_one_remaining=case when auth.uid()=player_one_id then after_score else player_one_remaining end,player_two_remaining=case when auth.uid()=player_two_id then after_score else player_two_remaining end,current_thrower=case when current_thrower=player_one_id then player_two_id else player_one_id end,status='live',started_at=coalesce(started_at,now()),updated_at=now() where id=target_match returning * into game;
  end if;
  return game;
end $$;

create or replace function public.cancel_challenge(target_challenge uuid,cancellation_reason text)
returns void language plpgsql security definer set search_path=public
as $$ declare item public.challenges%rowtype;
begin
  select * into item from public.challenges where id=target_challenge for update;
  if item.id is null or (auth.uid()<>item.challenger_id and not public.is_admin()) then raise exception 'Challenge cannot be cancelled'; end if;
  if item.status not in ('pending','accepted','scheduled') then raise exception 'Challenge is already closed'; end if;
  if length(trim(cancellation_reason))<5 then raise exception 'A meaningful reason is required'; end if;
  update public.challenges set status='cancelled',updated_at=now() where id=item.id;
  update public.matches set status='cancelled',updated_at=now() where challenge_id=item.id;
  if item.is_power_play then update public.league_players set power_plays_used=greatest(0,power_plays_used-1) where league_id=item.league_id and player_id=item.challenger_id; end if;
  insert into public.notifications(recipient_id,category,title,message,priority) values(item.challenger_id,'challenge',case when item.is_power_play then 'Power Play restored' else 'Challenge cancelled' end,case when item.is_power_play then 'The cancelled challenge returned your Power Play.' else 'The challenge has been cancelled.' end,'important');
  insert into public.audit_log(actor_id,action,subject_type,subject_id,reason) values(auth.uid(),'challenge_cancelled','challenge',item.id::text,trim(cancellation_reason));
end $$;

create or replace function public.confirm_match_result(target_match uuid)
returns void language plpgsql security definer set search_path=public
as $$ declare game public.matches%rowtype; item public.challenges%rowtype; winner uuid; loser uuid; winner_pos integer; loser_pos integer;
begin
  select * into game from public.matches where id=target_match for update;
  if game.status not in ('awaiting_confirmation','confirmed') or auth.uid() not in (game.player_one_id,game.player_two_id) then raise exception 'Result cannot be confirmed'; end if;
  update public.matches set player_one_confirmed=player_one_confirmed or auth.uid()=player_one_id,player_two_confirmed=player_two_confirmed or auth.uid()=player_two_id where id=target_match returning * into game;
  if not (game.player_one_confirmed and game.player_two_confirmed) then return; end if;
  winner:=case when game.player_one_legs=4 then game.player_one_id else game.player_two_id end; loser:=case when winner=game.player_one_id then game.player_two_id else game.player_one_id end;
  select * into item from public.challenges where id=game.challenge_id;
  select ladder_position into winner_pos from public.league_players where league_id=game.league_id and player_id=winner;
  select ladder_position into loser_pos from public.league_players where league_id=game.league_id and player_id=loser;
  update public.league_players set played=played+1,won=won+case when player_id=winner then 1 else 0 end,lost=lost+case when player_id=loser then 1 else 0 end,legs_for=legs_for+case when player_id=game.player_one_id then game.player_one_legs else game.player_two_legs end,legs_against=legs_against+case when player_id=game.player_one_id then game.player_two_legs else game.player_one_legs end where league_id=game.league_id and player_id in (winner,loser);
  if winner=item.challenger_id and winner_pos>loser_pos then
    update public.league_players set ladder_position=ladder_position+1000 where division_id=game.division_id and ladder_position between loser_pos and winner_pos;
    update public.league_players set ladder_position=loser_pos where league_id=game.league_id and player_id=winner;
    update public.league_players set ladder_position=ladder_position-999 where division_id=game.division_id and player_id<>winner and ladder_position between loser_pos+1000 and winner_pos+1000;
  end if;
  update public.matches set status='confirmed',updated_at=now() where id=target_match;
  update public.challenges set status='completed',updated_at=now() where id=item.id;
end $$;

create or replace function public.process_scheduled_seasons()
returns void language plpgsql security definer set search_path=public
as $$ declare season public.leagues%rowtype; eligible integer; div_count integer; div_size integer; counter integer; member record; target_div uuid; calculated_week integer;
begin
  for season in select * from public.leagues where status='live' for update loop
    calculated_week:=greatest(1,floor((current_date-season.starts_on)/7.0)::integer+1);
    if calculated_week<>season.week_number then
      update public.leagues set week_number=calculated_week where id=season.id;
      update public.league_players set weekly_challenges_used=0 where league_id=season.id;
      insert into public.notifications(recipient_id,category,title,message,priority) select player_id,'league','New league week','Week '||calculated_week||' is now open and normal challenge allowances have reset.','normal' from public.league_players where league_id=season.id and registration_status='registered';
    end if;
    if current_date>season.ends_on then update public.leagues set status='completed',settings_locked=true where id=season.id; end if;
  end loop;
  for season in select * from public.leagues where status='scheduled' and starts_on<=current_date for update loop
    select count(*) into eligible from public.league_players lp join public.profiles p on p.id=lp.player_id where lp.league_id=season.id and lp.registration_status='registered' and lp.league_fee_recorded and lp.starting_balance_recorded and p.test_credit_pence>=season.minimum_challenge_balance_pence and p.status='active';
    if eligible<season.minimum_players then
      update public.leagues set starts_on=starts_on+7,ends_on=ends_on+7 where id=season.id;
      insert into public.notifications(recipient_id,category,title,message,priority) select id,'admin','Season postponed',season.season_name||' moved back one week because only '||eligible||' eligible players were ready.','urgent' from public.profiles where admin_tier is not null;
      continue;
    end if;
    div_count:=greatest(1,ceil(eligible::numeric/season.preferred_division_size)::integer); div_size:=ceil(eligible::numeric/div_count)::integer;
    delete from public.divisions where league_id=season.id;
    for counter in 1..div_count loop insert into public.divisions(league_id,name,sort_order) values(season.id,'Division '||counter,counter); end loop;
    counter:=0;
    for member in select id from public.league_players where league_id=season.id and registration_status='registered' order by is_new_player,previous_division nulls last,previous_position nulls last,joined_at loop
      counter:=counter+1; select id into target_div from public.divisions where league_id=season.id and sort_order=least(div_count,ceil(counter::numeric/div_size)::integer);
      update public.league_players set division_id=target_div,ladder_position=((counter-1)%div_size)+1 where id=member.id;
    end loop;
    update public.leagues set status='live',week_number=1,registration_open=false,settings_locked=true where id=season.id;
    insert into public.notifications(recipient_id,category,title,message,priority) select player_id,'league','Season is live','Your division and opening ladder position are ready.','important' from public.league_players where league_id=season.id;
  end loop;
end $$;

create or replace function public.admin_delete_player(target_player uuid,deletion_reason text)
returns void language plpgsql security definer set search_path=public,auth
as $$ begin
  if not public.is_full_admin() or target_player=auth.uid() or length(trim(deletion_reason))<5 then raise exception 'Full admin access and a meaningful reason are required'; end if;
  insert into public.audit_log(actor_id,action,subject_type,subject_id,reason) values(auth.uid(),'player_deleted','profile',target_player::text,trim(deletion_reason));
  delete from auth.users where id=target_player;
end $$;

alter table public.profiles enable row level security; alter table public.leagues enable row level security; alter table public.divisions enable row level security; alter table public.league_players enable row level security; alter table public.venues enable row level security; alter table public.challenges enable row level security; alter table public.matches enable row level security; alter table public.match_visits enable row level security; alter table public.notifications enable row level security; alter table public.wallet_adjustments enable row level security; alter table public.audit_log enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
create policy profile_self_update on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy leagues_read on public.leagues for select to authenticated using (true);
create policy leagues_admin on public.leagues for all to authenticated using (public.is_full_admin()) with check (public.is_full_admin());
create policy divisions_read on public.divisions for select to authenticated using (true);
create policy divisions_admin on public.divisions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy memberships_read on public.league_players for select to authenticated using (true);
create policy memberships_admin on public.league_players for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy venues_read on public.venues for select to authenticated using (status='approved' or submitted_by=auth.uid() or public.is_admin());
create policy venues_submit on public.venues for insert to authenticated with check (submitted_by=auth.uid() or public.is_admin());
create policy venues_admin on public.venues for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy challenges_read on public.challenges for select to authenticated using (challenger_id=auth.uid() or challenged_id=auth.uid() or public.is_admin());
create policy matches_read on public.matches for select to authenticated using (true);
create policy visits_read on public.match_visits for select to authenticated using (true);
create policy notifications_self on public.notifications for select to authenticated using (recipient_id=auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());
create policy wallet_read on public.wallet_adjustments for select to authenticated using (player_id=auth.uid() or public.is_full_admin());
create policy audit_admin on public.audit_log for select to authenticated using (public.is_admin());

revoke update on public.profiles from authenticated;
grant update(display_name,mobile,notification_preferences) on public.profiles to authenticated;
grant select on public.player_directory to authenticated;
grant execute on function public.adjust_test_balance(uuid,integer,text),public.register_for_league(uuid),public.issue_challenge(uuid,uuid,boolean),public.respond_to_challenge(uuid,text,text),public.schedule_match(uuid,timestamptz,uuid),public.record_visit(uuid,integer,integer,integer),public.confirm_match_result(uuid),public.cancel_challenge(uuid,text),public.admin_delete_player(uuid,text) to authenticated;
revoke all on function public.process_scheduled_seasons() from public,anon,authenticated;

alter publication supabase_realtime add table public.leagues;
alter publication supabase_realtime add table public.league_players;
alter publication supabase_realtime add table public.challenges;
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.match_visits;
alter publication supabase_realtime add table public.notifications;
