-- The Bet — custom-forfeit tokens + silent-drop moderation. Run AFTER migration-003.

-- Everyone gets free custom forfeits. Founding Crew (pre-launch users) gets 100.
alter table profiles add column if not exists forfeit_tokens int not null default 10;
update profiles set forfeit_tokens = 100 where forfeit_tokens = 10; -- Founding Crew grant; delete this line after public launch

-- Private moderation audit log. NEVER readable from the client. No text stored — hash only.
create table if not exists mod_log(id bigint generated always as identity primary key,
  user_id uuid, kind text not null, excerpt_hash text not null, created_at timestamptz not null default now());
alter table mod_log enable row level security; -- no policies: service role only

-- Bets can now only be created through post_bet (direct inserts blocked).
create or replace function guard_bets_insert() returns trigger
language plpgsql security definer set search_path=public as $fn$
begin
  if auth.uid() is not null and coalesce(current_setting('app.elevated', true), '') <> '1' then
    raise exception 'Bets must be posted through the game actions';
  end if;
  return new;
end $fn$;
drop trigger if exists trg_enforce_forfeit on bets;
create trigger trg_guard_bets_insert before insert on bets for each row execute function guard_bets_insert();

-- One transaction: validate, moderate, charge a token, insert.
create or replace function post_bet(p_crew uuid, p_subject uuid, p_question text, p_forfeit text) returns bets
language plpgsql security definer set search_path=public as $fn$
declare v_pro boolean; v_tokens int; v_custom boolean; is_sex boolean; is_minor boolean; v bets;
begin
  if not is_member(p_crew) then raise exception 'Not a member of this crew'; end if;
  if not exists(select 1 from members where crew_id = p_crew and user_id = p_subject) then
    raise exception 'Pick someone in the crew'; end if;
  if p_question is null or length(trim(p_question)) < 3 then raise exception 'Write the bet first'; end if;

  v_custom := coalesce(p_forfeit,'') <> '' and not exists(select 1 from forfeits where label = p_forfeit);
  if v_custom then
    -- Layer 1 (critical): sexual + minor terms together -> never stored, hash logged, same generic error.
    is_sex := p_forfeit ~* '(sex|nude|naked|porn|strip|nsfw|lewd|blowjob|onlyfans|sexual)';
    is_minor := p_forfeit ~* '(child|kid|minor|under ?age|teen(ager)?|preteen|toddler|\byr old\b|\byear old\b)';
    if is_sex and is_minor then
      insert into mod_log(user_id, kind, excerpt_hash) values(auth.uid(), 'critical', md5(p_forfeit));
      raise exception 'Could not post that one, try a different wording';
    end if;
    -- Layer 2 (toxic): threats / doxxing -> silent dead end.
    if p_forfeit ~* '(kill (yourself|them)|kys|dox|swat|home address|ssn|social security|credit card)' then
      insert into mod_log(user_id, kind, excerpt_hash) values(auth.uid(), 'toxic', md5(p_forfeit));
      raise exception 'Could not post that one, try a different wording';
    end if;
    -- Charge a token unless Pro.
    select pro, forfeit_tokens into v_pro, v_tokens from profiles where id = auth.uid();
    if not v_pro then
      if v_tokens < 1 then
        raise exception 'Out of custom forfeits. Earn one back when a bet you made settles with 4+ players, or go Pro for unlimited.';
      end if;
      update profiles set forfeit_tokens = forfeit_tokens - 1 where id = auth.uid();
    end if;
  end if;

  perform set_config('app.elevated','1',true);
  insert into bets(crew_id, subject, question, forfeit, status, created_by)
    values(p_crew, p_subject, left(trim(p_question), 280), coalesce(p_forfeit,''),
           case when coalesce(p_forfeit,'') = '' then 'open' else 'pending' end, auth.uid())
    returning * into v;
  return v;
end $fn$;

-- Negative BB is allowed now; keep a sanity cap only.
create or replace function place_pick(p_bet uuid, p_side text, p_amt int) returns void
language plpgsql security definer set search_path=public as $fn$
declare b bets;
begin
  select * into b from bets where id = p_bet;
  if not found then raise exception 'Bet not found'; end if;
  if not is_member(b.crew_id) then raise exception 'Not a member of this crew'; end if;
  if b.status <> 'open' then raise exception 'This bet is not open'; end if;
  if b.subject = auth.uid() then raise exception 'You cannot bet on yourself'; end if;
  if exists(select 1 from picks where bet_id = p_bet and user_id = auth.uid()) then raise exception 'You already picked'; end if;
  if p_amt is null or p_amt < 1 or p_amt > 100000 then raise exception 'Stake must be 1 to 100,000 BB'; end if;
  if p_side not in ('yes','no') then raise exception 'Pick Yes or No'; end if;
  insert into picks(bet_id, user_id, side, amt) values(p_bet, auth.uid(), p_side, p_amt);
end $fn$;

-- Settling with 4+ players refunds the creator a custom-forfeit token (the grind loop).
create or replace function settle_bet(p_bet uuid, p_result text, p_line text) returns void
language plpgsql security definer set search_path=public as $fn$
declare b bets; n int;
begin
  select * into b from bets where id = p_bet;
  if not found then raise exception 'Bet not found'; end if;
  if not is_member(b.crew_id) then raise exception 'Not a member of this crew'; end if;
  if b.subject = auth.uid() then raise exception 'The subject cannot settle their own bet'; end if;
  if b.status <> 'open' then raise exception 'This bet is not open'; end if;
  if p_result not in ('yes','no') then raise exception 'Result must be yes or no'; end if;
  perform set_config('app.elevated','1',true);
  update bets set status = 'done', result = p_result, line = left(coalesce(p_line,''), 280) where id = p_bet;
  select count(*) into n from picks where bet_id = p_bet;
  if n >= 4 then
    update profiles set forfeit_tokens = forfeit_tokens + 1 where id = b.created_by;
  end if;
end $fn$;

grant execute on function post_bet(uuid,uuid,text,text) to authenticated;
-- place_pick / settle_bet grants already exist from migration-003 (function replaced, grants persist)
