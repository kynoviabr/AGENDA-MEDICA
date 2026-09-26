export const schedulingProviderCapabilityNames = [
  'locations',
  'professionals',
  'services',
  'insurances',
  'professionalRules',
  'readAvailability',
  'readAppointments',
  'createAppointment',
  'confirmAppointment',
  'cancelAppointment',
  'rescheduleAppointment',
  'updateAppointmentStatus',
  'markNoShow',
  'reassignProfessional',
  'readBlocks',
  'createBlock',
  'removeBlock',
  'webhooks',
  'reconciliation',
] as const;

export type SchedulingProviderCapability = typeof schedulingProviderCapabilityNames[number];

export type SchedulingProviderCapabilities = Readonly<Record<SchedulingProviderCapability, boolean>>;

export function createSchedulingProviderCapabilities(
  enabled: readonly SchedulingProviderCapability[] = [],
): SchedulingProviderCapabilities {
  const enabledCapabilities = new Set(enabled);

  return Object.freeze(Object.fromEntries(
    schedulingProviderCapabilityNames.map((capability) => [capability, enabledCapabilities.has(capability)]),
  )) as SchedulingProviderCapabilities;
}
