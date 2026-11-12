// Informational registration acknowledgments. These values never grant access.
export const registrationPolicyVersion = '2026-11-12.1';
export const registrationAcceptance = Object.freeze({
  version: registrationPolicyVersion,
  terms: true,
  privacy: true,
  cookies: true,
  optional_cookies: false,
});
