import {createRetentionHandler} from './handler.ts';
// Hosted projects may supply named modern keys instead of legacy JWT keys.
function runtimeKey(collection:string,legacy:string):string{
 try{const values=JSON.parse(Deno.env.get(collection)??'{}');if(typeof values.default==='string'&&values.default)return values.default;}catch{/* Legacy projects keep their existing key. */}
 return Deno.env.get(legacy)??'';
}
Deno.serve(createRetentionHandler({url:Deno.env.get('SUPABASE_URL')??'',serviceRoleKey:runtimeKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY'),anonKey:runtimeKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),cronSecret:Deno.env.get('RETENTION_CRON_SECRET')??''}));
