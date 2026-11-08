import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconCalendarEvent, IconMapPin, IconCircleCheck, IconAlertTriangle } from '@tabler/icons-react';
import { PublicShell } from '@/components/PublicShell';
import { Button } from '@/components/ui/button';
import { Bound } from '@/components/blocks/Bound';
import { FieldErrorSummary } from '@/components/blocks/FieldErrorSummary';
import { LoadProblem } from '@/components/blocks/LoadProblem';
import {
  loadPublicPagesConfig, prepareChallenge,
  type PublicPagesConfig, type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  useStepForm, useJourneySubmit, useLiveList, fieldText, fieldRef, fieldLookup,
  type JourneyPort, type JourneyRecord, type SummaryItem,
} from '@/lib/journey';
import { tx } from '@/i18n';

const SLUG = 'anmeldung';

export default function Anmeldung() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPublicPagesConfig(SLUG).then(c => {
      setCfg(c);
      setPage(c?.pages[SLUG] ?? null);
      setLoading(false);
    });
  }, []);

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }
  return <AnmeldungInner cfg={cfg} page={page} />;
}

function PageFooter() {
  return (
    <div className="mt-8 border-t pt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
      <a href="https://www.living-apps.de/impressum" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
        {tx('Impressum')}
      </a>
      <a href="https://www.living-apps.de/datenschutz" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
        {tx('Datenschutz')}
      </a>
    </div>
  );
}

function AnmeldungInner({ cfg, page }: { cfg: PublicPagesConfig; page: PublicPageConfig }) {
  const [params] = useSearchParams();
  const linkedId = params.get('veranstaltung');
  const port: JourneyPort = useMemo(() => createPublicPort(cfg, page), [cfg, page]);
  const live = useLiveList(port, 'veranstaltungen', { intervalMs: 0, enabled: !!linkedId });
  const event: JourneyRecord | undefined = live.records.find(r => r.id === linkedId);

  const f = useStepForm('anmeldungen', {
    fields: ['veranstaltung', 'teilnehmer_vorname', 'teilnehmer_nachname', 'email', 'anmerkungen'],
    autoComplete: true,
  });
  const duplicateRef = useRef(false);
  const [duplicate, setDuplicate] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (linkedId) f.prefill('veranstaltung', linkedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedId]);

  const hasDuplicate = async (): Promise<boolean> => {
    const mail = String(f.get('email') ?? '').trim().toLowerCase();
    const rows = await port.list('anmeldungen');
    return rows.some(r =>
      fieldRef(r, 'veranstaltung') === linkedId &&
      fieldText(r, 'email').trim().toLowerCase() === mail,
    );
  };

  const submit = useJourneySubmit(
    port,
    [{ key: 'anmeldung', entity: 'anmeldungen', form: f, primary: true }],
    {
      draftKey: `anmeldung-${linkedId ?? 'none'}`,
      check: async () => {
        if (await hasDuplicate()) {
          duplicateRef.current = true;
          return tx('Mit dieser E-Mail-Adresse liegt schon eine Anmeldung vor.');
        }
        return null;
      },
    },
  );

  if (!linkedId) {
    return (
      <PublicShell title={tx('Anmeldung')}>
        <p className="text-sm text-muted-foreground">
          {tx('Öffne bitte den Link oder scanne den QR-Code deiner Veranstaltung, um dich anzumelden.')}
        </p>
        <PageFooter />
      </PublicShell>
    );
  }
  if (!live.loaded && live.error) {
    return <PublicShell title={tx('Anmeldung')}><LoadProblem onRetry={live.reload} /></PublicShell>;
  }
  if (!live.loaded) return <PublicShell loading />;
  if (!event) {
    return (
      <PublicShell title={tx('Anmeldung')}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link passt zu keiner Veranstaltung. Scanne bitte den QR-Code noch einmal.')}
        </p>
        <PageFooter />
      </PublicShell>
    );
  }

  const titel = fieldText(event, 'titel');
  const image = fieldText(event, 'headerbild');
  const eventBlock = (
    <div className="space-y-4">
      {image ? (
        <img src={image} alt={titel} className="w-full max-h-64 rounded-xl object-cover" />
      ) : null}
      <h2 className="text-xl font-semibold break-words">{titel}</h2>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5"><IconCalendarEvent size={16} className="shrink-0" />{fieldText(event, 'datum')}</span>
        <span className="flex items-center gap-1.5"><IconMapPin size={16} className="shrink-0" />{fieldText(event, 'ort')}</span>
      </div>
      <p className="text-sm whitespace-pre-line break-words">{fieldText(event, 'beschreibung')}</p>
    </div>
  );

  const facts: SummaryItem[] = f.summary().filter(s => s.key !== 'veranstaltung');
  const factList = (
    <dl className="rounded-xl border divide-y text-sm">
      <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 px-4 py-2">
        <dt className="sm:w-40 text-muted-foreground">{tx('Veranstaltung')}</dt>
        <dd className="font-medium break-words">{titel}</dd>
      </div>
      {facts.map(s => (
        <div key={s.key} className="flex flex-col sm:flex-row gap-1 sm:gap-4 px-4 py-2">
          <dt className="sm:w-40 text-muted-foreground">{s.label}</dt>
          <dd className="break-words whitespace-pre-line">{s.value}</dd>
        </div>
      ))}
    </dl>
  );

  if (submit.result || duplicate) {
    const isDup = duplicate && !submit.result;
    const status = submit.result ? fieldLookup(submit.result.primary, 'status') : null;
    const waitlist = status?.key === 'warteliste';
    return (
      <PublicShell title={tx('Anmeldung')}>
        <div className="space-y-5">
          {eventBlock}
          {isDup ? (
            <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <IconAlertTriangle size={20} className="shrink-0" />
              <p>{tx('Mit dieser E-Mail-Adresse liegt schon eine Anmeldung zu dieser Veranstaltung vor. Es wurde nichts doppelt gespeichert.')}</p>
            </div>
          ) : (
            <div className="flex gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
              <IconCircleCheck size={20} className="shrink-0" />
              <p>
                <span className="font-semibold">{tx('Status')}: {waitlist ? tx('Warteliste') : tx('angemeldet')}</span>
                {' — '}
                {waitlist ? tx('Du stehst auf der Warteliste.') : tx('Deine Anmeldung ist eingegangen.')}
              </p>
            </div>
          )}
          <h3 className="text-sm font-semibold">{tx('Deine Angaben')}</h3>
          {factList}
        </div>
        <PageFooter />
      </PublicShell>
    );
  }

  const onSend = async () => {
    if (!f.validate()) return;
    setChecking(true);
    duplicateRef.current = false;
    try {
      if (await hasDuplicate()) {
        setDuplicate(true);
        return;
      }
      await submit.run();
      if (duplicateRef.current) setDuplicate(true);
    } catch {
      /* the runner exposes the error */
    } finally {
      setChecking(false);
    }
  };

  return (
    <PublicShell title={tx('Anmeldung')}>
      <div className="space-y-6">
        {eventBlock}
        <form
          className="space-y-4 border-t pt-6"
          onSubmit={e => { e.preventDefault(); void onSend(); }}
          onFocus={() => prepareChallenge(cfg, page, 'POST', `/apps/${page.endpoints?.find(ep => ep.op === 'create')?.app_id ?? ''}/records`)}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Bound form={f} name="teilnehmer_vorname" />
            <Bound form={f} name="teilnehmer_nachname" />
          </div>
          <Bound form={f} name="email" />
          <Bound form={f} name="anmerkungen" />
          <FieldErrorSummary forms={[f]} />
          {submit.error && !duplicateRef.current ? (
            <p role="alert" className="text-sm text-destructive">
              {submit.offline
                ? tx('Keine Verbindung — deine Eingaben sind gesichert.')
                : tx('Das Absenden hat nicht geklappt. Bitte versuche es noch einmal.')}
            </p>
          ) : null}
          <Button type="submit" className="w-full sm:w-auto" disabled={checking || submit.submitting}>
            {tx('Anmelden')}
          </Button>
        </form>
      </div>
      <PageFooter />
    </PublicShell>
  );
}
