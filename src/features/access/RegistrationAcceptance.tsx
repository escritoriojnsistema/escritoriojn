import {InfoTrigger} from '../privacy/InfoTrigger';

export type RegistrationAcceptances={terms:boolean;cookies:boolean;privacy:boolean};
const policies=[
  {key:'terms',prefix:'Li e aceito os ',title:'Termos de uso'},
  {key:'cookies',prefix:'Li e compreendi ',title:'Cookies e preferências'},
  {key:'privacy',prefix:'Li e estou ciente da ',title:'Privacidade'},
] as const;

export function RegistrationAcceptance({accepted,onChange}:{accepted:RegistrationAcceptances;onChange:(key:keyof RegistrationAcceptances,checked:boolean)=>void}){
  return <fieldset className="registration-acceptance" aria-describedby="registration-acceptance-description"><legend>Antes de definir sua senha</legend><p id="registration-acceptance-description">Confirme cada leitura para criar sua conta. Sem cookies opcionais, publicidade ou rastreamento.</p>{policies.map(item=><div className="registration-policy" key={item.key}><input type="checkbox" name={`accept_${item.key}`} aria-label={item.prefix+item.title} required checked={accepted[item.key]} onChange={event=>onChange(item.key,event.target.checked)}/><span>{item.prefix}<InfoTrigger section={item.key}>{item.title}</InfoTrigger>. </span></div>)}</fieldset>;
}
