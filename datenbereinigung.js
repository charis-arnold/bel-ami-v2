/* =============================================================================
   datenbereinigung.js — Datenbereinigung (D3)
   CAS Generative Data Design: Datenaufbereitung (Python, siehe data-prep/)
   → Datenbereinigung (hier, D3) → Zeichnen (sketch.js, p5).
   Enthält ausschliesslich reine Datenfunktionen — keine p5-Zeichenaufrufe.
============================================================================= */

const CATEGORY_COLORS = { gold_dunkel: '#63561F', gold_mittel: '#917712', gold_hell: '#BF9E16' };
const CATEGORY_LABELS = { gold_dunkel: 'Raum & Umwelt', gold_mittel: 'Stimmung & Emotion', gold_hell: 'Soziales' };
const ROUTE_COLOR = '#63561F';

// Wandelt einen Hex-Farbstring ('#rrggbb') in einzelne r/g/b-Komponenten um —
// wird gebraucht, damit ROUTE_COLOR (ein Hex-String) auch dort als einzige
// Quelle dient, wo die Route mit variablem Alpha gezeichnet wird (p5's
// stroke() nimmt Hex+Alpha nicht gemeinsam entgegen).
function hexZuRgb(hex) {
  let bereinigt = hex.replace('#', '');
  return {
    r: parseInt(bereinigt.substring(0, 2), 16),
    g: parseInt(bereinigt.substring(2, 4), 16),
    b: parseInt(bereinigt.substring(4, 6), 16),
  };
}
const ROUTE_COLOR_RGB = hexZuRgb(ROUTE_COLOR);

const FWERT_COLOR = '#C2511C';
const FWERT_COLOR_RGB = hexZuRgb(FWERT_COLOR); // z.B. für den Fotomarker-Asterisk (fill() mit variablem Alpha, siehe zeichneFotoMarker)
const FWERT_COLORS = {
  ort_loest_emotion_aus: '#AB3F0C',
  emotion_faerbt_raum: '#C2511C',
  koerper_als_sensor: '#A03705',
};

// Punktgrösse (1 = klein … 3 = gross) der F-Wert-Punkte ausserhalb des
// Kreisdiagramms je F-Wert-Typ (siehe zeichneFwertPunkte in sketch.js). Ein
// vierter, sehr seltener Typ (persoenliche_sehnsucht, gesamthaft nur 1
// Annotation) hat keine eigene Grösse — fällt beim Aufrufer auf 1 zurück.
const FWERT_PUNKTGROESSE = {
  ort_loest_emotion_aus: 1, // Raum löst Emotion aus
  emotion_faerbt_raum: 2,   // Emotion färbt Raum
  koerper_als_sensor: 3,    // Körper als Sensor
};

// Farbe aller F-Wert-Punkte (einheitlich, unabhängig von Grösse/Typ) — nicht
// zu verwechseln mit FWERT_COLORS oben, das für die Annotationsleiste bleibt.
const FWERT_PUNKT_FARBE = '#AB3F0C';

const KREIS_KATEGORIEN = [
  { key: 'gold_dunkel', farbe: [142, 117, 42] },
  { key: 'gold_mittel', farbe: [206, 169, 62] },
  { key: 'gold_hell', farbe: [202, 179, 122] },
];

const PARIS_ALLGEMEIN = new Set([
  'Paris',
  'Paris (allgemein)',
  'unspezifisch',
  'Strassenecken von Paris (allgemein)',
]);

// Kapitel 1s Spine zeigt jeden ortRun, der auch auf der Karte einen eigenen
// Kreis bekommt — siehe ortRunsFuerSpine() weiter unten (dynamisch, nicht
// mehr eine feste Liste, damit Karte und Spine nie auseinanderlaufen).

// Hauptorte für das generische Spine-Panel eines gezoomten Kapitels (02–18)
// beim Kapitel-Zoom (siehe sketch.js: oeffneKapitelZoom/draw) — dieselbe
// dynamische Funktion wie Kapitel 1s eigenes, live wachsendes Panel
// (ortRunsFuerSpine, siehe oben), NICHT mehr eine je Kapitel von Hand
// gepflegte/generierte feste Liste: die driftete nach jeder weiteren
// Datenbereinigung (Umbenennungen, Zusammenlegungen) rasch auseinander und
// liess auf der Karte gezeigte Kreise in der Spine fehlen (z.B. Kapitel 3:
// 4 echte Orte fehlten zuletzt) — jetzt kann Karte und Spine gar nicht mehr
// auseinanderlaufen, weil beide direkt aus denselben ortRuns lesen.

// Reine Existenz-Prüfung ("hat Kapitel X überhaupt ein Spine-Panel?", siehe
// sketch.js: springeZuKapitelZoom/oeffneKapitelZoom/Kapitelregister) — Kapitel
// 01 bewusst nicht enthalten, das hat sein eigenes Panel (siehe oben).
const KAPITEL_MIT_SPINE_PANEL = new Set([
  '02', '03', '04', '05', '06', '07', '08', '09', '10',
  '11', '12', '13', '14', '15', '16', '17', '18',
]);

// "Wohnung Duroy" und mehrere Mini-Erwähnungen direkt daneben (Lokal mit
// festen Preisen, Straße nahe, Boulevard, Rue Notre-Dame de Lorette / Paris)
// werden zu einem gemeinsamen Punkt zusammengefasst, damit Route und Spine
// nur einen wachsenden Kreis zeigen statt mehrerer fast übereinanderliegender
// Mini-Kreise. "Rue Notre-Dame de Lorette" selbst bleibt bewusst ein eigener,
// separater Punkt (bekommt seine eigene, leicht nach Osten versetzte
// Koordinate).
//
// Die Zuordnung erfolgt NICHT über den ortBasis-Text, sondern über die
// Position in der Erzählreihenfolge (ai): alle station-0-Annotationen VOR
// der Annotation "Daraufhin ging er die Rue Notre-Dame de Lorette
// hinunter." (id 8) lassen den Sammelpunkt wachsen, alle AB dieser
// Annotation (auch "Rue Notre-Dame de Lorette / Paris", id 12, die textlich
// erst danach kommt) lassen "Rue Notre-Dame de Lorette" wachsen.
const WOHNUNG_SAMMELPUNKT_ANKER = 'Lokal in der Nähe der Rue Notre-Dame de Lorette';
const RUE_NOTRE_DAME_DE_LORETTE_ORT = 'Rue Notre-Dame de Lorette';
const WOHNUNG_SPLIT_ANNOTATION_ID = 8; // "Daraufhin ging er die Rue Notre-Dame de Lorette hinunter."
const WOHNUNG_SAMMELPUNKT_ABSORBIERTE_ORTRUNS = new Set([
  'Lokal mit festen Preisen nahe Rue Notre-Dame de Lorette',
  'Straße nahe Rue Notre-Dame de Lorette',
  'Boulevard',
  'Rue Notre-Dame de Lorette / Paris',
]);

// Reihenfolge-Position (ai) der Split-Annotation — alles davor gehört zum
// Sammelpunkt, alles ab hier zu "Rue Notre-Dame de Lorette".
function wohnungSplitAi(daten = stationenData) {
  let ai = daten.annotationen.findIndex(a => a.id === WOHNUNG_SPLIT_ANNOTATION_ID);
  return ai === -1 ? Infinity : ai;
}

const WOHNUNG_VOR_SPLIT_FILTER = (a, ai) => a.station === 0 && ai < wohnungSplitAi();
const RUE_NOTRE_DAME_FILTER = (a, ai) => a.station === 0 && ai >= wohnungSplitAi();

// Wählt für "Lokal in der Nähe…" bzw. "Rue Notre-Dame de Lorette" den
// passenden Positions-Filter; für einen Ort, bei dem laut GEDANKEN_ZIEL_ORT
// noch ein oder mehrere gedachte Orte mitzählen sollen, ein Set aus ihm
// selbst plus diesen; für alle anderen Orte den ortBasis-String selbst
// (Standardverhalten von zaehleAnnotationenLiveNachOrtBasis).
function wohnungFilterFuerOrt(ort) {
  if (ort === WOHNUNG_SAMMELPUNKT_ANKER) return WOHNUNG_VOR_SPLIT_FILTER;
  if (ort === RUE_NOTRE_DAME_DE_LORETTE_ORT) return RUE_NOTRE_DAME_FILTER;
  let gedankenQuellen = Object.keys(GEDANKEN_ZIEL_ORT).filter(quelle => GEDANKEN_ZIEL_ORT[quelle] === ort);
  if (gedankenQuellen.length > 0) return new Set([ort, ...gedankenQuellen]);
  return ort;
}

// Ordnet jedem Gedanken-Spalte-Eintrag genau die eine Annotation zu, die
// dahintersteckt. Der ortBasis-Wert reicht dafür aus (er hat dort ohnehin
// nur eine Annotation).
const GEDANKEN_FILTER = {
  'Champs-Élysées / Avenue du Bois de Boulogne': 'Champs-Élysées / Avenue du Bois de Boulogne',
  'Afrika (Erinnerung, Militärdienst)': 'Afrika',
  'Bois de Boulogne, Paris': 'Bois de Boulogne',
  'Parc Monceau, Paris': 'Parc Monceau',
  'imaginierter Sommergarten, Paris': 'imaginierter Sommergarten',
};

// Mehrere ortRuns tragen exakt den ortBasis-Wert, der oben schon einer
// Gedanken-Spalte zugeordnet ist (Champs-Élysées/Bois de Boulogne, Afrika,
// Bois de Boulogne, Parc Monceau, imaginierter Sommergarten) — diese ortRuns
// bekommen deshalb keinen eigenen wachsenden Kreis auf der Karte/Spine
// (siehe zeichneKreiseOrtRuns), sondern zählen stattdessen bei dem echten
// Ort mit, an dem Duroy sich in diesem Moment tatsächlich aufhält (siehe
// GEDANKEN_ZIEL_ORT/wohnungFilterFuerOrt) — nicht in einem separaten Kreis.
const GEDANKEN_ORTRUN_UNTERDRUECKT = new Set(
  Object.values(GEDANKEN_FILTER).filter(v => typeof v === 'string')
);

// Wohin eine gedachte/erinnerte/erträumte Annotation für die Kreiszählung
// zählt: der jeweils letzte ECHTE Ort vor ihr innerhalb derselben
// "station"-Gruppe (aus kapitel01-stationen.json annotationen[].station
// ermittelt) — Duroy ist an diesem Ort physisch anwesend, während ihm der
// gedachte Ort durch den Kopf geht.
//   'Champs-Élysées / Avenue du Bois de Boulogne' (station 100, ai 67):
//     zwischen Rue La Fayette und Boulevard des Italiens → Boulevard
//     Poissonnière (letzter echter Ort davor).
//   'Afrika' (station 101, ai 145-147): zwischen Place de la Madeleine und
//     Boulevard des Capucines → Place de la Madeleine.
//   'Bois de Boulogne'/'Parc Monceau'/'imaginierter Sommergarten' (station 5,
//     ai 245-247): zwischen Café Américain und Bal Musard → Café Américain.
const GEDANKEN_ZIEL_ORT = {
  'Champs-Élysées / Avenue du Bois de Boulogne': 'Boulevard Poissonnière',
  'Afrika': 'Place de la Madeleine',
  'Bois de Boulogne': 'Café Américain',
  'Parc Monceau': 'Café Américain',
  'imaginierter Sommergarten': 'Café Américain',
};

// Liefert die ortRun-Namen, die einen eigenen Spine-Eintrag bekommen: jeden
// Kartenkreis (siehe zeichneKreiseOrtRuns in sketch.js), unter Ausschluss der
// absorbierten Wohnung-Mini-Erwähnungen UND der Gedanken-Orte (siehe
// GEDANKEN_ORTRUN_UNTERDRUECKT/GEDANKEN_ZIEL_ORT — die zählen bei ihrem
// echten Ort mit, bekommen aber keinen eigenen Spine-Eintrag).
// WOHNUNG_SAMMELPUNKT_ABSORBIERTE_ORTRUNS/GEDANKEN_ORTRUN_UNTERDRUECKT sind
// reine Namens-Sets ohne Kapitelbezug (siehe deren eigene Kommentare) — nur
// für Kapitel 1 (daten === stationenData) ausschliessen, sonst kann ein
// automatisch gebautes Kapitel zufällig denselben ortBasis-Namen für einen
// eigenen, echten Ort verwenden (z.B. Kapitel 3s "Parc Monceau") und würde
// hier fälschlich mit unterdrückt — derselbe Fallstrick wie bei
// zeichneKreiseOrtRuns in sketch.js, dort schon so gegated.
function ortRunsFuerSpine(daten) {
  let istKapitel1 = daten === stationenData;
  return new Set(
    (daten.ortRuns || [])
      .map(r => r.ort)
      .filter(ort => !istKapitel1 || (!WOHNUNG_SAMMELPUNKT_ABSORBIERTE_ORTRUNS.has(ort) && !GEDANKEN_ORTRUN_UNTERDRUECKT.has(ort)))
  );
}

// Benannte Scroll-Meilensteine (Anteil 0..1 der gesamten Scrollstrecke) —
// ersetzen die zuvor verstreuten Magic Numbers in sketch.js' draw().
//
// Die Scrollstrecke wurde von 2200vh über 2640vh auf jetzt 3080vh verlängert
// (neue Akte: Rauszoomen auf die Gesamtkarte, danach Übersichtsrouten
// zeichnen). Alle bisherigen Werte sind erneut umskaliert (Faktor 2640/3080),
// damit sich an ihrer absoluten Scroll-Position (in vh) nichts ändert.
// Scrollstrecke zuletzt von 3080vh auf 4080vh verlängert — alle Werte BIS
// uebersichtRoutenStart wurden um den Faktor 3080/4080 (0.754902)
// zurückskaliert, damit sich an ihrer absoluten vh-Position nichts ändert.
// uebersichtRoutenEnd bleibt bewusst bei 1.0: der komplette gewonnene
// Platz (1000vh) geht an diesen letzten Akt, macht das Ablaufen der
// Kapitelrouten also entsprechend langsamer.
//
// (Zwischenzeitlich testweise auf 5880vh mit einem eigenen Kapitel-Zoom-
// Scroll-Akt erweitert — wieder verworfen: Kapitel-Zoom soll sich sofort
// mit voll sichtbarer Route öffnen (Klick), nicht per Scroll enthüllen.
// Verlassen des Zooms geschieht durch Zurückscrollen VOR
// uebersichtRoutenStart, siehe oeffneKapitelZoom/schliesseKapitelZoom in
// sketch.js — dafür reicht der bestehende uebersichtRoutenFortschritt<=0-
// Check, kein eigener Akt nötig.)
//
// Scrollstrecke NOCH EINMAL von 4080vh auf 6080vh verlängert (neuer,
// letzter Akt: Kreisvergleich handverlesener, kapitelübergreifender Orte,
// siehe kreisvergleich-orte.json/baue-kreisvergleich.py) — alle Werte BIS
// uebersichtRoutenEnd wurden um den Faktor 4080/6080 (0.671053)
// zurückskaliert. uebersichtRoutenEnd (jetzt 0.671053 statt 1.0) markiert
// zugleich den Start des neuen Akts (kreisVergleichStart) — die
// Übersichtskarte blendet dort aus, danach wachsen die Kreise der 8 Orte
// mit jedem erreichten Kapitel (kreisVergleichAktuellesKapitel in
// sketch.js).
const SCROLL_MEILENSTEINE = {
  heroFadeStart: 0.012468, heroFadeEnd: 0.037403,
  // Zwischen heroFadeEnd und zoomStart 700vh zusätzliche Lesezeit — der
  // Begleittext ("1885 wächst Paris…", data-von/data-bis in index.html)
  // bleibt dadurch noch auf der Startseite lesbar und blendet erst während
  // dieses Zoom-Übergangs wieder aus (sein data-bis fällt mit zoomEnd
  // zusammen).
  zoomStart: 0.116741, zoomEnd: 0.166610,
  // Spine blendet gleichzeitig mit dem Zoom-Beginn ein (nicht mehr mit dem
  // Begleittext synchron — der lebt jetzt bereits auf der Startseite).
  spineFadeStart: 0.119234, spineFadeEnd: 0.169103,
  // Zwischen zoomEnd und routeStart 550vh zusätzliche Lesezeit — der
  // Kapitel-Einstiegstext (.begleittext-dunkel, eigenes data-von/data-bis
  // pro Kapitel in index.html) blendet mit dem Kartenausschnitt ein
  // (data-von = zoomEnd) und wieder aus, sobald Route/Annotationen
  // beginnen (data-bis = routeStart).
  routeStart: 0.266350, routeEnd: 0.391024,
  // Akt: nach Abschluss der Route zurück auf die Gesamtkarte zoomen.
  zoomOutStart: 0.391024, zoomOutEnd: 0.440893,
  // Akt: Übersichtsrouten (Kapitel 02–18) bauen sich auf. Breite (2933vh)
  // so bemessen, dass auch das annotationsreichste Kapitel (Kapitel 8,
  // 400 Annotationen) im gleichen Tempo (~7.3vh/Annotation) durchläuft wie
  // Kapitel 1 (1100vh / 150 Annotationen) — vorher war der Akt mit 1440vh
  // fest für alle Kapitel gleich lang, wodurch annotationsreiche Kapitel
  // (5–9) beim Scrollen spürbar schneller wirkten als Kapitel 1.
  uebersichtRoutenStart: 0.440893, uebersichtRoutenEnd: 0.773320,
  // Neuer, letzter Akt (2000vh): Übersichtskarte blendet aus (erste 8% des
  // Akts, kreisVergleichFadeEnd), danach wachsen die Kreise der 8
  // handverlesenen Orte mit jedem erreichten Kapitel (1..18, linear über
  // den Rest des Akts verteilt).
  kreisVergleichStart: 0.773320, kreisVergleichFadeEnd: 0.791567,
  kreisVergleichEnd: 1.0,
};

// ---------------------------------------------------------------------------
// Datenbereinigung (läuft einmal in setup(), bevor gezeichnet wird)
// ---------------------------------------------------------------------------

function bereinigeStationenDaten(rohdaten) {
  const arrayFuer = (wert) => Array.isArray(wert) ? wert : Object.values(wert || {});

  rohdaten.route = arrayFuer(rohdaten.route);
  rohdaten.gedanken = arrayFuer(rohdaten.gedanken);
  rohdaten.markierungen = arrayFuer(rohdaten.markierungen);
  rohdaten.routenPunkte = arrayFuer(rohdaten.routenPunkte);
  rohdaten.annotationen = arrayFuer(rohdaten.annotationen).filter(a => !a.deaktiviert);
  rohdaten.ortRuns = arrayFuer(rohdaten.ortRuns);

  return rohdaten;
}

function bereinigeFotoMarker(rohdaten) {
  return Array.isArray(rohdaten) ? rohdaten : Object.values(rohdaten || {});
}

// kreisvergleich-orte.json (siehe baue-kreisvergleich.py) — wie bei
// fotomarker.json kann p5s loadJSON ein Root-Array als Objekt mit
// numerischen Keys statt als echtes Array zurückgeben; ebenso für das
// verschachtelte "kapitel"-Array pro Ort.
function bereinigeKreisVergleichOrte(rohdaten) {
  return (Array.isArray(rohdaten) ? rohdaten : Object.values(rohdaten || {})).map(ort => ({
    ...ort,
    kapitel: Array.isArray(ort.kapitel) ? ort.kapitel : Object.values(ort.kapitel || {}),
  }));
}

// Übersichtsrouten (Kapitel 02–18, echte Strassenrouten via OSMnx aus den
// GeoJSONs berechnet, siehe data-prep/05 bereinigen/baue-uebersichtsrouten.py).
// Kapitel ohne verwertbare Route (z.B. 15 — Empfang bei den Walters, ein
// einziger Innenraum-Schauplatz ohne Koordinaten-Streuung) werden hier
// herausgefiltert, damit sketch.js nur echte Linien zeichnet.
function bereinigeUebersichtsrouten(rohdaten) {
  let bereinigt = {};
  Object.entries(rohdaten || {}).forEach(([kapitel, punkte]) => {
    if (Array.isArray(punkte) && punkte.length > 1) bereinigt[kapitel] = punkte;
  });
  return bereinigt;
}

// ---------------------------------------------------------------------------
// Kreis-Radius / Kreispunkte
// ---------------------------------------------------------------------------

// Flaechenproportional statt radiusproportional (Standard bei proportional
// symbol maps): die Flaeche eines Kreises soll linear mit n wachsen, also
// muss der Radius mit sqrt(n) wachsen. Verhindert, dass grosse Unterschiede
// (z.B. 31 vs. 12 Annotationen) am Deckel optisch verschwinden, wie es bei
// einer linearen r = BASIS + n*MULT-Formel mit niedrigem Deckel passiert.
function kreisRadius(n) {
  const BASIS = 6, K = 11.5, MAX = 100;
  return n > 0 ? Math.min(MAX, BASIS + K * Math.sqrt(n)) : 0;
}

// Manche ortRuns-Einträge tragen den Namen eines späteren Halteorts, werden
// aber schon an einer früheren Stelle im Text (mit deren revealIndex/Koordinate)
// nur erwähnt/vorausgedacht, nicht real besucht (z.B. "Folies Bergère" wird im
// Café Napolitain-Gespräch erwähnt, aber erst viel später real erreicht).
// Solche vorzeitigen Erwähnungen bekommen auf der Route keinen eigenen Kreis,
// da die Station an ihrem echten Halt ohnehin schon einen Kreis zeichnet.
function istVorzeitigeErwaehnung(r, daten = stationenData) {
  let halteort = (daten.halteorte || []).find(h => h.name === r.ort);
  return !!halteort && halteort.revealIndex !== r.revealIndex;
}

// Zählt (per d3.rollup), wie viele Annotationen zu ortBasis (String oder Set
// mehrerer ortBasis-Werte, oder eine konkrete Annotations-id) bereits an
// Reihenfolge-Position annIndex erreicht sind — dieselbe Logik, nach der die
// Kreise in der Spine wachsen. Wird auch auf der Route (Hauptorte) und in
// der Gedanken-Spalte verwendet, damit alle Darstellungen gleich schnell
// wachsen statt sofort voll zu erscheinen.
// Valenz (a.valenz: 1/-1/0/fehlt) auf denselben neg/pos/neutral/unrated-
// Bucket abgebildet wie die Python-Pipeline (valenz_bucket() in
// baue-kapitel-stationen.py) — musste bislang nirgends in JS nachgebildet
// werden, da die (vorberechneten) bandCounts in den ortRuns/Kreisvergleich-
// Daten bereits fertig gebucketed aus Python kommen. zaehleAnnotationenLive-
// NachOrtBasis() ist die einzige Stelle, die bandCounts LIVE aus den rohen
// Annotationen selbst zusammenzählt (fürs Live-Wachsen beim Scrollen) —
// bucketed bislang fälschlich alles nach "unrated", ungeachtet der echten
// Valenz (Bug: die neuen Valenz-Halbkreise auf der Karte blieben dadurch
// immer bei Radius 0, weil bc.neg/bc.pos nie befüllt wurden).
function valenzBucket(v) {
  if (v === 1) return 'pos';
  if (v === -1) return 'neg';
  if (v === 0) return 'neutral';
  return 'unrated';
}

// Rohe Annotationen (nicht aggregiert), die zu filter/annIndex passen —
// dieselbe Trefferlogik wie zaehleAnnotationenLiveNachOrtBasis (die daraus
// die bandCounts aufsummiert), aber als Liste statt als Zählung. Wird u.a.
// für die F-Wert-Punkte gebraucht, die pro Annotation (nicht aggregiert)
// ausserhalb des Kreisdiagramms sitzen (siehe zeichneFwertPunkte in
// sketch.js) — jede Annotation dort braucht ihre eigene Valenz/ihren
// eigenen fWertType, den eine reine Zählung nicht mehr hergibt.
function sammleAnnotationenNachOrtBasis(filter, annIndex, daten = stationenData) {
  let ortBasisWerte = filter instanceof Set ? filter : new Set([filter]);
  return daten.annotationen.filter((a, ai) => {
    if (ai > annIndex) return false;
    let treffer = typeof filter === 'function' ? filter(a, ai)
      : typeof filter === 'number' ? a.id === filter
      : ortBasisWerte.has(a.ortBasis || a.ort || '');
    return treffer && a.category;
  });
}

function zaehleAnnotationenLiveNachOrtBasis(filter, annIndex, daten = stationenData) {
  let sichtbareTreffer = sammleAnnotationenNachOrtBasis(filter, annIndex, daten);
  let ergebnis = {
    gold_dunkel: { unrated: 0, neg: 0, pos: 0, neutral: 0 },
    gold_mittel: { unrated: 0, neg: 0, pos: 0, neutral: 0 },
    gold_hell: { unrated: 0, neg: 0, pos: 0, neutral: 0 },
  };
  sichtbareTreffer.forEach(a => {
    ergebnis[a.category][valenzBucket(a.valenz)]++;
  });
  return ergebnis;
}

// ---------------------------------------------------------------------------
// Spine-Daten
// ---------------------------------------------------------------------------

// daten: ein bereinigtes stationenData-Objekt (Kapitel 1 oder ein anderes
// Kapitel). hauptorte: Set der ortRun-Namen, die einen Spine-Eintrag
// bekommen sollen. opts.parisAllgemein (Default leer): Set von Ortsnamen,
// die zu einem gemeinsamen "Paris allgemein"-Eintrag zusammengefasst werden
// (siehe Kapitel 1).
//
// Läuft (anders als früher) direkt über daten.annotationen statt über die
// bereits zu je einem Kreis pro Ort ZUSAMMENGEFÜHRTEN daten.ortRuns — nur
// so lässt sich erkennen, ob ein Ort SPÄTER, nach einer Unterbrechung durch
// andere Orte, noch einmal auftaucht (eine echte Rückkehr, siehe
// zeichneSpineHorizontal in sketch.js: bekommt dort keinen zweiten Kreis,
// sondern einen Bogen zurück zum ersten). Jeder ZUSAMMENHÄNGENDE Lauf
// gleicher ortBasis wird zu genau einem Eintrag; alle bandCounts werden nur
// noch live (über den jeweiligen annIndex zur Spielkopf-Position) gezählt,
// nicht mehr aus einem vorberechneten Endstand.
function baueSpineDaten(daten, hauptorte, opts = {}) {
  let parisAllgemein = opts.parisAllgemein || new Set();
  let eintraege = [];
  let indexNachSchluessel = new Map(); // Schlüssel (Ortsname oder Paris-Pseudo-Schlüssel) -> Index in eintraege
  let laufenderSchluessel = null; // welcher zusammenhängende Besuch gerade läuft

  (daten.annotationen || []).forEach((a, ai) => {
    let ort = a.ortBasis || a.ort || '';
    let istParis = parisAllgemein.has(ort);
    if (!istParis && !hauptorte.has(ort)) { laufenderSchluessel = null; return; }

    let schluessel = istParis ? ' PARIS_ALLGEMEIN' : ort;
    if (laufenderSchluessel === schluessel) return; // derselbe Besuch läuft weiter, kein neuer Eintrag
    laufenderSchluessel = schluessel;

    if (indexNachSchluessel.has(schluessel)) {
      // Paris allgemein bleibt bewusst EIN gemeinsamer Eintrag (zu vage für
      // eine sinnvolle "Rückkehr" pro einzelner Wiederaufnahme) — jede
      // Wiederaufnahme wird hier still absorbiert, statt einen Bogen zu
      // bekommen.
      if (istParis) return;
      eintraege.push({ typ: 'rueckkehr', text: ort, rv: ai, zielIndex: indexNachSchluessel.get(schluessel) });
    } else {
      indexNachSchluessel.set(schluessel, eintraege.length);
      eintraege.push({
        typ: istParis ? 'muted' : 'location',
        text: istParis ? 'Paris allgemein' : ort,
        rv: ai,
        ortBasis: istParis ? parisAllgemein : ort,
      });
    }
  });

  return eintraege;
}

// ---------------------------------------------------------------------------
// Wiederverwendbares Werkzeug (additiv, aktuell ungenutzt) — verteilt Punkte
// mit (fast) identischen Koordinaten leicht versetzt auf einen kleinen Kreis,
// damit künftige Kapitel überlappende Marker nicht händisch per
// Ausschluss-Liste lösen müssen. Wird auf die bestehende Darstellung NICHT
// angewendet (die ist bereits über WOHNUNG_SAMMELPUNKT_* / istVorzeitigeErwaehnung
// gelöst) — reine Vorbereitung für spätere Kapitel.
// ---------------------------------------------------------------------------

function versetzeKollidierendePunkte(punkte, mindestabstandGrad = 0.00005) {
  let gruppen = d3.group(punkte, p => `${Math.round(p.lon / mindestabstandGrad)}:${Math.round(p.lat / mindestabstandGrad)}`);
  let ergebnis = [];
  gruppen.forEach(gruppe => {
    if (gruppe.length === 1) {
      ergebnis.push({ ...gruppe[0], versatzWinkel: 0, versatzIndex: 0, versatzAnzahl: 1 });
      return;
    }
    gruppe.forEach((p, i) => {
      ergebnis.push({ ...p, versatzWinkel: (i / gruppe.length) * Math.PI * 2, versatzIndex: i, versatzAnzahl: gruppe.length });
    });
  });
  return ergebnis;
}
