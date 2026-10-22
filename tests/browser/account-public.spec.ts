import {test,expect} from '@playwright/test';
test('conta público: edição e propostas exigem sessão e não usam cache compartilhado',async({request})=>{
 for(const action of ['read','save','corrections','apply']){
  const response=await request.post(`/api/account/${action}`,{data:{}});
  expect(response.status()).toBe(401);expect((await response.json()).error.code).toBe('AUTH_REQUIRED');expect(response.headers()['cache-control']).toContain('no-store');
 }
});
