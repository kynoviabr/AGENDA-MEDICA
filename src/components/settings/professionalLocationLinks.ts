export interface ProfessionalLocationLinkState {
  locationId: string;
  active: boolean;
}

export interface ProfessionalLocationChanges {
  activate: string[];
  deactivate: string[];
}

export interface LocationDependencyCounts {
  futureAppointments: number;
  activeAvailability: number;
  futureBlocks: number;
  futureExceptions: number;
}

export function getProfessionalLocationChanges(
  existing: readonly ProfessionalLocationLinkState[],
  selectedLocationIds: readonly string[],
): ProfessionalLocationChanges {
  const selected = new Set(selectedLocationIds);
  const currentActive = new Set(existing.filter((link) => link.active).map((link) => link.locationId));
  return {
    activate: [...selected].filter((locationId) => !currentActive.has(locationId)),
    deactivate: [...currentActive].filter((locationId) => !selected.has(locationId)),
  };
}

export function describeLocationDependencies(counts: LocationDependencyCounts): string[] {
  const dependencies: string[] = [];
  if (counts.futureAppointments > 0) dependencies.push('agendamentos futuros');
  if (counts.activeAvailability > 0) dependencies.push('disponibilidade recorrente');
  if (counts.futureBlocks > 0) dependencies.push('bloqueios futuros');
  if (counts.futureExceptions > 0) dependencies.push('exceções futuras');
  return dependencies;
}
