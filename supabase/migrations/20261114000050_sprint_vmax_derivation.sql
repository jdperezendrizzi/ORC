-- Valor nuevo del enum en su propia migración: Postgres no deja usar un
-- valor de enum en la misma transacción en que se agrega.
alter type public.metric_derivation add value if not exists 'sprint_vmax';
