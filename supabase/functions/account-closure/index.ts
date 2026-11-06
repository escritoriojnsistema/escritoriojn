import {createAccountClosureHandler} from './handler.ts';
// Hosted projects may supply named modern keys instead of legacy JWT keys.
function runtimeKey(collection:string,legacy:string):string{
 try{const values=JSON.parse(Deno.env.get(collection)??'{}');if(typeof values.default==='string'&&values.default)return values.default;}catch{/* Legacy projects keep their existing key. */}
 return Deno.env.get(legacy)??'';
}
Deno.serve(createAccountClosureHandler({url:Deno.env.get('SUPABASE_URL')??'',anonKey:runtimeKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),serviceRoleKey:runtimeKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY'),cronSecret:Deno.env.get('ACCOUNT_CLOSURE_CRON_SECRET')??''}));
