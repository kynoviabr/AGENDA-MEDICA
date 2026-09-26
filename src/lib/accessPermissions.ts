export const MENU_PERMISSION_KEYS = [
  'dashboard.view',
  'crm.view',
  'whatsapp_ai.view',
  'patients.view',
  'treatments.view',
  'appointments.view',
  'settings.view',
] as const;

export type MenuPermissionKey = (typeof MENU_PERMISSION_KEYS)[number];

export const ACTIVE_MENU_PERMISSION_KEYS = MENU_PERMISSION_KEYS;

export const PATH_PERMISSION_MAP: Array<{ prefix: string; key: MenuPermissionKey }> = [
  { prefix: '/clinic/settings', key: 'settings.view' },
  { prefix: '/clinic/whatsapp-ai', key: 'whatsapp_ai.view' },
  { prefix: '/clinic/crm', key: 'crm.view' },
  { prefix: '/clinic/patients', key: 'patients.view' },
  { prefix: '/clinic/treatments', key: 'treatments.view' },
  { prefix: '/clinic/appointments', key: 'appointments.view' },
  { prefix: '/clinic', key: 'dashboard.view' },
];
