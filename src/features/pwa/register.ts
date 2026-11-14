/** Registration never blocks routing, reloads tabs, or persists private state. */
export function registerPwa() {
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  const register = () => { void navigator.serviceWorker.register('/sw.js', {scope:'/', updateViaCache:'none'}).catch(() => {
    // Installation is optional: a failed registration must not affect operations.
  }); };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, {once:true});
}
