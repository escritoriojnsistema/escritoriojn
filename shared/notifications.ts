export type NotificationKind='handoff'|'pending'|'assignee_changed'|'account_correction'|'account_updated';
export type NotificationRead='all'|'unread'|'read';
export type NotificationFilter=NotificationKind|'all';
export type AccountNotice={id:string;kind:NotificationKind;created_at:string;read_at:string|null;can_open:boolean;request_id:string|null;protocol:string|null;attendant_name:string|null};
export type AccountNotices={items:AccountNotice[];total:number;unread:number;page:number;page_size:number};
