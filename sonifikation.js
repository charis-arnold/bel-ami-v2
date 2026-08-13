/* =============================================================================
   sonifikation.js — Erstentwurf (siehe Sonifikation-Brief-fuer-Claude-Code.md)
   Eigenständiges, additives Modul: rührt datenbereinigung.js nicht an.
   Datenquelle: kapitel01-sonifikation.json (siehe
   data-prep/05 bereinigen/baue-sonifikation.py) — pro Station (0–5, die 6
   "Halte" entlang der Kapitel-1-Route) Annotationsanzahl, Intensitäts-Summe,
   F-Wert-Anteile UND Gehstrecken (davor/eigen, in Metern).

   ZEITBASIERTE PLAY-ENGINE (statt Scroll, siehe Konzept-Diskussion): Ein
   Klick auf den Play-Button der Graph-Ansicht (grafikPlayButton/
   toggleGrafikPlay in sketch.js) spielt Kapitel 1 als eigenständiges, in
   sich geschlossenes Stück ab — feste Gesamtdauer
   (SONIFIKATION_GESAMTDAUER_SEK), NICHT an scrollY gekoppelt. Dieses Modul
   liefert dafür NUR den Ton (spieleKapitel1SonifikationAudio/
   beendeSonifikationAudio) — die Graph-Ansicht selbst (horizontale
   Spine, zeichneSpineHorizontal in sketch.js) läuft parallel mit derselben
   Gesamtdauer, siehe aktuelleGrafikAnimationDauer() dort. Frühere Fassung
   hatte hier ein eigenes, synchronisiertes Karten-Bild
   (zeichneSonifikationsAbspiel() in sketch.js, gesteuert über
   window.sonifikationSpieltAb + sonifikationAktuelleRevealIndex()) — beides
   entfernt, da die Graph-Ansicht dieselbe Aufgabe jetzt übernimmt.

   Warum nicht scroll-getrieben: Scroll-Geschwindigkeit ist durch den Nutzer
   beliebig steuerbar (schnelles Wischen, Pausieren, Zurückscrollen) — das
   verhindert jedes musikalische Tempo/Rubato. Ein Play-Button mit eigenem,
   von der Route abgeleitetem Zeitplan (baueSpielplan()) macht die
   Wegstrecke zwischen den Stationen und die Verweildauer (Annotationsdichte)
   zur eigentlichen musikalischen Struktur — analog zum Grundgedanken von
   commute.dataveyes.com (Metronom statt Scroll).

   Wachstums-Metrik (siehe Rückfrage/Antwort zum Brief): anzahlAnnotationen.
   Die drei F-Wert-Kategorien sind drei konstante Instrumenten-Layer, in
   c-moll, mit fliessenden Attack/Release-Werten statt Beat-Repetition.
============================================================================= */

// Sample-Bänke laut strudel.cc-eigenem prebake.mjs (Codeberg uzu/strudel,
// packages/website/src/repl/prebake.mjs) — @strudel/web lädt selbst KEINE
// Samples (führte zu "sound X not found" in der Konsole); "gm_*"-Sounds
// (General MIDI) brauchen zusätzlich das separate @strudel/soundfonts-Paket
// und sind hier bewusst NICHT verwendet. Stattdessen direkt VCSL (Versilian
// Community Sample Library, echte Instrumentalaufnahmen statt GM-Synth) +
// die dedizierte Klavier-Bank, exakt dieselben zwei CDN-Quellen, die
// strudel.cc selbst lädt.
const SONIFIKATION_SAMPLE_BAENKE = [
  ['https://strudel.b-cdn.net/piano.json', 'https://strudel.b-cdn.net/piano/'],
  ['https://strudel.b-cdn.net/vcsl.json', 'https://strudel.b-cdn.net/VCSL/'],
];

// VCSL hat keine Streicher-/Klarinetten-Samples (stark perkussions-/
// weltinstrumente-lastige Bibliothek, siehe vcsl.json) — Auswahl entsprechend
// auf tatsächlich vorhandene Klangfarben angepasst, sinngemäss statt wörtlich
// am Saint-Saëns-Bild (Klavier/Orgel/Saxophon statt Klavier/Streicher/Holz).
const SONIFIKATION_INSTRUMENTE = {
  ort_loest_emotion_aus: { sound: 'piano', attack: 0.02, release: 0.6, octave: 3 },
  emotion_faerbt_raum: { sound: 'pipeorgan_quiet', attack: 0.25, release: 1.2, octave: 4 },
  koerper_als_sensor: { sound: 'sax', attack: 0.12, release: 0.8, octave: 4 },
};

// Gesamtdauer des Stücks — bewusst hier (nicht in Python) als gestalterischer
// Wert; erste Annahme, per Ohr anzupassen.
const SONIFIKATION_GESAMTDAUER_SEK = 45;

// Gewichtungs-Formel für die Dauer einer Station (siehe Modulkopf-Kommentar):
// Basiswert, damit auch strecken-/annotationsarme Stationen (z.B. Station 1,
// "Place de la Madeleine", nur 3 Annotationen, keine eigene Wegstrecke) einen
// hörbaren Moment bekommen, plus Anteil aus Gehstrecke (davor + eigen) und
// Annotationsdichte. STRECKEN_SKALA/ANNOTATION_SKALA sind Stellschrauben,
// keine gemessenen Grössen — frei anpassbar, um die Balance zu verändern.
const SONIFIKATION_GEWICHT_BASIS = 3;
const SONIFIKATION_GEWICHT_STRECKEN_SKALA = 200; // Meter pro Gewichtspunkt
const SONIFIKATION_GEWICHT_ANNOTATION_SKALA = 0.6; // Gewichtspunkte pro Annotation

let sonifikationDaten = null;
let sonifikationBereit = false;
let sonifikationSpieltGerade = false;

// Zeitplan: [{station, ort, start, ende, dauer, revealIndexVorher, revealIndexEigen}, ...]
// (Sekunden ab Start) — nur für den Audio-Aufbau (baueGainFolge/Notenfolge)
// hier im Modul selbst gebraucht.
let sonifikationSpielplan = null;

async function ladeSonifikationDaten() {
  if (sonifikationDaten) return sonifikationDaten;
  let antwort = await fetch('kapitel01-sonifikation.json');
  sonifikationDaten = await antwort.json();
  return sonifikationDaten;
}

function baueSpielplan(stationen) {
  let gewichte = stationen.map(s =>
    SONIFIKATION_GEWICHT_BASIS
    + (s.wegstreckeVorherM + s.wegstreckeEigenM) / SONIFIKATION_GEWICHT_STRECKEN_SKALA
    + s.anzahlAnnotationen * SONIFIKATION_GEWICHT_ANNOTATION_SKALA
  );
  let summeGewichte = gewichte.reduce((a, b) => a + b, 0);

  let ende = 0;
  let revealIndexVorher = 0;
  return stationen.map((s, i) => {
    let dauer = (gewichte[i] / summeGewichte) * SONIFIKATION_GESAMTDAUER_SEK;
    let start = ende;
    ende += dauer;
    let eintrag = {
      station: s.station, ort: s.ort, start, ende, dauer,
      revealIndexVorher,
      revealIndexEigen: s.revealIndexMax,
    };
    revealIndexVorher = s.revealIndexMax;
    return eintrag;
  });
}

// Baut aus den Stationsdaten für eine F-Wert-Kategorie eine gewichtete
// Strudel-Gain-Folge (dieselben @-Gewichte wie die Notenfolge, siehe
// spieleKapitel1SonifikationAudio — sonst würden Gain- und Notenwechsel
// zeitlich auseinanderlaufen). 0, wo diese Kategorie an dieser Station gar
// nicht vorkommt, sonst die Anzahl normiert auf die insgesamt grösste
// Station (maxAnzahl) über alle Kategorien hinweg.
function baueGainFolge(stationen, spielplan, kategorie, maxAnzahl) {
  return stationen
    .map((s, i) => {
      let n = s.fWertAnteile[kategorie] || 0;
      let wert = n > 0 ? (n / maxAnzahl).toFixed(2) : '0';
      return `${wert}@${spielplan[i].dauer.toFixed(3)}`;
    })
    .join(' ');
}

// initStrudel() muss innerhalb des Klick-Handlers passieren (Autoplay-
// Policy). WICHTIG: initStrudel() selbst ist async und gibt ein Promise
// zurück, das erst resolved, nachdem @strudel/core/mini/webaudio etc. per
// evalScope() global registriert wurden (siehe packages/web/web.mjs,
// defaultPrebake()) — davor existiert die globale samples()-Funktion (und
// note/n/s/stack/...) schlicht noch nicht. Die prebake-Option wird intern
// GENAU an der richtigen Stelle ausgeführt (nach defaultPrebake, also
// nachdem samples() bereits existiert).
// KORREKTUR (nach Prüfung des tatsächlich per CDN geladenen Bundles,
// @strudel/web@1.0.3 — nicht nur der Doku/dem neueren main-Branch-Quelltext):
// initStrudel() gibt in dieser Version GAR NICHTS zurück (kein "return repl"
// wie im main-Branch) — repl bleibt intern privat. setCps/setcps werden nur
// registriert, wenn der REPL SELBST intern seine eigene .evaluate()-Methode
// aufruft (die dabei H() ausführt) — das global exponierte evaluate() ist
// eine ANDERE, einfachere Funktion ohne diesen Seiteneffekt. Damit ist
// setcps/cpm in dieser Version von aussen schlicht nicht erreichbar.
// Lösung: Standard-Tempo ist fest cps=0.5 (1 Zyklus = 2s, siehe Scheduler-
// Konstruktor im Bundle) — Gesamtdauer daher über .slow() steuern, das
// bereits im allerersten Entwurf nachweislich funktioniert hat.
const SONIFIKATION_STANDARD_CPS = 0.5;

async function stelleSonifikationBereit() {
  if (sonifikationBereit) return;
  await initStrudel({
    prebake: () => Promise.all(
      SONIFIKATION_SAMPLE_BAENKE.map(([json, basis]) => samples(json, basis, { prebake: true }))
    ),
  });
  // Race im geladenen @strudel/web@1.0.3-Bundle selbst (per Test beobachtet,
  // nicht dokumentiert): das von initStrudel() zurückgegebene Promise kann
  // einen Tick VOR der eigentlichen evalScope()-Registrierung von n/s/note/…
  // als globale Funktionen auflösen — n(...) direkt danach wirft dann
  // "n is not defined". Kapitel 1s eigener Aufruf (spieleKapitel1Sonifikation-
  // Audio) verdeckte das bisher zufällig durch den JSON-Fetch dazwischen
  // (genug Zeit für den fehlenden Tick); ohne so einen Zwischenschritt (wie
  // bei spieleKapitelSonifikationAudio) schlägt es zuverlässig fehl. Kurzes
  // Polling (im Test reichte 1 Tick) statt eines festen sleep(), damit es
  // auch bei einer langsameren Registrierung nicht erneut flackert.
  let versuche = 0;
  while (typeof n !== 'function' && versuche < 50) {
    await new Promise(r => setTimeout(r, 10));
    versuche++;
  }
  sonifikationBereit = true;
}

let sonifikationTimeoutId = null;

// Gemeinsamer Wiedergabe-Kern für Kapitel 1 (eigene, wegstreckengewichtete
// Stationen-Einteilung, siehe spieleKapitel1SonifikationAudio) UND jedes
// andere Kapitel (02–18, gleichverteilte Schritte, siehe
// spieleKapitelSonifikationAudio) — beide bauen nur notenFolge/
// gainFolgenProKategorie in ihrer je eigenen Logik zusammen und übergeben
// hier an dieselben drei Instrumenten-Layer (SONIFIKATION_INSTRUMENTE,
// Saint-Saëns-Stilrichtung, siehe Modulkopf).
function spieleSchichten(notenFolge, gainFolgenProKategorie, slowFaktor, gesamtdauerSek) {
  let layers = Object.entries(SONIFIKATION_INSTRUMENTE).map(([kategorie, instr]) =>
    n(notenFolge)
      .scale(`c${instr.octave}:minor`)
      .s(instr.sound)
      .gain(gainFolgenProKategorie[kategorie])
      .attack(instr.attack)
      .release(instr.release)
      .room(0.3)
      .slow(slowFaktor)
  );

  stack(...layers).play();

  sonifikationSpieltGerade = true;

  sonifikationTimeoutId = setTimeout(() => {
    sonifikationTimeoutId = null;
    beendeSonifikationAudio();
  }, gesamtdauerSek * 1000);
}

// Reiner Audio-Start — die Graph-Ansicht (horizontale Spine) läuft
// unabhängig davon parallel weiter, siehe toggleGrafikPlay/
// aktuelleGrafikAnimationDauer in sketch.js, die für Kapitel 1 dieselbe
// SONIFIKATION_GESAMTDAUER_SEK als Gesamtdauer verwenden — beide Uhren
// starten dadurch (bis auf die kurze Ladezeit von Strudel/den JSON-Daten
// beim allerersten Play) zur selben Zeit und bleiben synchron, ohne dass
// dieses Modul die Graph-Ansicht selbst kennen oder steuern muss.
async function spieleKapitel1SonifikationAudio() {
  await stelleSonifikationBereit();
  let daten = await ladeSonifikationDaten();
  let stationen = daten.stationen;
  let maxAnzahl = Math.max(...stationen.map(s => s.anzahlAnnotationen));

  sonifikationSpielplan = baueSpielplan(stationen);

  // Je Kategorie: eine Melodie in c-moll (.scale() statt fest ausnotierter
  // Töne), eine Tonstufe pro Station — aber NICHT gleich lang: die
  // @-Gewichte (siehe Modulkopf) kommen aus derselben Gehstrecke/
  // Annotationsdichte wie der visuelle Zeitplan (baueSpielplan), damit Ton
  // und Graph-Ansicht dieselbe innere Struktur teilen. .slow() dehnt
  // den einen Zyklus (bei Standardtempo cps=0.5 sonst 2s lang) exakt auf
  // SONIFIKATION_GESAMTDAUER_SEK.
  let notenFolge = sonifikationSpielplan.map((e, i) => `${i}@${e.dauer.toFixed(3)}`).join(' ');
  let slowFaktor = SONIFIKATION_GESAMTDAUER_SEK / (1 / SONIFIKATION_STANDARD_CPS);

  let gainFolgenProKategorie = {};
  Object.keys(SONIFIKATION_INSTRUMENTE).forEach(kategorie => {
    gainFolgenProKategorie[kategorie] = baueGainFolge(stationen, sonifikationSpielplan, kategorie, maxAnzahl);
  });

  spieleSchichten(notenFolge, gainFolgenProKategorie, slowFaktor, SONIFIKATION_GESAMTDAUER_SEK);
}

// Dieselbe Saint-Saëns-Klangsprache (SONIFIKATION_INSTRUMENTE) für jedes
// einzelne Kapitel 02–18 — anders als Kapitel 1 (eigene, von Hand
// gepflegte kapitel01-sonifikation.json mit fester 6-Stationen-Einteilung
// und wegstreckengewichteten Dauern) braucht diese Fassung KEINE eigene
// Python-Ausgabedatei: sie liest direkt dieselben Spine-Einträge
// (spineEintraegeKapitel[nr], baueSpineDaten() in datenbereinigung.js), die
// ohnehin schon für die wachsenden Kreise der Graph-Ansicht gebaut werden —
// Ton und Bild teilen sich dadurch garantiert dieselbe Struktur, ohne
// eigene Gewichtungs-Formel. Jeder Spine-Schritt bekommt exakt denselben
// Zeitanteil wie in der Animation (aktuelleGrafikAnimationDauer, sketch.js,
// dort bereits gleichverteilt statt wegstreckengewichtet) — 'rueckkehr'-
// Schritte bleiben bewusst stumm/Pause ('~' in der Strudel-Mini-Notation):
// eine Rückkehr lässt in der Graph-Ansicht den URSPRÜNGLICHEN Kreis
// weiterwachsen statt einen neuen zu zeigen, das liesse sich in einer rein
// sequenziellen Tonfolge nicht rückwirkend auf einen bereits gespielten Ton
// nachbilden. Die Notenhöhe ist wie bei Kapitel 1 nur die fortlaufende
// Position in der c-moll-Tonleiter — die drei Instrumenten-Layer folgen
// der F-Wert-Verteilung (SONIFIKATION_INSTRUMENTE-Schlüssel) der jeweils
// EIGENEN Annotationen jedes Schritts (zwischen seinem rv und dem rv des
// nächsten Spine-Eintrags, exklusive — durch die Bauweise von
// baueSpineDaten immer exakt der eine zusammenhängende Ortsbesuch, den
// dieser Schritt darstellt).
async function spieleKapitelSonifikationAudio(nr) {
  await stelleSonifikationBereit();
  let daten = datenFuerKapitel(nr);
  let eintraege = spineEintraegeKapitel[nr];
  if (!daten || !eintraege || !eintraege.length) return;

  let annotationen = daten.annotationen;
  let fWertAnteileJeSchritt = eintraege.map((e, j) => {
    let bis = j + 1 < eintraege.length ? eintraege[j + 1].rv - 1 : annotationen.length - 1;
    let anteile = { ort_loest_emotion_aus: 0, emotion_faerbt_raum: 0, koerper_als_sensor: 0 };
    for (let ai = e.rv; ai <= bis; ai++) {
      let a = annotationen[ai];
      if (a && a.hasFwert && a.fWertType in anteile) anteile[a.fWertType]++;
    }
    return { anteile, anzahl: Math.max(0, bis - e.rv + 1) };
  });
  let maxAnzahl = Math.max(1, ...fWertAnteileJeSchritt.map(s => s.anzahl));

  let melodieIndex = 0;
  let notenFolge = eintraege.map(e => e.typ === 'rueckkehr' ? '~' : String(melodieIndex++)).join(' ');

  let gainFolgenProKategorie = {};
  Object.keys(SONIFIKATION_INSTRUMENTE).forEach(kategorie => {
    gainFolgenProKategorie[kategorie] = eintraege.map((e, j) =>
      e.typ === 'rueckkehr' ? '0' : (fWertAnteileJeSchritt[j].anteile[kategorie] / maxAnzahl).toFixed(2)
    ).join(' ');
  });

  // aktuelleGrafikAnimationDauer() (sketch.js) liest zoomedKapitel selbst
  // aus — hier korrekt, weil dieser Aufruf nur aus toggleGrafikPlay kommt,
  // während zoomedKapitel bereits === nr ist.
  let gesamtdauerSek = aktuelleGrafikAnimationDauer() / 1000;
  let slowFaktor = gesamtdauerSek / (1 / SONIFIKATION_STANDARD_CPS);

  spieleSchichten(notenFolge, gainFolgenProKategorie, slowFaktor, gesamtdauerSek);
}

// Play/Pause-Steuerung lebt in sketch.js (toggleGrafikPlay) — hier nur das
// Aufräumen des Audio-Teils (Sound stoppen, Timeout löschen). Rührt bewusst
// weder grafikSpielt noch grafikPlayButton an: die Graph-Ansicht bleibt
// alleinige Quelle für Play-Icon/Fortschritt (siehe sketch.js).
function beendeSonifikationAudio() {
  if (typeof hush === 'function') hush();
  sonifikationSpieltGerade = false;
  if (sonifikationTimeoutId !== null) {
    clearTimeout(sonifikationTimeoutId);
    sonifikationTimeoutId = null;
  }
}
