export function validPublicConnection(url: string | undefined,key: string | undefined): boolean {
  if (!url || !key) return false;
  try {
    const parsed=new URL(url);
    const local=['127.0.0.1','localhost','[::1]'].includes(parsed.hostname);
    if (parsed.username || parsed.password || parsed.search || parsed.hash
      || (parsed.protocol!=='https:' && !(local && parsed.protocol==='http:'))) return false;
    if (key.startsWith('sb_publishable_')) return true;
    const parts=key.split('.');
    return parts.length===3 && JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';
  } catch { return false; }
}
