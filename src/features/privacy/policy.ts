export const privacyPolicyVersion='2026-11-06.1';
// No advertising, analytics or optional third-party storage is installed.
export const optionalTechnologies:readonly string[]=[];
export const necessaryPreference={policyVersion:privacyPolicyVersion,necessary:true,optional:false,consent:false} as const;
export const privacyPreferenceKey='jn-privacy-notice-v1';
export function rememberNecessaryPreference():boolean {
 try {localStorage.setItem(privacyPreferenceKey,JSON.stringify(necessaryPreference));return true;}catch{return false;}
}
