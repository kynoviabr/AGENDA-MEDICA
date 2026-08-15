/** An absolute instant encoded as an ISO-8601 string with an explicit offset or `Z`. */
export type IsoInstant = string;

/** A calendar date encoded as `YYYY-MM-DD`, interpreted in a location timezone. */
export type IsoDate = string;

/** An IANA timezone identifier, for example `America/Sao_Paulo`. */
export type IanaTimezone = string;

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

export interface TimeRange {
  startAt: IsoInstant;
  endAt: IsoInstant;
}
