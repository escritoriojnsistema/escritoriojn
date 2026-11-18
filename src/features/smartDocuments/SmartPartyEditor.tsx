import { Plus, Trash2 } from 'lucide-react';
import { digitsOnly, formatCnpj, formatCpf } from '../../../shared/identifiers';
import {
  genderLabels,
  maritalStatusLabels,
  propertyRegimeLabels,
  type DeclaredGender,
  type MaritalStatus,
  type PropertyRegime,
  type SmartPartyRecord,
} from '../../../shared/smartDocument';
import { formatPartyQualificationPTBR, regimeRequiresOutorga } from '../../../shared/smartDocumentRender';

const roleLabels: Record<SmartPartyRecord['role'], string> = {
  seller: 'Vendedor / Outorgante',
  buyer: 'Comprador / Adquirente',
  representative: 'Representante legal / Procurador',
  guardian: 'Responsável legal',
  other: 'Outro interveniente',
};

export function createEmptyParty(role: SmartPartyRecord['role'] = 'buyer'): SmartPartyRecord {
  return {
    id: crypto.randomUUID(),
    role,
    entity_type: 'person',
    gender: 'masculine',
    full_name: '',
    tax_id: '',
    rg: '',
    nationality: 'brasileiro(a)',
    profession: '',
    address: '',
    marital_status: 'solteiro',
    property_regime: 'comunhao_parcial',
    has_spouse: false,
    spouse: {
      full_name: '',
      cpf: '',
      gender: 'feminine',
    },
  };
}

export function SmartPartyEditor({
  parties,
  allowMultipleSellers,
  allowMultipleBuyers,
  enableMarital,
  disabled,
  pendingKeys,
  onChange,
}: {
  parties: SmartPartyRecord[];
  allowMultipleSellers: boolean;
  allowMultipleBuyers: boolean;
  enableMarital: boolean;
  disabled?: boolean;
  pendingKeys: Set<string>;
  onChange: (next: SmartPartyRecord[]) => void;
}) {
  function updateParty(id: string, patch: Partial<SmartPartyRecord>) {
    onChange(parties.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removeParty(id: string) {
    onChange(parties.filter((p) => p.id !== id));
  }

  function addParty(role: SmartPartyRecord['role']) {
    if (parties.length >= 20) return;
    onChange([...parties, createEmptyParty(role)]);
  }

  const sellerCount = parties.filter((p) => p.role === 'seller').length;
  const buyerCount = parties.filter((p) => p.role === 'buyer').length;

  return (
    <div className="smart-party-list">
      <div className="account-actions">
        {(sellerCount === 0 || allowMultipleSellers) && sellerCount < 10 && (
          <button
            type="button"
            className="secondary-button"
            disabled={disabled}
            onClick={() => addParty('seller')}
          >
            <Plus size={16} aria-hidden="true" /> Adicionar vendedor / outorgante
          </button>
        )}
        {(buyerCount === 0 || allowMultipleBuyers) && buyerCount < 10 && (
          <button
            type="button"
            className="secondary-button"
            disabled={disabled}
            onClick={() => addParty('buyer')}
          >
            <Plus size={16} aria-hidden="true" /> Adicionar comprador / adquirente
          </button>
        )}
        <button
          type="button"
          className="team-text-button"
          disabled={disabled || parties.length >= 20}
          onClick={() => addParty('representative')}
        >
          <Plus size={16} aria-hidden="true" /> Adicionar representante / interveniente
        </button>
      </div>

      {parties.length === 0 && (
        <p className="team-empty">
          Nenhuma parte informada ainda. Adicione ao menos um comprador ou vendedor para gerar a qualificação automática.
        </p>
      )}

      {parties.map((party, index) => {
        const sameRoleList = parties.filter((p) => p.role === party.role);
        const indexInRole = sameRoleList.findIndex((p) => p.id === party.id);
        const isPerson = party.entity_type === 'person';
        const showSpouse =
          enableMarital &&
          isPerson &&
          (party.marital_status === 'casado' || party.marital_status === 'uniao_estavel' || party.has_spouse);

        return (
          <article className="smart-party-row" key={party.id}>
            <div className="smart-party-row-header">
              <strong>
                {roleLabels[party.role]} #{indexInRole + 1} (Item {index + 1})
              </strong>
              <button
                type="button"
                className="team-text-button"
                disabled={disabled}
                aria-label={`Remover ${roleLabels[party.role]} ${indexInRole + 1}`}
                onClick={() => removeParty(party.id)}
              >
                <Trash2 size={16} aria-hidden="true" /> Remover
              </button>
            </div>

            <div className="smart-fields-grid">
              <label className="team-field">
                Papel no documento
                <select
                  value={party.role}
                  disabled={disabled}
                  onChange={(e) => updateParty(party.id, { role: e.target.value as SmartPartyRecord['role'] })}
                >
                  {Object.entries(roleLabels).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </label>

              <label className="team-field">
                Tipo de pessoa
                <select
                  value={party.entity_type}
                  disabled={disabled}
                  onChange={(e) => {
                    const nextType = e.target.value as 'person' | 'company';
                    updateParty(party.id, {
                      entity_type: nextType,
                      gender: nextType === 'company' ? 'entity' : party.gender === 'entity' ? 'masculine' : party.gender,
                    });
                  }}
                >
                  <option value="person">Pessoa Física (PF)</option>
                  <option value="company">Pessoa Jurídica (PJ)</option>
                </select>
              </label>

              {isPerson && (
                <label className="team-field">
                  Concordância declarada (gênero gramatical)
                  <select
                    value={party.gender === 'entity' ? 'masculine' : party.gender}
                    disabled={disabled}
                    onChange={(e) => updateParty(party.id, { gender: e.target.value as DeclaredGender })}
                  >
                    <option value="masculine">{genderLabels.masculine}</option>
                    <option value="feminine">{genderLabels.feminine}</option>
                    <option value="neutral">{genderLabels.neutral}</option>
                  </select>
                </label>
              )}

              <label className={`team-field${pendingKeys.has(`party.${party.id}.full_name`) ? ' smart-field-pending' : ''}`}>
                {isPerson ? 'Nome completo *' : 'Razão social *'}
                <input
                  value={party.full_name}
                  disabled={disabled}
                  maxLength={120}
                  onChange={(e) => updateParty(party.id, { full_name: e.target.value })}
                />
              </label>

              <label className={`team-field${pendingKeys.has(`party.${party.id}.tax_id`) ? ' smart-field-pending' : ''}`}>
                {isPerson ? 'CPF *' : 'CNPJ *'}
                <input
                  inputMode="numeric"
                  maxLength={isPerson ? 14 : 18}
                  value={
                    isPerson
                      ? formatCpf(digitsOnly(party.tax_id))
                      : formatCnpj(digitsOnly(party.tax_id))
                  }
                  disabled={disabled}
                  onChange={(e) => updateParty(party.id, { tax_id: digitsOnly(e.target.value) })}
                />
              </label>

              {isPerson && (
                <>
                  <label className="team-field">
                    RG / Órgão emissor
                    <input
                      value={party.rg ?? ''}
                      disabled={disabled}
                      maxLength={40}
                      onChange={(e) => updateParty(party.id, { rg: e.target.value })}
                    />
                  </label>

                  <label className="team-field">
                    Nacionalidade
                    <input
                      value={party.nationality ?? ''}
                      disabled={disabled}
                      maxLength={60}
                      onChange={(e) => updateParty(party.id, { nationality: e.target.value })}
                    />
                  </label>

                  <label className="team-field">
                    Profissão
                    <input
                      value={party.profession ?? ''}
                      disabled={disabled}
                      maxLength={80}
                      onChange={(e) => updateParty(party.id, { profession: e.target.value })}
                    />
                  </label>

                  {enableMarital && (
                    <label className="team-field">
                      Estado civil *
                      <select
                        value={party.marital_status ?? 'solteiro'}
                        disabled={disabled}
                        onChange={(e) => {
                          const ms = e.target.value as MaritalStatus;
                          updateParty(party.id, {
                            marital_status: ms,
                            has_spouse: ms === 'casado' || ms === 'uniao_estavel',
                          });
                        }}
                      >
                        {Object.entries(maritalStatusLabels).map(([k, lbl]) => (
                          <option key={k} value={k}>
                            {lbl}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}

              {!isPerson && (
                <>
                  <label className={`team-field${pendingKeys.has(`party.${party.id}.legal_representative_name`) ? ' smart-field-pending' : ''}`}>
                    Nome do representante legal *
                    <input
                      value={party.legal_representative_name ?? ''}
                      disabled={disabled}
                      maxLength={120}
                      onChange={(e) => updateParty(party.id, { legal_representative_name: e.target.value })}
                    />
                  </label>
                  <label className="team-field">
                    Cargo do representante
                    <input
                      value={party.legal_representative_role ?? ''}
                      disabled={disabled}
                      placeholder="Ex.: Sócio-administrador / Procurador"
                      maxLength={80}
                      onChange={(e) => updateParty(party.id, { legal_representative_role: e.target.value })}
                    />
                  </label>
                  <label className="team-field">
                    CPF do representante legal
                    <input
                      inputMode="numeric"
                      maxLength={14}
                      value={formatCpf(digitsOnly(party.legal_representative_cpf ?? ''))}
                      disabled={disabled}
                      onChange={(e) => updateParty(party.id, { legal_representative_cpf: digitsOnly(e.target.value) })}
                    />
                  </label>
                </>
              )}

              <label className={`team-field smart-field-wide${pendingKeys.has(`party.${party.id}.address`) ? ' smart-field-pending' : ''}`}>
                {isPerson ? 'Endereço completo' : 'Endereço da sede'}
                <input
                  value={party.address ?? ''}
                  disabled={disabled}
                  maxLength={300}
                  onChange={(e) => updateParty(party.id, { address: e.target.value })}
                />
              </label>
            </div>

            {showSpouse && (
              <div className="smart-spouse-box">
                <p className="smart-question-label">Dados do cônjuge ou companheiro(a)</p>
                <div className="smart-fields-grid">
                  <label className={`team-field${pendingKeys.has(`party.${party.id}.property_regime`) ? ' smart-field-pending' : ''}`}>
                    Regime de bens *
                    <select
                      value={party.property_regime ?? 'comunhao_parcial'}
                      disabled={disabled}
                      onChange={(e) =>
                        updateParty(party.id, { property_regime: e.target.value as PropertyRegime })
                      }
                    >
                      {Object.entries(propertyRegimeLabels).map(([k, lbl]) => (
                        <option key={k} value={k}>
                          {lbl}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="team-field">
                    Concordância do cônjuge
                    <select
                      value={party.spouse?.gender ?? 'feminine'}
                      disabled={disabled}
                      onChange={(e) =>
                        updateParty(party.id, {
                          spouse: {
                            full_name: party.spouse?.full_name ?? '',
                            cpf: party.spouse?.cpf ?? '',
                            gender: e.target.value as Exclude<DeclaredGender, 'entity'>,
                          },
                        })
                      }
                    >
                      <option value="feminine">Esposa / Companheira</option>
                      <option value="masculine">Marido / Companheiro</option>
                      <option value="neutral">Cônjuge / Companheiro(a)</option>
                    </select>
                  </label>

                  <label className={`team-field${pendingKeys.has(`party.${party.id}.spouse.full_name`) ? ' smart-field-pending' : ''}`}>
                    Nome completo do cônjuge / companheiro(a) *
                    <input
                      value={party.spouse?.full_name ?? ''}
                      disabled={disabled}
                      maxLength={120}
                      onChange={(e) =>
                        updateParty(party.id, {
                          spouse: {
                            gender: party.spouse?.gender ?? 'feminine',
                            cpf: party.spouse?.cpf ?? '',
                            full_name: e.target.value,
                          },
                        })
                      }
                    />
                  </label>

                  <label className={`team-field${pendingKeys.has(`party.${party.id}.spouse.cpf`) ? ' smart-field-pending' : ''}`}>
                    CPF do cônjuge / companheiro(a)
                    <input
                      inputMode="numeric"
                      maxLength={14}
                      value={formatCpf(digitsOnly(party.spouse?.cpf ?? ''))}
                      disabled={disabled}
                      onChange={(e) =>
                        updateParty(party.id, {
                          spouse: {
                            gender: party.spouse?.gender ?? 'feminine',
                            full_name: party.spouse?.full_name ?? '',
                            cpf: digitsOnly(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                </div>
                <p className="document-hint">
                  {party.role === 'seller' && regimeRequiresOutorga(party.property_regime)
                    ? 'Atenção legal: neste regime de bens, a assinatura/outorga conjugal do(a) cônjuge é necessária.'
                    : 'Regime de separação total ou função compradora — verifique exigências específicas do cartório.'}
                </p>
              </div>
            )}

            <div className="smart-agreement-preview" aria-label="Prévia de qualificação gramatical">
              {formatPartyQualificationPTBR(party, indexInRole, sameRoleList.length)}
            </div>
          </article>
        );
      })}
    </div>
  );
}
