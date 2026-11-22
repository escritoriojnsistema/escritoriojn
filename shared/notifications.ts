export const notificationKinds=['request_returned','request_cancelled','request_deleted','handoff','pending','assignee_changed','account_correction','account_updated','payment_received','payment_refunded','payment_reversed','charge_created','charge_adjusted','charge_cancelled','document_review_pending','document_approved','document_returned','document_rejected','document_withdrawn','smart_submission','conference_done','charge_released','correction_requested','correction_resolved','payment_approval_requested','payment_approval_decided','discount_approval_requested','discount_approval_decided'] as const;
export type NotificationKind=typeof notificationKinds[number];
export type NotificationRead='all'|'unread'|'read';
export type NotificationFilter=NotificationKind|'all';
export type AccountNotice={id:string;kind:NotificationKind;created_at:string;read_at:string|null;can_open:boolean;request_id:string|null;protocol:string|null;attendant_name:string|null;deleted_protocol?:string|null;approval_id?:string|null;approval_summary?:string|null};
export type AccountNotices={items:AccountNotice[];total:number;unread:number;page:number;page_size:number};
