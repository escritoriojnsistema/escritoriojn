import {createDocumentArtifactsHandler} from './handler.ts';
Deno.serve(createDocumentArtifactsHandler({url:Deno.env.get('SUPABASE_URL')??'',anonKey:Deno.env.get('SUPABASE_ANON_KEY')??'',serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??''}));
