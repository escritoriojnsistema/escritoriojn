import {Link} from 'react-router-dom';

export type RegistrationAcceptances={terms:boolean;cookies:boolean;privacy:boolean};
const policies=[
  {key:'terms',path:'/termos',prefix:'Li e aceito os ',title:'Termos de uso'},
  {key:'cookies',path:'/cookies',prefix:'Li e compreendi ',title:'Cookies e preferências'},
  {key:'privacy',path:'/privacidade',prefix:'Li e estou ciente da ',title:'Privacidade'},
] as const;

export function RegistrationAcceptance({accepted,onChange}:{accepted:RegistrationAcceptances;onChange:(key:keyof RegistrationAcceptances,checked:boolean)=>void}){
  return <fieldset className="registration-acceptance" aria-describedby="registration-acceptance-description"><legend>Antes de definir sua senha</legend><p id="registration-acceptance-description">Confirme cada leitura para criar sua conta. Sem cookies opcionais, publicidade ou rastreamento.</p>{policies.map(item=><label className="registration-policy" key={item.key}><input type="checkbox" name={`accept_${item.key}`} required checked={accepted[item.key]} onChange={event=>onChange(item.key,event.target.checked)}/><span>{item.prefix}<Link to={item.path} target="_blank" rel="noreferrer">{item.title}</Link>.</span></label>)}</fieldset>;
}
