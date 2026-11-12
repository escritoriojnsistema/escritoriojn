import {test,expect} from '@playwright/test';
// Hosted checks are anonymous: no fixtures, personal credentials or mutations.
for(const width of [320,1440])for(const [path,heading]of [
 ['/solicitacoes','Área da Equipe'],['/minhas-solicitacoes','Área do Cliente'],
 ['/minhas-configuracoes','Área do Cliente'],['/configuracoes','Área da Equipe'],
 ['/clientes','Área da Equipe'],['/imoveis-rurais','Área da Equipe'],
 ['/servicos','Área da Equipe'],['/pendencias','Área da Equipe'],
])test(`navegação agrupada publicada: ${path} em ${width}`,async({page})=>{
 await page.setViewportSize({width,height:850});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(path);await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
 await expect(page.getByLabel('E-mail',{exact:true})).toBeVisible();await page.reload();await expect(page.getByLabel('Senha',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
