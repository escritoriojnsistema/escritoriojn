import { useEffect, useState } from 'react';
import { Sparkles, Play } from 'lucide-react';
import type { TemplateVersion } from '../../../shared/templates';
import {
  suggestSmartConfigFromTemplate,
  type SmartFieldCriticality,
  type SmartStepId,
  type SmartTemplateConfig,
} from '../../../shared/smartDocument';
import { smartDocumentsApi } from './api';
import { SmartWizard } from './SmartWizard';

export function SmartConfigEditor({
  office,
  templateId,
  version,
  canManage,
  onDenied,
}: {
  office: string;
  templateId: string;
  version: TemplateVersion;
  canManage: boolean;
  onDenied?: (status: number) => void;
}) {
  const [config, setConfig] = useState<SmartTemplateConfig>(() =>
    suggestSmartConfigFromTemplate(version),
  );
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [testOpen, setTestOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void smartDocumentsApi
      .configGet(office, templateId, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setRevision(res.revision);
        if (res.config) {
          setConfig(res.config);
        } else {
          setConfig(suggestSmartConfigFromTemplate(version));
        }
      })
      .catch(() => {
        // Keep auto-suggested baseline when offline or before initial save
      });
    return () => controller.abort();
  }, [office, templateId, version]);

  async function saveConfig() {
    if (!canManage || busy) return;
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const saved = await smartDocumentsApi.configSave(office, templateId, config, revision);
      setRevision(saved.revision);
      setFeedback('Configuração inteligente salva sem alterar a aprovação legal das cláusulas.');
    } catch (e) {
      const status = e && typeof e === 'object' && 'status' in e ? Number(e.status) : 503;
      if (status === 401 || status === 403) onDenied?.(status);
      setError(e instanceof Error ? e.message : 'Não foi possível salvar a configuração inteligente.');
    } finally {
      setBusy(false);
    }
  }

  function regenerateSuggestions() {
    const suggested = suggestSmartConfigFromTemplate(version);
    setConfig(suggested);
    setFeedback('Sugestões geradas a partir das variáveis e do texto do modelo. O texto jurídico original não foi alterado.');
  }

  return (
    <details className="service-section">
      <summary>Motor inteligente: perguntas iniciais, regras e teste interno</summary>
      <p className="document-hint">
        Configure perguntas iniciais, campos condicionais e lista de anexos para este modelo ({version.approved_at ? 'versão aprovada' : 'rascunho — testável internamente sem publicar no portal'}). Alterar perguntas nunca modifica as cláusulas jurídicas nem aprova o modelo automaticamente.
      </p>

      {feedback && <p role="status" className="form-feedback">{feedback}</p>}
      {error && <p role="alert" className="form-feedback error">{error}</p>}

      <div className="account-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={busy || !canManage}
          onClick={regenerateSuggestions}
        >
          <Sparkles size={16} aria-hidden="true" /> Gerar sugestões a partir das variáveis
        </button>
        <button
          type="button"
          className="team-text-button"
          onClick={() => setTestOpen((v) => !v)}
        >
          <Play size={16} aria-hidden="true" /> {testOpen ? 'Fechar teste funcional' : 'Testar preenchimento (prévia funcional)'}
        </button>
      </div>

      <fieldset className="smart-config-fieldset" disabled={busy || !canManage}>
        <legend>Comportamento do motor</legend>
        <div className="smart-fields-grid">
          <label className="team-field">
            Domínio detectado
            <select
              value={config.domain}
              onChange={(e) =>
                setConfig({
                  ...config,
                  domain: e.target.value as SmartTemplateConfig['domain'],
                })
              }
            >
              <option value="real_estate_sale">Compra e venda / Imóvel urbano</option>
              <option value="rural_property">Imóvel rural (CCIR / CAR / ITR)</option>
              <option value="declaration">Declaração</option>
              <option value="application">Requerimento administrativo</option>
              <option value="official_letter">Ofício</option>
              <option value="general_contract">Contrato geral</option>
            </select>
          </label>
          <div>
            <label className="template-check">
              <input
                type="checkbox"
                checked={config.allow_multiple_sellers}
                onChange={(e) => setConfig({ ...config, allow_multiple_sellers: e.target.checked })}
              />
              Permitir múltiplos vendedores / outorgantes
            </label>
            <label className="template-check">
              <input
                type="checkbox"
                checked={config.allow_multiple_buyers}
                onChange={(e) => setConfig({ ...config, allow_multiple_buyers: e.target.checked })}
              />
              Permitir múltiplos compradores / beneficiários
            </label>
            <label className="template-check">
              <input
                type="checkbox"
                checked={config.enable_marital_agreement}
                onChange={(e) => setConfig({ ...config, enable_marital_agreement: e.target.checked })}
              />
              Ativar concordância de gênero, estado civil e cônjuge
            </label>
          </div>
        </div>

        <h3>Perguntas iniciais ({config.initial_questions.length})</h3>
        {config.initial_questions.map((q, idx) => (
          <div key={q.key} className="smart-party-row smart-config-item">
            <div className="smart-fields-grid">
              <label className="team-field">
                Pergunta #{idx + 1}
                <input
                  value={q.label}
                  maxLength={200}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      initial_questions: config.initial_questions.map((item, i) =>
                        i === idx ? { ...item, label: e.target.value } : item,
                      ),
                    })
                  }
                />
              </label>
              <label className="team-field">
                Criticidade
                <select
                  value={q.criticality}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      initial_questions: config.initial_questions.map((item, i) =>
                        i === idx ? { ...item, criticality: e.target.value as SmartFieldCriticality } : item,
                      ),
                    })
                  }
                >
                  <option value="legal_required">Obrigatória antes da emissão final</option>
                  <option value="recommended">Recomendada (aviso não bloqueante)</option>
                  <option value="optional">Opcional</option>
                </select>
              </label>
            </div>
          </div>
        ))}

        <h3>Campos dinâmicos configurados ({config.fields.length})</h3>
        {config.fields.map((f, idx) => (
          <div key={f.key} className="smart-fields-grid smart-config-field-row">
            <label className="team-field">
              Campo {f.key}
              <input
                value={f.label}
                maxLength={160}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    fields: config.fields.map((item, i) =>
                      i === idx ? { ...item, label: e.target.value } : item,
                    ),
                  })
                }
              />
            </label>
            <label className="team-field">
              Etapa e criticidade
              <select
                value={`${f.step_id}:${f.criticality}`}
                onChange={(e) => {
                  const [step_id, criticality] = e.target.value.split(':') as [
                    Exclude<SmartStepId, 'revisao'>,
                    SmartFieldCriticality,
                  ];
                  setConfig({
                    ...config,
                    fields: config.fields.map((item, i) =>
                      i === idx ? { ...item, step_id, criticality } : item,
                    ),
                  });
                }}
              >
                <option value="objeto:legal_required">Dados do documento · Obrigatório final</option>
                <option value="objeto:recommended">Dados do documento · Recomendado</option>
                <option value="objeto:optional">Dados do documento · Opcional</option>
                <option value="pagamento:legal_required">Pagamento · Obrigatório final</option>
                <option value="pagamento:recommended">Pagamento · Recomendado</option>
                <option value="pagamento:optional">Pagamento · Opcional</option>
              </select>
            </label>
          </div>
        ))}

        {canManage && (
          <button type="button" className="primary-button" disabled={busy} onClick={() => void saveConfig()}>
            Salvar configuração inteligente
          </button>
        )}
      </fieldset>

      {testOpen && (
        <div className="smart-config-test-wrap">
          <SmartWizard
            office={office}
            templateId={templateId}
            templateVersionId={version.id}
            definition={version}
            config={config}
            origin="presencial"
            autoSaveRemote={false}
            submitLabel="Concluir simulação interna"
            onSubmit={() =>
              setFeedback('Teste funcional concluído localmente. Nenhuma solicitação real foi aberta e o status do modelo não foi alterado.')
            }
          />
        </div>
      )}
    </details>
  );
}
