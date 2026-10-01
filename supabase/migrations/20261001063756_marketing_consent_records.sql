create table public.marketing_consent_events (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 app text not null check (app in ('nexus','pulse')),
 email text,
 email_opt_in boolean not null default false,
 sms_opt_in boolean not null default false,
 phone text,
 source text not null check(source in ('signup','activation','account')),
 disclosure_version text not null check(disclosure_version = '2026-10-01'),
 recorded_at timestamptz not null default clock_timestamp(),
 check(not sms_opt_in or phone ~ '^\+[1-9][0-9]{7,14}$')
);
create index marketing_consent_owner_time on public.marketing_consent_events(user_id,app,recorded_at desc,id desc);
alter table public.marketing_consent_events enable row level security;
revoke all on public.marketing_consent_events from anon,authenticated;
grant select on public.marketing_consent_events to authenticated;
grant insert(user_id,app,email,email_opt_in,sms_opt_in,phone,source,disclosure_version) on public.marketing_consent_events to authenticated;
grant usage on sequence public.marketing_consent_events_id_seq to authenticated;
create policy consent_owner_read on public.marketing_consent_events for select to authenticated using((select auth.uid())=user_id);
create policy consent_owner_insert on public.marketing_consent_events for insert to authenticated with check((select auth.uid())=user_id and email=(select auth.jwt()->>'email'));
create schema if not exists private;
create or replace function private.capture_signup_marketing_consent() returns trigger language plpgsql security definer set search_path='' as $$
declare c jsonb;
begin
 c:=new.raw_user_meta_data->'marketing_consent';
 if c->>'app'='pulse' and c->>'source'='signup' and c->>'disclosure_version'='2026-10-01' then
  insert into public.marketing_consent_events(user_id,app,email,email_opt_in,sms_opt_in,phone,source,disclosure_version)
  values(new.id,'pulse',new.email,c->'email_opt_in'='true'::jsonb,c->'sms_opt_in'='true'::jsonb,
    case when c->'sms_opt_in'='true'::jsonb then c->>'phone' else null end,'signup','2026-10-01');
 end if;
 return new;
end $$;
revoke all on function private.capture_signup_marketing_consent() from public,anon,authenticated;
create trigger capture_signup_marketing_consent after insert on auth.users for each row execute function private.capture_signup_marketing_consent();
