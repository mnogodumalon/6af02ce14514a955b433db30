import type { Anmeldungen } from './app';

export type EnrichedAnmeldungen = Anmeldungen & {
  veranstaltungName: string;
};
