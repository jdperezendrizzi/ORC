-- =====================================================================
-- "Despertador" para el plan gratis de Supabase: un proyecto sin
-- actividad por 7 días se pausa. Vercel Cron llama una vez por día a
-- /api/keepalive, que ejecuta esta función (lectura + escritura real en
-- la base). Como mucho cuenta un ping por minuto (no se puede abusar).
-- =====================================================================
create table private.keepalive (
  id         smallint primary key default 1 check (id = 1),
  last_ping  timestamptz not null default now(),
  pings      bigint not null default 0
);
insert into private.keepalive default values;

create or replace function public.keepalive()
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  update private.keepalive
     set last_ping = now(), pings = pings + 1
   where id = 1 and last_ping < now() - interval '1 minute';
  select last_ping from private.keepalive where id = 1;
$$;
revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
