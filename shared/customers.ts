export const customerPermissions = ['customers.read', 'customers.create', 'customers.update', 'customers.read_all'] as const;
export type CustomerKind = 'person' | 'company';
export type CustomerContact = { kind: 'email' | 'phone'; value: string };
export type CustomerInput = { kind: CustomerKind; name: string; identifier: string; contacts: CustomerContact[] };
export type CustomerSummary = { id: string; kind: CustomerKind; name: string; identifier_masked: string | null; created_at: string };
export type CustomerDetail = CustomerSummary & { identifier: string | null; contacts: CustomerContact[]; version: number; can_update: boolean };
export type CustomerPage = { items: CustomerSummary[]; total: number; page: number; page_size: number };
export type CustomerSearch = { office_id: string; query: string; page: number; size: number };
