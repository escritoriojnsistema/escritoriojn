import { uuidPattern } from '../../../shared/access';
/** Parsing only; the provider SDK must still verify the supplied session. */
export function invitationSession(query:URLSearchParams,hash:string):{id:string;access_token:string;refresh_token:string}|null {
  const id=query.get('invite');
  if(!id || !uuidPattern.test(id) || query.getAll('invite').length!==1 || query.has('code') || query.has('error'))return null;
  const fragment=new URLSearchParams(hash.replace(/^#/,''));
  if(fragment.has('error') || fragment.getAll('access_token').length!==1 || fragment.getAll('refresh_token').length!==1)return null;
  const access_token=fragment.get('access_token'),refresh_token=fragment.get('refresh_token');
  if(!access_token || !refresh_token || !/^[A-Za-z0-9_.-]{1,8192}$/.test(access_token) || !/^[A-Za-z0-9_.-]{1,8192}$/.test(refresh_token))return null;
  return {id,access_token,refresh_token};
}
