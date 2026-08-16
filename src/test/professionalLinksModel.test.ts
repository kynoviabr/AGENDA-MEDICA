import { describe, expect, it } from 'vitest';
import { availabilityRowsToWeeklyHours, getActiveLinkChanges, weeklyHoursToAvailabilityRows } from '@/components/settings/professionalLinksModel';

describe('professional links model', () => {
  it('calculates active additions and safe inactivations without deleting history', () => {
    expect(getActiveLinkChanges([
      { targetId: 'a', active: true }, { targetId: 'b', active: false }, { targetId: 'c', active: true },
    ], ['b', 'c'])).toEqual({ activate: ['b'], deactivate: ['a'] });
  });

  it('keeps multiple daily periods isolated by professional and location', () => {
    const hours = availabilityRowsToWeeklyHours([
      { day_of_week: 1, start_time: '13:00:00', end_time: '18:00:00' },
      { day_of_week: 1, start_time: '08:00:00', end_time: '12:00:00' },
    ]);
    expect(hours.weekdays['1']).toEqual([{ start: '08:00', end: '12:00' }, { start: '13:00', end: '18:00' }]);
    expect(weeklyHoursToAvailabilityRows(hours, 'clinic-a', 'professional-a', 'location-a')).toEqual([
      { clinic_id: 'clinic-a', professional_id: 'professional-a', location_id: 'location-a', day_of_week: 1, start_time: '08:00', end_time: '12:00', is_active: true },
      { clinic_id: 'clinic-a', professional_id: 'professional-a', location_id: 'location-a', day_of_week: 1, start_time: '13:00', end_time: '18:00', is_active: true },
    ]);
  });
});
