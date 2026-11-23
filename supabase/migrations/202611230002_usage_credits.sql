begin;
-- Per-user usage credit, held in hundredths of a penny so Google's per-request
-- prices (e.g. 0.4p) are exact. Users can read their own rows; only the server
-- (service_role) can change them, through the functions below.
create table if not exists placewise.credit_balances(
 user_id uuid primary key references auth.users(id) on delete cascade,
 balance bigint not null default 0 check (balance>=0),
 updated_at timestamptz not null default now()
);
create table if not exists placewise.credit_ledger(
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 delta bigint not null,
 kind text not null check (kind in ('topup','usage','refund')),
 sku text,
 units integer,
 paid_pence integer,
 fee_pence integer,
 stripe_session_id text unique,
 created_at timestamptz not null default now()
);
create index if not exists credit_ledger_user_idx on placewise.credit_ledger(user_id,created_at desc);
alter table placewise.credit_balances enable row level security;
alter table placewise.credit_ledger enable row level security;
revoke all on placewise.credit_balances,placewise.credit_ledger from anon,authenticated;
grant select on placewise.credit_balances,placewise.credit_ledger to authenticated;
grant select,insert,update,delete on placewise.credit_balances,placewise.credit_ledger to service_role;
drop policy if exists credit_balances_own on placewise.credit_balances;
create policy credit_balances_own on placewise.credit_balances for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists credit_ledger_own on placewise.credit_ledger;
create policy credit_ledger_own on placewise.credit_ledger for select to authenticated using (user_id=(select auth.uid()));

-- Idempotent per Stripe Checkout session: a replayed webhook credits nothing.
create or replace function placewise.credit_topup(p_user uuid,p_credit bigint,p_paid_pence integer,p_fee_pence integer,p_session text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_credit<0 then return false; end if;
 insert into placewise.credit_ledger(user_id,delta,kind,paid_pence,fee_pence,stripe_session_id)
 values(p_user,p_credit,'topup',p_paid_pence,p_fee_pence,p_session)
 on conflict (stripe_session_id) do nothing;
 if not found then return false; end if;
 insert into placewise.credit_balances as b(user_id,balance) values(p_user,p_credit)
 on conflict(user_id) do update set balance=b.balance+p_credit,updated_at=now();
 return true;
end; $$;

-- All or nothing: never takes a balance below zero.
create or replace function placewise.spend_credit(p_user uuid,p_amount bigint,p_sku text,p_units integer) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_amount<1 then return false; end if;
 update placewise.credit_balances set balance=balance-p_amount,updated_at=now() where user_id=p_user and balance>=p_amount;
 if not found then return false; end if;
 insert into placewise.credit_ledger(user_id,delta,kind,sku,units) values(p_user,-p_amount,'usage',p_sku,p_units);
 return true;
end; $$;
-- Returns credit taken for a call that was then refused (e.g. paid ceiling reached).
create or replace function placewise.refund_credit(p_user uuid,p_amount bigint,p_sku text,p_units integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_amount<1 then return; end if;
 update placewise.credit_balances set balance=balance+p_amount,updated_at=now() where user_id=p_user;
 insert into placewise.credit_ledger(user_id,delta,kind,sku,units) values(p_user,p_amount,'refund',p_sku,p_units);
end; $$;
revoke all on function placewise.refund_credit(uuid,bigint,text,integer) from public,anon,authenticated;
grant execute on function placewise.refund_credit(uuid,bigint,text,integer) to service_role;
revoke all on function placewise.credit_topup(uuid,bigint,integer,integer,text) from public,anon,authenticated;
revoke all on function placewise.spend_credit(uuid,bigint,text,integer) from public,anon,authenticated;
grant execute on function placewise.credit_topup(uuid,bigint,integer,integer,text) to service_role;
grant execute on function placewise.spend_credit(uuid,bigint,text,integer) to service_role;
commit;
