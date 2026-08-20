-- pg_net installs into the first schema on the search path, which is `public`,
-- and PostgREST publishes `public`: http_post would become an RPC anyone with
-- the anon key could call, which is a server side request forgery. The
-- extension does not support SET SCHEMA, so it is reinstalled instead. Its own
-- objects live in the `net` schema either way, which PostgREST does not expose.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
