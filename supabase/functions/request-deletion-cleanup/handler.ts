import { createClient } from '@supabase/supabase-js';

export interface CleanupStorageObject {
  file_id: string;
  bucket: string;
  object_path: string;
}

export interface ClaimedDeletionOperation {
  operation_id: string;
  office_id: string;
  request_id: string;
  protocol: string;
  objects: CleanupStorageObject[];
}

export interface CleanupAdminClient {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => Promise<{ data: unknown; error: { message?: string } | null }>;
    };
  };
}

export interface CleanupCallerClient {
  auth: {
    getUser: (token: string) => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
}

export interface RequestDeletionCleanupConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  cronSecret?: string;
  createAdminClient?: () => CleanupAdminClient;
  createCallerClient?: (token: string) => CleanupCallerClient;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_BUCKET = 'request-attachments';
const SAFE_STORAGE_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._/-]{1,240}$/i;

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}

/** Constant-time string comparison using UTF-8 byte XOR (works in both Deno and Node). */
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length || ab.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i += 1) {
    diff |= ab[i] ^ bb[i];
  }
  return diff === 0;
}

export function isSafeCleanupObject(item: unknown): item is CleanupStorageObject {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const o = item as Record<string, unknown>;
  return (
    typeof o.file_id === 'string' &&
    UUID_RE.test(o.file_id) &&
    o.bucket === ALLOWED_BUCKET &&
    typeof o.object_path === 'string' &&
    !o.object_path.includes('..') &&
    SAFE_STORAGE_PATH_RE.test(o.object_path)
  );
}

export function createRequestDeletionCleanupHandler(config: RequestDeletionCleanupConfig) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') {
      return jsonResponse(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' } });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const bearer = /^Bearer ([A-Za-z0-9_.-]{1,8192})$/i.exec(authHeader)?.[1];
    if (!bearer) {
      return jsonResponse(401, { error: { code: 'AUTH_REQUIRED', message: 'Autenticação obrigatória.' } });
    }

    const hasCronAuth = Boolean(
      config.cronSecret && config.cronSecret.trim().length >= 16 && constantTimeEqual(bearer, config.cronSecret.trim()),
    );

    if (!hasCronAuth) {
      if (!config.url || !config.anonKey) {
        return jsonResponse(503, { error: { code: 'CLEANUP_UNAVAILABLE', message: 'Serviço indisponível.' } });
      }
      const caller = config.createCallerClient
        ? config.createCallerClient(bearer)
        : (createClient(config.url, config.anonKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            global: { headers: { Authorization: `Bearer ${bearer}` } },
          }) as unknown as CleanupCallerClient);
      const { data, error } = await caller.auth.getUser(bearer);
      if (error || !data.user) {
        return jsonResponse(401, { error: { code: 'AUTH_REQUIRED', message: 'Sessão inválida.' } });
      }
    }

    if (!config.createAdminClient && (!config.url || !config.serviceRoleKey)) {
      return jsonResponse(503, { error: { code: 'CLEANUP_UNAVAILABLE', message: 'Serviço indisponível.' } });
    }

    let officeId: string | null = null;
    let operationId: string | null = null;
    const rawText = await req.text();
    if (rawText.trim().length > 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return jsonResponse(422, { error: { code: 'CLEANUP_VALIDATION', message: 'JSON inválido.' } });
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return jsonResponse(422, { error: { code: 'CLEANUP_VALIDATION', message: 'Parâmetros inválidos.' } });
      }
      const body = parsed as Record<string, unknown>;
      if (body.office_id !== undefined && body.office_id !== null) {
        if (typeof body.office_id !== 'string' || !UUID_RE.test(body.office_id)) {
          return jsonResponse(422, { error: { code: 'CLEANUP_VALIDATION', message: 'office_id inválido.' } });
        }
        officeId = body.office_id;
      }
      if (body.operation_id !== undefined && body.operation_id !== null) {
        if (typeof body.operation_id !== 'string' || !UUID_RE.test(body.operation_id)) {
          return jsonResponse(422, { error: { code: 'CLEANUP_VALIDATION', message: 'operation_id inválido.' } });
        }
        operationId = body.operation_id;
      }
    }

    const admin = config.createAdminClient
      ? config.createAdminClient()
      : (createClient(config.url, config.serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        }) as unknown as CleanupAdminClient);

    const claimed = await admin.rpc('request_deletion_claim_cleanup', {
      p_office_id: officeId,
      p_operation_id: operationId,
    });
    if (claimed.error) {
      return jsonResponse(503, { error: { code: 'CLEANUP_CLAIM_FAILED', message: 'Não foi possível consultar pendências.' } });
    }

    const operations = Array.isArray(claimed.data) ? (claimed.data as ClaimedDeletionOperation[]) : [];
    const results: unknown[] = [];

    for (const op of operations) {
      const objects = Array.isArray(op.objects) ? op.objects : [];
      const removedIds: string[] = [];
      let failedCount = 0;
      let lastErrorCode: string | null = null;

      for (const obj of objects) {
        if (!isSafeCleanupObject(obj)) {
          failedCount += 1;
          lastErrorCode = 'INVALID_STORAGE_OBJECT_REF';
          continue;
        }
        try {
          const { error: rmError } = await admin.storage.from(obj.bucket).remove([obj.object_path]);
          if (rmError) {
            failedCount += 1;
            lastErrorCode = 'STORAGE_REMOVE_FAILED';
          } else {
            removedIds.push(obj.file_id);
          }
        } catch {
          failedCount += 1;
          lastErrorCode = 'STORAGE_TRANSPORT_ERROR';
        }
      }

      const completed = await admin.rpc('request_deletion_complete_cleanup', {
        p_operation_id: op.operation_id,
        p_removed_file_ids: removedIds,
        p_failed_count: failedCount,
        p_error_code: lastErrorCode,
      });

      results.push({
        operation_id: op.operation_id,
        removed_count: removedIds.length,
        failed_count: failedCount,
        result: completed.error ? { status: 'storage_cleanup_failed' } : completed.data,
      });
    }

    return jsonResponse(200, {
      data: {
        processed_operations: operations.length,
        results,
      },
    });
  };
}
