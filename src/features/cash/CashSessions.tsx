import type {CashDashboard} from '../../../shared/cash';
export const cashMoney=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export function CashSessions({data,size}:{data:CashDashboard;size:number}){
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
 return <section className="cash-sessions" aria-label={data.scope==='own'?'Meus caixas':'Caixas consolidados'}>
  <div className="team-section-heading"><h2>{data.scope==='own'?'Meus caixas':'Caixas do escritório'}</h2></div>
  {!data.sessions.length?<p className="team-empty">{data.scope==='own'?'Você ainda não tem um caixa aberto.':'Nenhum caixa neste filtro.'}</p>:<ul className="team-list">{data.sessions.slice(0,size).map(s=><li className="cash-session" key={s.id}>
   <div className="cash-session-heading"><strong>{s.unit_name}</strong><span>{s.status==='open'?'Aberto':'Fechado'}</span></div>
   <p className="customer-note">{s.is_self?'Minha operação':s.operator_name} · {s.account_name} · {new Date(s.opened_at).toLocaleString('pt-BR',{timeZone:zone})} ({zone})</p>
   <dl className="cash-totals"><div><dt>Fundo inicial</dt><dd>{cashMoney(s.opening_cents)}</dd></div><div><dt>Dinheiro em espécie</dt><dd>{cashMoney(s.numerario_cents)}</dd></div><div><dt>Recebido em serviços</dt><dd>{cashMoney(s.received_cents)}</dd></div></dl>
  </li>)}</ul>}
 </section>;
}
