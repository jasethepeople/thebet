-- The Bet — Pro paywall migration. Run AFTER schema.sql (in SQL Editor > New query).

-- 1) Pro flag. Set by the stripe-webhook Edge Function only. Never by the client.
alter table profiles add column if not exists pro boolean not null default false;

-- 2) Approved forfeit list, served to the app so client and server never drift.
create table if not exists forfeits(label text primary key);
insert into forfeits(label) values
  ('20 push-ups, video proof'),
  ('Buys the next round'),
  ('One push-up on video whenever the winner calls'),
  ('Wears the winner''s jersey for a day'),
  ('Posts an embarrassing photo')
on conflict do nothing;
alter table forfeits enable row level security;
drop policy if exists f_sel on forfeits;
create policy f_sel on forfeits for select to authenticated using (true);

-- 3) Server-side enforcement: a bet may carry a custom forfeit only if the
--    creator is Pro. This runs in the database, so browser tampering cannot bypass it.
create or replace function enforce_forfeit() returns trigger
language plpgsql security definer set search_path=public as $fn$
begin
  if new.forfeit <> '' and not exists (select 1 from forfeits where label = new.forfeit) then
    if not exists (select 1 from profiles where id = auth.uid() and pro) then
      raise exception 'Custom forfeits are a Pro feature. Unlock Pro to set your own.';
    end if;
  end if;
  return new;
end $fn$;
drop trigger if exists trg_enforce_forfeit on bets;
create trigger trg_enforce_forfeit before insert on bets
  for each row execute function enforce_forfeit();
