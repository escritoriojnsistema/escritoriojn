import {paths} from '../../app/routes';
export function recoveryReturn(status:string,roles:string[],area:'client'|'team'):string {
 if(status==='authorized'){
  const client=roles.includes('client'),team=roles.some(role=>role!=='client');
  if(client&&(area==='client'||!team))return paths.clientAccount;
  if(team)return paths.account;
 }
 return area==='client'?paths.client:paths.team;
}
