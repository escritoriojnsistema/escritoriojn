import { createTeamInvitationHandler } from './handler.ts';

Deno.serve(createTeamInvitationHandler({
  url:Deno.env.get('SUPABASE_URL')??'',
  anonKey:Deno.env.get('SUPABASE_ANON_KEY')??'',
  serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',
  siteUrl:Deno.env.get('APP_SITE_URL'),
}));
