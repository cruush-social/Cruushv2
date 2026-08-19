const DEVELOPMENT_ADMIN_EMAIL = 'admin@cruush.local';
const CODEVELOPER_NYC_EMAIL = 'codeveloper-nyc@cruush.local';

const DEVELOPER_MAP_TOOL_EMAILS = new Set([
  DEVELOPMENT_ADMIN_EMAIL,
  CODEVELOPER_NYC_EMAIL,
  'julienlenazny@gmail.com',
]);

export function canUseDeveloperMapToolsEmail(email?: string | null) {
  return DEVELOPER_MAP_TOOL_EMAILS.has(email?.trim().toLowerCase() ?? '');
}
