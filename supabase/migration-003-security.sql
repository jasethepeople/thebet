-- The Bet — security-hardening migration. Run AFTER migration-002-pro.sql.
-- Moves all game actions server-side so browser tampering cannot bypass rules.

-- ---------- Promo codes (free Pro codes you hand out) ----------
create table if not exists promo_codes(code text primary key, uses int not null default 0, max_uses int not null default 100, active boolean not null default true);
alter table promo_codes enable row level security; -- no client policies: managed via SQL Editor / service role only

-- ---------- Server-computed balance (mirror of the app logic) ----------
create or replace function user_balance(p_crew uuid, p_user uuid) returns int
language plpgsql stable security definer set search_path=public as $fn$
declare bal int := 100; b record; my_amt int; pool int; win int;
begin
  for b in select * from bets where crew_id = p_crew and not reported loop
    select amt into my_amt from picks where bet_id = b.id and user_id = p_user;
    if found then
      bal := bal - my_amt;
      if b.status = 'done' then
        select coalesce(sum(amt),0) into pool from picks where bet_id = b.id;
        select coalesce(sum(amt),0) into win  from picks where bet_id = b.id and side = b.result;
        if win = 0 or win = pool then
          bal := bal + my_amt;                                    -- nobody on the other side: refund
        elsif exists(select 1 from picks where bet_id = b.id and user_id = p_user and side = b.result) then
          bal := bal + round((pool * my_amt)::numeric / win)::int; -- winners split by stake
        end if;
      end if;
    end if;
  end loop;
  return bal;
end $fn$;

-- ---------- Game actions as security-definer RPCs ----------
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
  if p_amt is null or p_amt < 1 then raise exception 'Stake must be at least 1 BB'; end if;
  if p_side not in ('yes','no') then raise exception 'Pick Yes or No'; end if;
  if p_amt > user_balance(b.crew_id, auth.uid()) then raise exception 'Not enough BB'; end if;
  insert into picks(bet_id, user_id, side, amt) values(p_bet, auth.uid(), p_side, p_amt);
end $fn$;

create or replace function accept_forfeit(p_bet uuid) returns void
language plpgsql security definer set search_path=public as $fn$
declare b bets; n int; total int;
begin
  select * into b from bets where id = p_bet;
  if not found then raise exception 'Bet not found'; end if;
  if not is_member(b.crew_id) then raise exception 'Not a member of this crew'; end if;
  if b.status <> 'pending' then return; end if;
  insert into accepts(bet_id, user_id) values(p_bet, auth.uid()) on conflict do nothing;
  select count(*) into n from accepts where bet_id = p_bet;
  select count(*) into total from members where crew_id = b.crew_id;
  if n >= total then
    perform set_config('app.elevated','1',true);
    update bets set status = 'open' where id = p_bet and status = 'pending';
  end if;
end $fn$;

create or replace function settle_bet(p_bet uuid, p_result text, p_line text) returns void
language plpgsql security definer set search_path=public as $fn$
declare b bets;
begin
  select * into b from bets where id = p_bet;
  if not found then raise exception 'Bet not found'; end if;
  if not is_member(b.crew_id) then raise exception 'Not a member of this crew'; end if;
  if b.subject = auth.uid() then raise exception 'The subject cannot settle their own bet'; end if;
  if b.status <> 'open' then raise exception 'This bet is not open'; end if;
  if p_result not in ('yes','no') then raise exception 'Result must be yes or no'; end if;
  perform set_config('app.elevated','1',true);
  update bets set status = 'done', result = p_result, line = left(coalesce(p_line,''), 280) where id = p_bet;
end $fn$;

create or replace function veto_bet(p_bet uuid) returns void
language plpgsql security definer set search_path=public as $fn$
declare b bets;
begin
  select * into b from bets where id = p_bet;
  if not found then return; end if;
  if b.subject <> auth.uid() then raise exception 'Only the subject can veto this bet'; end if;
  delete from bets where id = p_bet;
end $fn$;

-- Crew creator can rotate the invite code (old links/codes stop working).
create or replace function rotate_code(p_crew uuid) returns void
language plpgsql security definer set search_path=public as $fn$
begin
  if not exists(select 1 from crews where id = p_crew and created_by = auth.uid()) then
    raise exception 'Only the crew creator can rotate the code';
  end if;
  update crews set code = substr(md5(random()::text),1,6) where id = p_crew;
end $fn$;

-- Redeem a free Pro code (the marketing hand-out codes).
create or replace function redeem_code(p_code text) returns void
language plpgsql security definer set search_path=public as $fn$
declare c promo_codes;
begin
  select * into c from promo_codes where code = upper(trim(p_code)) and active;
  if not found then raise exception 'Code not found or inactive'; end if;
  update promo_codes set uses = uses + 1 where code = c.code and uses < max_uses;
  if not found then raise exception 'This code has been fully used'; end if;
  perform set_config('app.elevated','1',true);
  update profiles set pro = true where id = auth.uid();
end $fn$;

-- ---------- Guards: users cannot grant themselves Pro or edit bet state directly ----------
create or replace function guard_profiles_pro() returns trigger
language plpgsql security definer set search_path=public as $fn$
begin
  if new.pro is distinct from old.pro and auth.uid() = new.id
     and coalesce(current_setting('app.elevated', true), '') <> '1' then
    raise exception 'Pro status can only change through a purchase or a redeem code';
  end if;
  return new;
end $fn$;
drop trigger if exists trg_guard_pro on profiles;
create trigger trg_guard_pro before update on profiles for each row execute function guard_profiles_pro();

create or replace function guard_bets_update() returns trigger
language plpgsql security definer set search_path=public as $fn$
begin
  if auth.uid() is not null and coalesce(current_setting('app.elevated', true), '') <> '1'
     and (new.status is distinct from old.status or new.result is distinct from old.result
          or new.line is distinct from old.line or new.question is distinct from old.question
          or new.forfeit is distinct from old.forfeit or new.subject is distinct from old.subject) then
    raise exception 'Bet state can only change through the game actions';
  end if;
  return new;
end $fn$;
drop trigger if exists trg_guard_bets on bets;
create trigger trg_guard_bets before update on bets for each row execute function guard_bets_update();

-- ---------- Tighten policies: direct writes now go through the RPCs above ----------
drop policy if exists k_ins on picks;
drop policy if exists a_ins on accepts;
-- b_upd stays for Report (reported flag only); guard_bets_update blocks every other column.

grant execute on function place_pick(uuid,text,int), accept_forfeit(uuid), settle_bet(uuid,text,text),
  veto_bet(uuid), rotate_code(uuid), redeem_code(text) to authenticated;

-- ---------- Make some free codes (edit as you like; codes are UPPERCASE) ----------
-- insert into promo_codes(code, max_uses) values ('LAUNCH2026', 500), ('FRIENDS50', 50);
