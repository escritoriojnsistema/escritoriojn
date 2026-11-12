import {test,expect} from '@playwright/test';
for(const width of [320,1440])for(const path of ['/login','/login-cliente','/cadastro','/recuperar-senha?area=client'])test(`34: public keyboard and zoom200 ${path} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:850});await page.goto(path);await expect(page.locator('h1')).toBeVisible();await page.addStyleTag({content:'html{zoom:2}'});
 await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Pular para o conteúdo'})).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#conteudo')).toBeFocused();
 const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,items:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right}))}));expect(overflow.scroll,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.client);
 for(const input of await page.locator('input:not([type=hidden])').all()){await expect(input).toHaveAccessibleName(/.+/);await input.focus();await expect(input).toBeFocused();}
 await expect(page.locator('[role="progressbar"],.loader,.spinner')).toHaveCount(0);
});
