import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {emptyService} from '../../shared/services';
import type {Expense,Finance17Page,PaymentReceipt} from '../../shared/expenses';
import type {FinanceStatement} from '../../shared/finance';
test('Etapa17 real: API/SDK despesas, sangria20, recibo confirmado e isolamento',async({request})=>{
 const sdk=createClient(process.env.AUTH_LAB_URL!,process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}),office=process.env.AUTH_LAB_OFFICE!;
 const signed=await sdk.auth.signInWithPassword({email:'manager@example.test',password:process.env.AUTH_LAB_PASSWORD!});expect(signed.error).toBeNull();const headers={Authorization:`Bearer ${signed.data.session!.access_token}`};
 async function post<T>(path:string,body:object,status=200):Promise<T>{const response=await request.post('/api/'+path,{headers,data:{office_id:office,...body}});expect(response.status(),await response.text()).toBe(status);return status===200||status===201?(await response.json()).data as T:undefined as T;}
 try{
  const configure=async(configuration:object)=>(await post<{resource:{id:string}}>('cash/configure',{configuration,idempotency_key:randomUUID()})).resource.id;
  const unit=await configure({kind:'unit',id:null,expected_version:null,name:'Laboratório17',active:true});
  const cash=await configure({kind:'account',id:null,expected_version:null,name:'Espécie17',active:true,unit_id:unit,type:'cash'}),bank=await configure({kind:'account',id:null,expected_version:null,name:'Banco17',active:true,unit_id:unit,type:'bank'});
  const method=await configure({kind:'payment_method',id:null,expected_version:null,name:'Dinheiro17',active:true,unit_id:unit,type:'cash',destination_account_id:cash});
  const opened=await post<{sessions:{id:string;unit_id:string}[]}>('cash/open',{unit_id:unit,cash_account_id:cash,opening_cents:10000,idempotency_key:randomUUID()}),session=opened.sessions.find(s=>s.unit_id===unit)!.id;
  const created=await post<{expense:Expense}>('cash/expense',{operation:{kind:'create',category:'Material',payee:'Fornecedor fictício',description:'Papel de laboratório',due_date:'2026-12-01',amount_cents:2000,evidence:'Comprovante textual fictício conferido',idempotency_key:randomUUID()}});expect(created.expense.status).toBe('pending');
  await post('cash/expense',{operation:{kind:'pay',expense_id:created.expense.id,expected_version:1,session_id:session,expected_session_version:1,account_id:cash,evidence:'Não deve ser aceito sem aprovação',idempotency_key:randomUUID()}},409);
  const approved=await post<{expense:Expense}>('cash/expense',{operation:{kind:'approve',expense_id:created.expense.id,expected_version:1,evidence:'Documento conferido para aprovação',idempotency_key:randomUUID()}});expect(approved.expense.status).toBe('approved');
  const pay={kind:'pay',expense_id:created.expense.id,expected_version:2,session_id:session,expected_session_version:1,account_id:cash,evidence:'Pagamento confirmado em espécie local',idempotency_key:randomUUID()};
  const paid=await post<{expense:Expense}>('cash/expense',{operation:pay});expect(paid.expense.status).toBe('paid');expect(await post('cash/expense',{operation:pay})).toEqual(paid);
  const transfer={kind:'sangria',session_id:session,expected_session_version:2,source_account_id:cash,destination_account_id:bank,amount_cents:2000,reason:'Sangria local de vinte reais',evidence:'Destino fictício conferido',idempotency_key:randomUUID()};
  await post('cash/transfer',{operation:transfer});const statement=await post<FinanceStatement>('cash/statement',{session_id:session,page:1});expect(statement.session).toMatchObject({cash_cents:6000,received_cents:0,version:3});expect(statement.entries.filter(e=>e.kind.startsWith('transfer')).length).toBe(2);
  const page=await post<Finance17Page>('cash/finance17',{session_id:session,page:1});expect(page.expenses[0]).toMatchObject({status:'paid',amount_cents:2000});expect(page.transfers[0]).toMatchObject({kind:'sangria',amount_cents:2000});
  const direct=await sdk.rpc('transfer_operate',{p_office_id:office,p_operation:{...transfer,idempotency_key:randomUUID(),expected_session_version:3,amount_cents:20.5}});expect(direct.error?.code).toBe('PT422');
  const service=await post<{id:string}>('services',{service:{...emptyService,code:'E17-'+randomUUID().slice(0,6).toUpperCase(),name:'Serviço17',category:'Laboratório',price_cents:3000},reason:'Teste inteiramente local'},201);
  const rq=await post<{id:string}>('requests',{idempotency_key:randomUUID(),request:{origin:'presencial',title:'Recibo17 local',customer_id:null,assignee_id:null,priority:'normal',priority_reason:'',internal_note:'',items:[{service_id:service.id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}]}},201);
  const charge=(await post<{charge:{id:string}}>('charges/create',{request_id:rq.id,installments:[{due_date:'2026-12-01',amount_cents:3000}],idempotency_key:randomUUID()})).charge.id;
  const received=await post<FinanceStatement>('cash/payment',{operation:{kind:'record',session_id:session,expected_version:3,idempotency_key:randomUUID(),evidence:'Recebimento confirmado no laboratório',payment_method_id:method,status:'confirmed',allocations:[{charge_id:charge,expected_charge_version:1,amount_cents:3000}],presented_cents:5000,fee_cents:0,settlement:'not_applicable',settled_on:null,external_reference:null}});
  const payment=received.payments!.items[0];const receipt=await post<PaymentReceipt>('cash/receipt',{payment_id:payment.id,idempotency_key:randomUUID()});expect(receipt.snapshot).toMatchObject({amount_cents:3000,payment_reference:payment.reference});expect(typeof receipt.number).toBe('string');expect(await post<PaymentReceipt>('cash/receipt',{payment_id:payment.id,idempotency_key:randomUUID()})).toEqual(receipt);
  const other=await post('cash/receipt',{office_id:randomUUID(),payment_id:payment.id,idempotency_key:randomUUID()},403);expect(other).toBeUndefined();
 }finally{await sdk.auth.signOut();}
});
