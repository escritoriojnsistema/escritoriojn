import test from 'node:test';import assert from 'node:assert/strict';
import {ruralState,ruralResult} from '../shared/rural.js';
test('27: DTO closes malformed/private results',()=>{const page={items:[],page:1,page_size:5};assert.deepEqual(ruralState({...page,secret:'x',office_id:'private'}),page);assert.throws(()=>ruralState({...page,items:[{}]}));assert.throws(()=>ruralState({...page,items:Array(6).fill({})}));assert.throws(()=>ruralResult({id:'fake'}));});
