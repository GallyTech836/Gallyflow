export function getNegocioSlug(email) {
  if (!email) return null;
  return email.split('@')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}