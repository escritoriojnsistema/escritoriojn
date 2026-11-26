import { createClient } from '@supabase/supabase-js';
import type { Request, Response } from 'express';
import { uuidPattern } from '../../../shared/access.js';
import { validPublicConnection } from '../../../shared/connection.js';
import { errorResponse } from '../../errors.js';

const providerOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
    ...init, signal: AbortSignal.any([AbortSignal.timeout(3500), ...(init?.signal ? [init.signal] : [])]),
  }) },
};

export async function teamLoginGuidance(req: Request, res: Response) {
  const body = req.body;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const invitation = body?.invitation_id;
  const password = body?.password;
  const linkProof = typeof invitation === 'string' && uuidPattern.test(invitation) && password === undefined;
  const passwordProof = typeof password === 'string' && password.length > 0 && password.length <= 128 && invitation === undefined;

  if (Object.keys(req.query).length || !body || Object.keys(body).length !== 2 || email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (!linkProof && !passwordProof)) {
    errorResponse(res, 422, 'VALIDATION_ERROR', 'Solicitação de acesso inválida.');
    return;
  }
  const reply = (guidance: string) => res.json({ guidance });
  const url = process.env.VITE_SUPABASE_URL;
  const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!validPublicConnection(url, publicKey) || !serviceKey) {
    reply('unavailable');
    return;
  }
  try {
    if (passwordProof) {
      const provider = createClient(url!, publicKey!, providerOptions);
      try {
        const { data, error } = await provider.auth.signInWithPassword({ email, password });
        if (data.session) await provider.auth.signOut({ scope: 'local' });
        if (error?.code !== 'email_not_confirmed') {
          reply('unavailable');
          return;
        }
      } finally {
        await provider.auth.dispose();
      }
    }
    const service = createClient(url!, serviceKey, providerOptions);
    try {
      const { data } = await service.rpc('team_login_guidance', { p_email: email, p_invitation_id: linkProof ? invitation : null });
      reply(data === 'invitation_expired' || data === 'confirm_email' || data === 'invitation_required' ? data : 'unavailable');
    } finally {
      await service.auth.dispose();
    }
  } catch {
    if (!res.headersSent) reply('unavailable');
  }
}
