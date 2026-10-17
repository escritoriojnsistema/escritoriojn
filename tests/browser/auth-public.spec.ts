import { test,expect } from '@playwright/test';
test('cadastro publico tem apenas campos de cliente e senha pode ser conferida',async({page})=>{
  await page.goto('/cadastro');
  await expect(page.getByRole('heading',{name:'Crie sua conta'})).toBeVisible();
  await expect(page.getByLabel('Nome', {exact:true})).toBeVisible();
  await expect(page.getByLabel('E-mail',{exact:true})).toHaveAttribute('autocomplete','email');
  await expect(page.getByLabel('Senha',{exact:true})).toHaveAttribute('autocomplete','new-password');
  await expect(page.locator('[name="role"], [name="office_id"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Mostrar senha',exact:true}).click();
  await expect(page.getByLabel('Senha',{exact:true})).toHaveAttribute('type','text');
});
test('painel direto exige sessao e callback sem codigo nao segue redirect externo',async({page})=>{
  await page.goto('/painel');
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await page.goto('/auth/callback?next=https://example.org');
  await expect(page.getByRole('alert')).toContainText('Link inválido ou expirado');
  expect(new URL(page.url()).hostname).not.toBe('example.org');
});
