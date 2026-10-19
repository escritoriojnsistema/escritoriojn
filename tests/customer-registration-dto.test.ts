import test from 'node:test';
import assert from 'node:assert/strict';
import { customerDetail, customerPage } from '../server/modules/customers/dto.js';

const entry = { id:'11111111-1111-4111-8111-111111111111', kind:'person', name:'Cliente do portal', identifier_masked:null, created_at:'2026-10-19T10:00:00Z', source:'client_registration', association_status:'pending', identifier:null, contacts:[{kind:'email',value:'portal@example.test'}], version:1, can_update:false, materialized:false };

test('origem pública pendente não transporta associação, identidade ou dados internos extras', () => {
  const detail = customerDetail({...entry, auth_user_id:'secret', candidate_customer_id:'secret', documents:['private'], approved:true});
  assert.deepEqual(detail,entry);
  const page = customerPage({items:[{...entry, documents:['private']}],total:1,page:1,page_size:3});
  assert.deepEqual(Object.keys(page.items[0]).sort(),['association_status','created_at','id','identifier_masked','kind','name','source']);
  assert.ok(!JSON.stringify(page).includes('portal@example.test'));
  for (const invalid of [{...entry,association_status:'approved'},{...entry,source:'trusted'},{...entry,materialized:undefined},{...entry,can_update:true},{...entry,identifier:'52998224725'},{...entry,version:2}]) assert.throws(() => customerDetail(invalid));
  assert.equal(customerDetail({...entry,materialized:true,can_update:true}).can_update,true);
  assert.equal(customerDetail({...entry,kind:'company',materialized:true,can_update:true}).kind,'company');
});
