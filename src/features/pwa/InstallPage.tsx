import {useEffect,useState} from 'react';
import {SiteHeader,SiteFooter} from '../../app/SiteLayout';
import './pwa.css';
interface InstallPrompt extends Event { prompt():Promise<void>; userChoice:Promise<{outcome:'accepted'|'dismissed'}> }
export default function InstallPage(){
 const [prompt,setPrompt]=useState<InstallPrompt|null>(null);
 const [installed,setInstalled]=useState(()=>window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator&{standalone?:boolean}).standalone===true);
 const [error,setError]=useState('');
 const [device,setDevice]=useState(()=>/iPhone|iPad|iPod/i.test(navigator.userAgent)?'ios':/Android/i.test(navigator.userAgent)?'android':'desktop');
 useEffect(()=>{
  const available=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPrompt);};
  const complete=()=>{setInstalled(true);setPrompt(null);};
  window.addEventListener('beforeinstallprompt',available);window.addEventListener('appinstalled',complete);
  return()=>{window.removeEventListener('beforeinstallprompt',available);window.removeEventListener('appinstalled',complete);};
 },[]);
 async function install(){const current=prompt;if(!current)return;setPrompt(null);setError('');try{await current.prompt();await current.userChoice;}catch{setError('Use o menu do navegador e siga as instruções abaixo.');}}
 return <div className="public-site pwa-shell"><SiteHeader/><main id="conteudo" className="pwa-main"><header><p className="eyebrow">Escritório JN</p><h1>Instalar aplicativo</h1><p>Acesse pelo ícone na sua tela inicial, com a mesma conta e proteção.</p></header>
 <div className="pwa-sections"><section aria-labelledby="pwa-device"><h2 id="pwa-device">No seu dispositivo</h2>
 <div className="pwa-device"><label htmlFor="pwa-device-select">Dispositivo</label><select id="pwa-device-select" value={device} onChange={event=>setDevice(event.target.value)}><option value="android">Android · Chrome</option><option value="ios">iPhone · Safari</option><option value="desktop">Computador · Chrome / Edge</option></select></div>
 {installed?<p role="status">O aplicativo já está aberto no modo instalado.</p>:prompt&&<button className="button button-primary" onClick={()=>void install()}>Instalar neste dispositivo</button>}
 {error&&<p role="alert">{error}</p>}
 {device==='android'?<><h3>Android · Chrome</h3><p>No menu ⋮, escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong> e confirme. Se disponível, você também pode usar o botão de instalação desta página.</p></>:device==='ios'?<><h3>iPhone · Safari</h3><p>Abra este endereço no Safari, toque em <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong>. Ative <strong>Abrir como App</strong>, se disponível, e confirme em <strong>Adicionar</strong>.</p></>:<><h3>Computador</h3><p>No Chrome ou Edge compatível, use o ícone de instalação na barra de endereço ou a opção de instalar no menu.</p></>}
 <p>Com internet e endereço seguro (HTTPS), instale e depois feche e reabra pelo ícone.</p></section>
 <section aria-labelledby="pwa-safety"><h2 id="pwa-safety">Conexão e atualizações</h2><ul><li>Sem internet, só há orientação pública. Clientes, documentos, relatórios e caixa não ficam disponíveis offline.</li><li>Para atualizar, conclua as operações pendentes, feche todas as abas e janelas e reabra. Não recarregamos operações em andamento.</li><li>A instalação não substitui o login: sair ou trocar de conta exige nova verificação de acesso.</li><li>Arquivos baixados por você permanecem no dispositivo.</li></ul></section></div>
 </main><SiteFooter/></div>;
}
