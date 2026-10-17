import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { paths } from '../../app/routes';
import { supabase } from './browser';
import { AccessShell } from '../access/AccessShell';
export default function CallbackPage() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const code = query.get('code');
    const flowId = query.get('sb_flow_id') ?? undefined;
    // Secrets/codes never remain in history, logs, links or referrers.
    window.history.replaceState(null, '', paths.callback);
    if (!supabase || !code || code.length > 2048 || query.has('error') || window.location.hash) { setFailed(true); return; }
    let recovering = false;
    const { data: listener } = supabase.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') recovering = true; });
    void supabase.auth.exchangeCodeForSession(code, { flowId }).then(({ data, error }) => {
      listener.subscription.unsubscribe();
      if (error || !data.session) { setFailed(true); return; }
      navigate(recovering ? `${paths.reset}?area=${query.get('area') === 'team' ? 'team' : 'client'}` : paths.authenticated, { replace: true });
    }).catch(() => { listener.subscription.unsubscribe(); setFailed(true); });
    return () => listener.subscription.unsubscribe();
  }, [navigate]);
  return <AccessShell title={failed ? 'Confira seu link' : 'Confirmando acesso'}>{failed ? <><p className="form-feedback error" role="alert">Link inválido ou expirado. Solicite outro link e abra neste mesmo navegador.</p><Link className="primary-button" to={paths.recovery}>Solicitar novo link</Link></> : <p role="status">Aguarde a confirmação do seu acesso…</p>}</AccessShell>;
}
