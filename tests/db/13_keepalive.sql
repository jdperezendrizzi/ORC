-- El despertador responde para anon y no cuenta más de un ping por minuto.
begin;
\o /dev/null
set local role anon;
select public.keepalive();
select public.keepalive();
reset role;
\o
do $$
begin
  if (select pings from private.keepalive) <> 0 then
    raise exception 'FALLA: dos pings seguidos no deberían sumar (el primero ya está dentro del minuto)';
  end if;
  update private.keepalive set last_ping = now() - interval '2 minutes';
  perform public.keepalive();
  if (select pings from private.keepalive) <> 1 then raise exception 'FALLA: el ping no sumó'; end if;
  raise notice '13_keepalive: OK';
end $$;
rollback;
