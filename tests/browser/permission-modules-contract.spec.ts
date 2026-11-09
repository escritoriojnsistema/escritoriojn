import {assignablePermissions} from '../../shared/team';
import { test, expect, type Page } from '@playwright/test';
import type { TeamDashboard, TeamScope } from '../../shared/team';

// Dedicated UI contract proof: run with the fake SDK connection on port 3015.
// These stubs verify presentation and transport, not Supabase/SMTP integration.
test.skip(!process.env.TEAM_UI_CONTRACT, 'Requires the dedicated fake public SDK connection (TEAM_UI_CONTRACT=1).');
const office = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const scope: TeamScope = { role_code: 'owner', allowed_roles: ['employee', 'admin', 'owner'], allowed_permissions: ['foundation.access', 'audit.read'], can_create_owner: true, can_delegate: true };
function roster(page = 1): TeamDashboard {
  return { kind: 'members', scope, total: 6, page, page_size: 5, counts: { members: 6, invitations: 0 }, items: Array.from({ length: page === 1 ? 5 : 1 }, (_, index) => ({ id: `44444444-4444-4444-8444-44444444444${index}`, user_id: user, name: page === 1 ? `Pessoa da Equipe ${index + 1}` : 'Pessoa da Segunda Página', email: `pessoa${index}@example.test`, role_code: index === 0 ? 'owner' as const : index === 1 ? 'admin' as const : 'employee' as const, active: true, access_active: true, permissions: ['foundation.access'], cpf_masked: '***.***.***-25', can_edit: true, protected_owner: index === 0, delegation: null })) };
}
async function session(page: Page, permissions = ['foundation.access', 'users.manage'], role = 'owner') {
  await page.route('**/api/account/read',r=>r.fulfill({json:{data:{name:'Pessoa de Teste',cpf:null,email:'fixture@example.test',version:'a'.repeat(64),cpf_masked:null,pending_email:null,can_edit:role!=='client'}}}));
  const token = `e30.${Buffer.from(JSON.stringify({ sub: user, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', session_id: office })).toString('base64url')}.fixture`;
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('sb-team-ui-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-only-refresh-token', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user: { id: user, aud: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-18T00:00:00Z' } }));
  }, { token, user });
  await page.route('https://team-ui.supabase.co/**', route => route.fulfill({ json: { id: user, email: 'fixture@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {} } }));
  await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/auth/context', route => route.fulfill({ json: { data: { user: { id: user }, contexts: [{ office_id: office, user_id: user, role_code: role, permissions, office_name: 'Escritório de Teste', display_name: 'Pessoa de Teste' }] } } }));
}
async function dashboard(page: Page, data = roster()) {
  await page.route('**/api/team?**', route => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('office_id')).toBe(office);
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    return route.fulfill({ json: { data: query.get('kind') === 'invitations' ? { ...data, kind: 'invitations', items: [], total: 0 } : { ...data, ...(query.get('page') === '2' ? roster(2) : {}) } } });
  });
}


for(const width of [360,1440])test(`permission modules expand search bulk and persist ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await session(page);const data=roster();data.scope={...scope,allowed_permissions:[...assignablePermissions]};if(data.kind!=='members')throw Error();const member=data.items[2];await dashboard(page,data);
 let saved:any;
 await page.route(`**/api/team/members/${member.id}`,r=>{saved=r.request().postDataJSON();member.permissions=saved.permissions;return r.fulfill({json:{data:{ok:true}}});});
 await page.goto('/equipe');await page.getByRole('button',{name:`Editar acesso de ${member.name}`,exact:true}).click();
 const group=page.getByRole('button',{name:/^Imóveis rurais .*permissões habilitadas/});await expect(group).toHaveAttribute('aria-expanded','false');await expect(page.getByRole('checkbox',{name:/^Cadastrar imóveis rurais/})).toHaveCount(0);await group.click();
 await page.getByRole('checkbox',{name:/^Cadastrar imóveis rurais/}).check();await expect(page.getByText('Alterações não salvas',{exact:true})).toBeVisible();
 const all=page.getByRole('checkbox',{name:'Selecionar todas de Imóveis rurais',exact:true});expect(await all.evaluate(e=>(e as HTMLInputElement).indeterminate)).toBe(true);
 await group.click();await group.click();await expect(page.getByRole('checkbox',{name:/^Cadastrar imóveis rurais/})).toBeChecked();await all.check();await expect(all).toBeChecked();await all.uncheck();await expect(page.getByRole('checkbox',{name:/^Cadastrar imóveis rurais/})).not.toBeChecked();
 await page.getByLabel('Pesquisar módulo ou permissão').fill('imoveis');await expect(page.getByRole('checkbox',{name:/^Consultar imóveis de clientes/})).toBeVisible();await page.getByLabel('Pesquisar módulo ou permissão').fill('');
 await page.getByRole('button',{name:'Expandir todos',exact:true}).click();await page.getByRole('checkbox',{name:/^Consultar clientes do seu escopo/}).check();await page.getByRole('checkbox',{name:/^Consultar imóveis de clientes/}).check();
 await page.getByRole('button',{name:'Salvar acesso',exact:true}).click();await expect.poll(()=>saved?.permissions.includes('rural.read')).toBe(true);
 await page.reload();await page.getByRole('button',{name:`Editar acesso de ${member.name}`,exact:true}).click();await page.getByRole('button',{name:/^Imóveis rurais .*permissões habilitadas/}).click();await expect(page.getByRole('checkbox',{name:/^Consultar imóveis de clientes/})).toBeChecked();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`/tmp/permissions-${width}.png`,fullPage:true});
});

test('permission draft confirms discard and role restriction is explicit',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await session(page);const data=roster();data.scope={...scope,allowed_permissions:[...assignablePermissions]};await dashboard(page,data);if(data.kind!=='members')throw Error();const member=data.items[2];await page.goto('/equipe');await page.getByRole('button',{name:`Editar acesso de ${member.name}`,exact:true}).click();await page.getByRole('button',{name:'Expandir todos',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:/^Gerenciar categorias/})).toBeDisabled();await page.locator('#member-role').selectOption('admin');await expect(page.getByRole('checkbox',{name:/^Gerenciar categorias/})).toBeEnabled();await expect(page.getByRole('checkbox',{name:/^Gerenciar categorias/})).not.toBeChecked();
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Fechar',exact:true}).click();await expect(page.getByRole('heading',{name:'Editar acesso',exact:true})).toBeVisible();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Fechar',exact:true}).click();await expect(page.getByRole('heading',{name:'Editar acesso',exact:true})).toHaveCount(0);
});
