import {validPublicConnection} from './connection.js';

/** Preview currently inherits production's public provider configuration.
 * Keep it disconnected until a separate homologation project is reviewed.
 * Applied both at build time and at every server-side client entry point.
 * Local labs and the existing production deployment keep their contracts.
 */
export function deploymentConnection(url:string|undefined,key:string|undefined,environment:string|undefined):{url:string;key:string}|null {
 if(environment==='preview'||!validPublicConnection(url,key))return null;
 return {url:url!,key:key!};
}
