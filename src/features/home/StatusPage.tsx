import { SiteFooter, SiteHeader } from '../../app/SiteLayout';
import { ApiStatus } from './ApiStatus';
export default function StatusPage() {
  return <div className="public-site"><SiteHeader /><main id="conteudo" className="status-page"><div><p className="eyebrow">Status do sistema</p><h1>Conexão do sistema</h1><p>Confira a disponibilidade da API do Escritório JN.</p></div><ApiStatus /></main><SiteFooter /></div>;
}
