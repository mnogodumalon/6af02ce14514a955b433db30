import { useMemo, useState } from 'react';
import { format, isSameDay, startOfDay, parseISO } from 'date-fns';
import { IconPlus, IconCalendarEvent, IconMapPin, IconClockPause, IconUsers } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { StatCard, StatCardRow } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { extractRecordId } from '@/services/livingAppsService';
import { lookupKey } from '@/lib/formatters';
import { useClock, gruss, namen } from '@/lib/polish';
import { tx, appLabel, dateFnsLocale } from '@/i18n';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { veranstaltungen, anmeldungen } = data;
  const crud = useEntityCrud(data);
  const clock = useClock();
  const [onlyWaitlist, setOnlyWaitlist] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const today = startOfDay(clock);
  const fmt = (iso?: string) => {
    if (!iso) return '';
    const d = parseISO(iso);
    return isNaN(d.getTime()) ? '' : format(d, 'EEE, dd.MM.yyyy · HH:mm', { locale: dateFnsLocale() });
  };

  const rows = useMemo(() => {
    return veranstaltungen.map(v => {
      const mine = anmeldungen.filter(a => extractRecordId(a.fields.veranstaltung) === v.record_id);
      const active = mine.filter(a => { const k = lookupKey(a.fields.status); return k !== 'warteliste' && k !== 'abgesagt'; });
      const waiting = mine.filter(a => lookupKey(a.fields.status) === 'warteliste');
      const max = v.fields.max_teilnehmer ?? 0;
      const d = v.fields.datum ? parseISO(v.fields.datum) : null;
      return { v, active: active.length, waiting, max, free: Math.max(0, max - active.length), date: d && !isNaN(d.getTime()) ? d : null };
    }).sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
  }, [veranstaltungen, anmeldungen]);

  const upcoming = rows.filter(r => !r.date || r.date >= today);
  const visible = (showPast ? rows : upcoming).filter(r => !onlyWaitlist || r.waiting.length > 0);

  const waitingAll = anmeldungen.filter(a => lookupKey(a.fields.status) === 'warteliste');
  const rowOf = (a: { fields: { veranstaltung?: string } }) => rows.find(r => r.v.record_id === extractRecordId(a.fields.veranstaltung));
  const nachrueckbar = upcoming.filter(r => r.waiting.length > 0 && r.free > 0);
  const freeTotal = upcoming.reduce((s, r) => s + r.free, 0);
  const next = upcoming.find(r => r.date);
  const personName = (a: { fields: { teilnehmer_vorname?: string; teilnehmer_nachname?: string } }) =>
    `${a.fields.teilnehmer_vorname ?? ''} ${a.fields.teilnehmer_nachname ?? ''}`.trim();

  const enrichedById = new Map(crud.enriched.anmeldungen.map(a => [a.record_id, a]));
  const openAnm = (id: string) => {
    const rec = anmeldungen.find(a => a.record_id === id);
    if (rec) crud.anmeldungen.openDetail(rec);
  };

  let context: string;
  if (nachrueckbar.length > 0) {
    const r = nachrueckbar[0];
    context = tx`${namen(r.waiting.map(a => a.fields.teilnehmer_vorname ?? ''))} wartet bei „${r.v.fields.titel ?? ''}“ — dort sind Plätze frei geworden.`;
  } else if (next) {
    context = isSameDay(next.date!, clock)
      ? tx`Heute findet „${next.v.fields.titel ?? ''}“ statt — ${next.active} von ${next.max} Plätzen belegt.`
      : tx`Als Nächstes: „${next.v.fields.titel ?? ''}“ am ${format(next.date!, 'dd.MM.', { locale: dateFnsLocale() })} in ${next.v.fields.ort ?? ''}.`;
  } else {
    context = tx`Lege deine erste Veranstaltung an, um Anmeldungen zu sammeln.`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground">{context}</p>
        </div>
        {crud.veranstaltungen.canWrite && (
          <Button onClick={() => crud.veranstaltungen.openCreate({})}>
            <IconPlus size={16} className="shrink-0" />
            <span>{tx('Neue Veranstaltung')}</span>
          </Button>
        )}
      </div>

      <DashboardGrid
        variant="split"
        kpis={
          <StatCardRow>
            <StatCard
              title={tx('Kommende Veranstaltungen')}
              value={upcoming.length}
              description={showPast ? tx('Alle werden angezeigt') : tx('Nur kommende anzeigen')}
              icon={<IconCalendarEvent size={18} className="text-muted-foreground" />}
              onClick={() => setShowPast(p => !p)}
              active={showPast}
            />
            <StatCard
              title={tx('Auf der Warteliste')}
              value={waitingAll.length}
              description={nachrueckbar.length > 0 ? tx('Plätze frei — jetzt nachrücken') : waitingAll.length > 0 ? tx('Warten auf freie Plätze') : tx('Niemand wartet')}
              icon={<IconClockPause size={18} className="text-muted-foreground" />}
              tone={nachrueckbar.length > 0 ? 'warning' : 'default'}
              onClick={() => setOnlyWaitlist(w => !w)}
              active={onlyWaitlist}
            />
            <StatCard
              title={tx('Freie Plätze')}
              value={freeTotal}
              description={tx('in kommenden Veranstaltungen')}
              icon={<IconUsers size={18} className="text-muted-foreground" />}
            />
          </StatCardRow>
        }
        primary={
          // widget-rejected: no pre-built widget shows capacity-per-record cards (Anmeldungen/Max-Teilnehmer progress)
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="font-semibold">{appLabel('veranstaltungen')}</h2>
              {(onlyWaitlist || showPast) && (
                <Button variant="ghost" size="sm" onClick={() => { setOnlyWaitlist(false); setShowPast(false); }}>
                  {tx('Filter zurücksetzen')}
                </Button>
              )}
            </div>
            {visible.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <IconCalendarEvent size={48} className="mx-auto mb-3" />
                <p>{tx('Keine Veranstaltungen in dieser Ansicht.')}</p>
              </div>
            ) : (
              <ul className="divide-y">
                {visible.map(r => {
                  const pct = r.max > 0 ? Math.min(100, Math.round((r.active / r.max) * 100)) : 0;
                  const full = r.max > 0 && r.active >= r.max;
                  return (
                    <li key={r.v.record_id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => crud.veranstaltungen.openDetail(r.v)}
                        onKeyDown={e => { if (e.key === 'Enter') crud.veranstaltungen.openDetail(r.v); }}
                        className="cursor-pointer space-y-2 px-4 py-3 hover:bg-muted/50"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="min-w-0 truncate font-medium">{r.v.fields.titel}</span>
                          <span className="text-xs text-muted-foreground">{fmt(r.v.fields.datum)}</span>
                        </div>
                        {r.v.fields.ort && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <IconMapPin size={14} className="shrink-0" />
                            <span className="truncate">{r.v.fields.ort}</span>
                          </div>
                        )}
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full ${full ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-medium">{tx`${r.active} von ${r.max} angemeldet`}</span>
                          {r.waiting.length > 0 ? (
                            <span className="font-medium text-amber-600">{tx`${r.waiting.length} auf der Warteliste`}</span>
                          ) : full ? (
                            <span className="text-muted-foreground">{tx('Ausgebucht')}</span>
                          ) : (
                            <span className="text-muted-foreground">{tx`${r.free} Plätze frei`}</span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        }
        aside={
          <>
            <WorkList
              title={tx('Warteliste — nachrücken')}
              items={waitingAll.map(a => {
                const r = rowOf(a);
                const canMove = !!r && r.free > 0;
                return {
                  id: a.record_id,
                  title: personName(a),
                  secondLine: (
                    <>
                      <span className={canMove ? 'font-medium text-amber-600' : 'font-medium text-muted-foreground'}>
                        {canMove ? tx('Platz frei') : tx('Wartet')}
                      </span>
                      <span className="text-muted-foreground"> · {enrichedById.get(a.record_id)?.veranstaltungName}</span>
                    </>
                  ),
                  action: crud.anmeldungen.canWrite
                    ? { label: tx('Nachrücken'), onClick: () => { const rec = anmeldungen.find(x => x.record_id === a.record_id); if (rec) crud.anmeldungen.openEdit(rec); } }
                    : undefined,
                };
              })}
              onItemClick={openAnm}
              empty={{ text: tx('Niemand steht auf der Warteliste.') }}
            />
            <WorkList
              title={tx('Neueste Anmeldungen')}
              items={[...anmeldungen]
                .filter(a => lookupKey(a.fields.status) !== 'warteliste')
                .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
                .slice(0, 5)
                .map(a => ({
                  id: a.record_id,
                  title: personName(a),
                  secondLine: <span className="text-muted-foreground">{enrichedById.get(a.record_id)?.veranstaltungName}</span>,
                }))}
              onItemClick={openAnm}
              empty={{ text: tx('Noch keine Anmeldungen eingegangen.') }}
            />
          </>
        }
      />
      {crud.surfaces}
    </div>
  );
}
