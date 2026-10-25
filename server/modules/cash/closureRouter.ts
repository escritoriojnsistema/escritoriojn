import {Router,json,type Response} from 'express';
import {validClosureOperation} from '../../../shared/closures.js';
import {fields,uuid} from '../team/validation.js';
import {positive} from '../requests/validation.js';
import {errorResponse} from '../../errors.js';
import {closureState,closureRecord,closureResult} from './closureDto.js';
type Rpc=(res:Response,name:string,args:Record<string,unknown>,dto:(x:unknown)=>unknown)=>Promise<void>;
export function makeClosureRouter(rpc:Rpc){
 const router=Router();router.use(json({limit:'32kb'}));
 const invalid=(res:Response)=>errorResponse(res,422,'CASH_VALIDATION','Confira a conferência, a justificativa e o estado do caixa.');
 router.post('/state',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','session_id','page','source_page'])||!uuid(b.office_id)||!uuid(b.session_id)||!positive(b.page,100000)||!positive(b.source_page,100000)){invalid(res);return;}await rpc(res,'closure_state',{p_office_id:b.office_id,p_session_id:b.session_id,p_page:b.page,p_source_page:b.source_page},closureState);});
 router.post('/record',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','record_id'])||!uuid(b.office_id)||!uuid(b.record_id)){invalid(res);return;}await rpc(res,'closure_record',{p_office_id:b.office_id,p_record_id:b.record_id},closureRecord);});
 router.post('/operate',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','operation'])||!uuid(b.office_id)||!validClosureOperation(b.operation)){invalid(res);return;}await rpc(res,'closure_operate',{p_office_id:b.office_id,p_operation:b.operation},closureResult);});
 return router;
}
