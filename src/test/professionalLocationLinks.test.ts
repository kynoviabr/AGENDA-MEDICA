import { describe, expect, it } from 'vitest';
import {
  describeLocationDependencies,
  getProfessionalLocationChanges,
} from '@/components/settings/professionalLocationLinks';

describe('professional location link changes', () => {
  it('preserves existing active units when the saved selection is unchanged', () => {
    expect(getProfessionalLocationChanges([
      { locationId: 'main', active: true },
      { locationId: 'inactive-old', active: false },
    ], ['main'])).toEqual({ activate: [], deactivate: [] });
  });

  it('supports multiple units and reactivates a previously inactive link', () => {
    expect(getProfessionalLocationChanges([
      { locationId: 'main', active: true },
      { locationId: 'second', active: false },
    ], ['main', 'second', 'third'])).toEqual({
      activate: ['second', 'third'],
      deactivate: [],
    });
  });

  it('calculates removals without deleting unchanged or already inactive links', () => {
    expect(getProfessionalLocationChanges([
      { locationId: 'main', active: true },
      { locationId: 'second', active: true },
      { locationId: 'inactive-old', active: false },
    ], ['second'])).toEqual({ activate: [], deactivate: ['main'] });
  });

  it('fails closed with no selected unit by deactivating every current active link', () => {
    expect(getProfessionalLocationChanges([
      { locationId: 'main', active: true },
      { locationId: 'second', active: true },
    ], [])).toEqual({ activate: [], deactivate: ['main', 'second'] });
  });

  it('describes every scheduling dependency that blocks safe removal', () => {
    expect(describeLocationDependencies({
      futureAppointments: 1,
      activeAvailability: 2,
      futureBlocks: 1,
      futureExceptions: 3,
    })).toEqual([
      'agendamentos futuros',
      'disponibilidade recorrente',
      'bloqueios futuros',
      'exceções futuras',
    ]);
  });
});
