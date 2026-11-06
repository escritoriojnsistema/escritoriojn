export type PortalRequestInput={item_id:string;answers:Record<string,string>};
export type PortalRequestCommand={kind:'save';title:string;message:string;inputs:PortalRequestInput[]}|{kind:'hide'|'resubmit'}|{kind:'remove_file';file_id:string};
export type PortalRequestState={request_id:string;version:number;title:string;message:string;reason:string;can_edit:boolean;can_hide:boolean;can_resubmit:boolean;hidden:boolean;inputs:(PortalRequestInput&{name:string;fields:{key:string;label:string;required:boolean}[]})[]};
