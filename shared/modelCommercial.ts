import type {TemplateInput} from './templates.js';

/** Folder management is independent from the immutable template versions. */
export interface TemplateFolder { id: string; name: string; revision: number; category: string }
export interface TemplateLocation { template_id: string; folder_id: string | null; revision: number }
export interface TemplateFolderState { folders: TemplateFolder[]; locations: TemplateLocation[]; can_manage: boolean }
export type TemplateFolderCommand =
  | { kind: 'create'; name: string }
  | { kind: 'rename'; folder_id: string; expected_revision: number; name: string }
  | { kind: 'delete'; folder_id: string; expected_revision: number }
  | { kind: 'move'; template_id: string; folder_id: string | null; expected_revision: number };

export interface ModelMetadata { template_id: string; display_name: string; archived_at: string | null; revision: number }
export type ModelMetadataCommand = { kind: 'rename'; name: string } | { kind: 'archive' } | { kind: 'restore' };
export type ModelVersionCommand =
  | { kind: 'edit'; version_id: string; definition: TemplateInput; reason: string; expected_edited_at?: string | null }
  | { kind: 'delete'; version_id: string; reason: string; expected_edited_at?: string | null };

export interface DocumentOfferInput {
  service_id: string; instructions: string; execution_level: 1 | 2 | 3; portal_enabled: boolean;
  intake_keys: string[]; required_intake_keys: string[]; allow_self_approval: boolean;
}
export interface DocumentOffer extends DocumentOfferInput { template_id: string; revision: number }
export interface DocumentOfferField { key: string; label: string; type: 'text' | 'date' | 'money' | 'number' | 'cpf' | 'cnpj' | 'tax_id'; required: boolean }
export interface DocumentPublicOffer {
  template_id: string; template_version_id: string; service_version_id: string; offer_revision: number;
  name: string; template_code: string; folder_id: string | null; folder_name: string | null; folder_category: string | null;
  instructions: string; price_cents: number; service_id: string; service_code: string; service_category: string;
  service_checklist: string[]; variables: DocumentOfferField[];
}
export interface DocumentOffersPage { items: DocumentPublicOffer[]; folders: Array<{ id: string; name: string; category: string }>; total: number; page: number; page_size: number }
export type PresenceStatus = 'available' | 'busy' | 'away';
export interface DocumentPresence { status: PresenceStatus | 'offline'; capacity: number; last_seen: string | null; session_current: boolean }
export interface DocumentBookingInput { template_id: string; template_version_id: string; service_version_id: string; offer_revision: number; origin: 'portal' | 'presencial' | 'whatsapp'; answers: Record<string, string>; customer_id: string | null; assignee_id: string | null }
export interface DocumentBookingResult { request_id: string; protocol: string; status: string; waiting: boolean }
export interface DocumentIntakeView { request_id: string; request_item_id: string; template_version_id: string; model_name: string; answers: Record<string, string> }
export interface ModelCommercialState { metadata: ModelMetadata; offer: DocumentOffer | null; can_manage: boolean; can_manage_metadata: boolean }
export interface DocumentDispatchPage { items: Array<{ id: string; protocol: string; title: string; created_at: string }>; members: Array<{ membership_id: string; name: string; role: 'owner' | 'admin' | 'employee'; status: PresenceStatus | 'offline'; capacity: number; active_load: number }>; total: number; page: number; page_size: number; members_limit: number; members_total: number }
