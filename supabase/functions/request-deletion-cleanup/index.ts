import { createRequestDeletionCleanupHandler } from './handler.ts';

Deno.serve(
  createRequestDeletionCleanupHandler({
    url: Deno.env.get('SUPABASE_URL') ?? '',
    anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    cronSecret: Deno.env.get('REQUEST_DELETION_WORKER_SECRET') ?? '',
  }),
);
