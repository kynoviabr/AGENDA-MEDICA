export class FixedEvaluationClock {
  private current: Date;
  constructor(isoTimestamp: string, readonly timezone: string) {
    this.current = new Date(isoTimestamp);
    if (Number.isNaN(this.current.getTime())) throw new Error('Invalid fixed evaluation clock.');
    new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(this.current);
  }
  now = () => new Date(this.current);
  advance(milliseconds: number) { this.current = new Date(this.current.getTime() + milliseconds); }
}
