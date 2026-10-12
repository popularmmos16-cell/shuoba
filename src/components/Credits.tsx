const ROWS: { what: string; who: string; licence: string; href: string }[] = [
  { what: 'Dictionary data and word pronunciations', who: 'CC-CEDICT, © MDBG and contributors', licence: 'CC BY-SA 4.0', href: 'https://cc-cedict.org/wiki/' },
  { what: 'HSK level tags and word list', who: 'Complete HSK Vocabulary by Yanis Zafirópulos (HSK 3.0 lists from elkmovie/hsk30)', licence: 'MIT', href: 'https://github.com/drkameleon/complete-hsk-vocabulary' },
  { what: 'Spoken audio', who: 'Voice 超文 (chaowen) for the Piper speech engine, trained on the OHF-Voice CC0 dataset', licence: 'CC0 data', href: 'https://github.com/OHF-Voice/voice-datasets' },
  { what: 'Spaced-repetition scheduling', who: 'FSRS algorithm, via ts-fsrs, by the Open Spaced Repetition project', licence: 'MIT', href: 'https://github.com/open-spaced-repetition/ts-fsrs' },
  { what: 'App framework and storage', who: 'Preact, idb, Vite', licence: 'MIT / ISC', href: 'https://preactjs.com' },
];

export function Credits() {
  return (
    <details class="card credits">
      <summary><b>Credits & licences</b></summary>
      <p class="muted">Shuōba is built on open data and open-source software. Thank you to everyone below.</p>
      {ROWS.map((r) => (
        <div class="crow">
          <b>{r.what}</b>
          <small>{r.who}</small>
          <small>
            Licence: <a href={r.href} target="_blank" rel="noopener noreferrer">{r.licence}</a>
          </small>
        </div>
      ))}
      <p class="muted">
        The phrases, sentences and English glosses were written for this app and, together with the pronunciation data derived from CC-CEDICT, are shared under{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>.
      </p>
    </details>
  );
}
