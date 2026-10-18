import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { paths } from '../../app/routes';
import { supabase } from './browser';
import { callbackFailure } from './callbackFailure';
import { invitationSession } from './invitationCallback';
import { uuidPattern } from '../../../shared/access';
import { AccessShell } from '../access/AccessShell';
export default function CallbackPage() {
  const navigate = useNavigate();
  const [failure, setFailure] = useState('');
  const [area] = useState(() => new URLSearchParams(window.location.search).get('area') === 'team' ? 'team' : 'client');
  const [invite] = useState(() => { const id=new URLSearchParams(window.location.search).get('invite'); return id && uuidPattern.test(id)?id:null; });
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const code = query.get('code');
    const flowId = query.get('sb_flow_id') ?? undefined;
    const hash = window.location.hash;
    const fragment = new URLSearchParams(hash.slice(1));
    // Secrets/codes never remain in history, logs, links or referrers.
    window.history.replaceState(null, '', paths.callback);
    if (query.has('error') || fragment.has('error')) {
      setFailure(callbackFailure({ code: query.get('error_code') ?? fragment.get('error_code') })); return;
    }
    const invitation=invitationSession(query,hash);
    if(invitation) {
      if(!supabase) {setFailure(callbackFailure({status:503}));return;}
      let active=true;
      // setSession uses the official SDK and provider identity verification. Neither
      // the URL area nor fragment type grants an office, role or permission.
      void supabase.auth.setSession({access_token:invitation.access_token,refresh_token:invitation.refresh_token}).then(({data,error})=>{
        if(!active)return;
        if(error || !data.session) {setFailure(callbackFailure(error));return;}
        navigate(`${paths.invitation}?id=${encodeURIComponent(invitation.id)}`,{replace:true});
      }).catch(error=>{if(active)setFailure(callbackFailure(error));});
      return ()=>{active=false;};
    }
    if (!code || code.length > 2048 || hash) { setFailure(callbackFailure(null)); return; }
    if (!supabase) { setFailure(callbackFailure({ status: 503 })); return; }
    let active = true;
    let recovering = false;
    const { data: listener } = supabase.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') recovering = true; });
    void supabase.auth.exchangeCodeForSession(code, { flowId }).then(({ data, error }) => {
      listener.subscription.unsubscribe();
      if (!active) return;
      if (error || !data.session) { setFailure(callbackFailure(error)); return; }
      navigate(recovering ? `${paths.reset}?area=${area}` : paths.authenticated, { replace: true });
    }).catch(error => { listener.subscription.unsubscribe(); if (active) setFailure(callbackFailure(error)); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [navigate, area]);
  return <AccessShell title={failure ? 'Confira seu link' : 'Acesso ao escritório'}>{failure ? <><p className="form-feedback error" role="alert">{failure}</p><Link className="primary-button" to={invite?`${paths.invitation}?id=${encodeURIComponent(invite)}`:`${paths.recovery}?area=${area}`}><ArrowRight size={18} aria-hidden="true" />{invite?'Voltar ao convite':'Solicitar novo link'}</Link></> : null}</AccessShell>;
}
