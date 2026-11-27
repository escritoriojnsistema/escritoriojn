import { useState } from 'react';
import {
  templateKinds,
  isCustomTemplateKey,
  signaturePolicies,
  variableTypeLabels,
  type TemplateDetail as Detail,
} from '../../../shared/templates';
import { formatDocumentsCount } from '../documents/documentsListModel';

const date = (v: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR') : 'Não definido';

export function TemplateDetail({
  data,
  selectedNumber,
  onSelected,
  busy,
  locked,
  conflict,
  canApprove,
  onApprove,
}: {
  data: Detail;
  selectedNumber?: number;
  onSelected?: (number: number) => void;
  busy: boolean;
  locked: boolean;
  conflict: boolean;
  canApprove: boolean;
  onApprove: (version: string, reason: string) => void;
}) {
  const [selected, setSelected] = useState('');
  const [reason, setReason] = useState('');
  const v =
    data.versions.find(x => x.number === selectedNumber) ??
    data.versions.find(x => x.id === selected) ??
    data.versions[0];

  if (!v) {
    return (
      <div className="documents-empty-card">
        <p className="team-empty">Nenhuma versão disponível para consulta.</p>
      </div>
    );
  }

  return (
    <section className="template-detail documents-detail-card" aria-label="Detalhe do modelo">
      {v.demonstration && (
        <p className="template-demo">Demonstração sem validade operacional</p>
      )}
      <div className="template-version-line">
        <label className="team-field">
          Versão consultada
          <select
            value={v.id}
            disabled={busy || locked}
            onChange={e => {
              setSelected(e.target.value);
              const next = data.versions.find(x => x.id === e.target.value);
              if (next) onSelected?.(next.number);
              setReason('');
            }}
          >
            {data.versions.map(x => (
              <option key={x.id} value={x.id}>
                v{x.number} · {x.approved_at ? 'Aprovada' : 'Rascunho'} · {x.name}
              </option>
            ))}
          </select>
        </label>
        <span className={`template-status${v.approved_at ? ' is-approved' : ''}`}>
          {v.approved_at ? 'Aprovado' : 'Rascunho'}
        </span>
      </div>
      <p className="customer-note">
        {templateKinds[v.kind]} · {data.code} · Autor: {v.created_by_name} ·{' '}
        {date(v.created_at)}
      </p>
      {v.created_by === null && (
        <p className="customer-note">
          Importação técnica não substitui revisão e aprovação humana desta versão.
        </p>
      )}
      {v.edited_at && (
        <p className="customer-note">
          Conteúdo editado nesta mesma versão em {date(v.edited_at)}. O texto anterior
          permanece na auditoria e a aprovação já registrada não foi alterada.
        </p>
      )}
      <pre className="template-literal" aria-label="Texto preservado da versão">
        {v.content}
      </pre>
      <details className="template-section">
        <summary>Variáveis e políticas ({v.variables.length})</summary>
        <dl className="template-facts">
          <div>
            <dt>Assinatura</dt>
            <dd>{signaturePolicies[v.signature_policy]}</dd>
          </div>
          <div>
            <dt>Revisão do documento</dt>
            <dd>{v.review_required ? 'Obrigatória' : 'Dispensada pela política'}</dd>
          </div>
          <div>
            <dt>Início</dt>
            <dd>{v.effective_from ? date(v.effective_from) : 'A partir da aprovação'}</dd>
          </div>
          <div>
            <dt>Fim</dt>
            <dd>{v.effective_until ? date(v.effective_until) : 'Sem término definido'}</dd>
          </div>
        </dl>
        <ul className="template-variables-list">
          {v.variables.map(x => (
            <li key={x.key}>
              <code>{`{{${x.key}}}`}</code> · {x.label} · {variableTypeLabels[x.type]}
              {isCustomTemplateKey(x.key) ? ' · Preenchimento manual' : ''} ·{' '}
              {x.required ? 'Obrigatória' : 'Opcional'}
            </li>
          ))}
        </ul>
      </details>
      <details className="template-section">
        <summary>
          Histórico e autoria (
          {formatDocumentsCount(
            data.history_total,
            'versão preservada',
            'versões preservadas',
          )}
          )
        </summary>
        <p className="customer-note">Motivo: {v.reason}</p>
        <p className="customer-note">
          {v.approved_at
            ? `Aprovado por ${v.approved_by_name} em ${date(v.approved_at)}. ${v.approval_reason}`
            : 'Esta versão ainda não foi aprovada.'}
        </p>
        <p className="customer-note">
          Edições feitas nesta mesma versão guardam o texto anterior na auditoria; novas
          versões continuam preservando todo o histórico.
        </p>
      </details>
      {!v.approved_at && canApprove && v.number === data.latest_version && (
        <form
          className="template-approval"
          onSubmit={e => {
            e.preventDefault();
            if (reason.trim()) onApprove(v.id, reason.trim());
          }}
        >
          <fieldset disabled={busy || locked}>
            <label className="team-field">
              Motivo da aprovação
              <input
                required
                maxLength={500}
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </label>
            <p className="customer-note">
              Aprova somente o conteúdo da versão {v.number}. Confirme sua revisão humana
              antes de prosseguir.
              {v.demonstration ? ' Este modelo permanece demonstração.' : ''}
            </p>
          </fieldset>
          <button className="primary-button" disabled={busy || conflict}>
            Aprovar versão
          </button>
        </form>
      )}
    </section>
  );
}
