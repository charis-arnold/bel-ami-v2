/* =============================================================================
   sketch.js — p5-Zeichnung für Bel-Ami v2
   Datenaufbereitung und Darstellung sind getrennt gehalten.
============================================================================= */

const HATCH_SPACING = 3;

let stage, heroText, begleitTexte, kapitelEinstiegsTexte;
let annotationBoxEl; // #annotationBox — trägt die Platz-Klasse, siehe annotationBoxPlatz()
let schlusstextEl;   // #schlusstext — Gegenstück zum Einstiegstext, blendet im Schlussakt ein
let naechstesKapitelEl; // #naechstesKapitel — Hinweis am Kapitelende, siehe draw()

// Nummer des folgenden Kapitels, oder null wenn es keines gibt (Kapitel 18 ist
// das letzte). Kapitel 1 hat seinen eigenen Scroll-Akt und ist hier nicht
// gemeint — der Hinweis gilt für die klickbaren Kapitel 02–18.
function naechstesKapitel(nr) {
  if (!nr) return null;
  let ziel = String(parseInt(nr, 10) + 1).padStart(2, '0');
  return kapitelKarten[ziel] ? ziel : null;
}
// Kapitel 02–18 öffnen sich per Klick (springeZuKapitelZoom/oeffneKapitelZoom),
// nicht scroll-gebunden wie Kapitel 1 — daher kein data-von/data-bis-Fenster
// möglich. Stattdessen ein fester Zeitfenster-Fade ab dem Klick-Zeitpunkt
// (kapitelEinstiegsStartMillis), siehe draw().
let kapitelEinstiegsStartMillis = null;
const KAPITEL_EINSTIEG_FADE_MS = 800;
// Der Einstiegstext blendet von selbst EIN (zeitbasiert, ab Klick-Zeitpunkt),
// danach übernimmt das Scrollen: zwischen diesen beiden Anteilen des
// Kapitel-Akts (uebersichtRoutenStart..uebersichtRoutenEnd) blendet er aus,
// und erst danach beginnen Route, Kreise und Annotationsbox. Vorher lief das
// über ein festes Zeitfenster von 14 Sekunden — der Text verschwand also auch
// dann, wenn man ihn noch las, und die Route startete ohne Zutun.
const KAPITEL_EINSTIEG_SCROLL_START = 0.015;
const KAPITEL_EINSTIEG_SCROLL_ENDE = 0.06;
// bgImage: Startseite/erste Übersicht vor dem Zoom in Kapitel 1
// (paris-startkarte-web.png). bgImage2: "zweite" Übersichtskarte, die nach
// dem Rauszoomen aus Kapitel 1 gezeigt wird (Übersichtsrouten- und
// Kreisvergleich-Akt, paris-ueberblickkarte-web.png). Beide stammen aus
// demselben QGIS-Ausschnitt und haben dieselben Pixelmasse, teilen sich also
// Bbox (uebersichtBbox) und Crop-Rechenweg — es wechselt nur, welches Bild
// gezeichnet wird (siehe currentBgImage in draw()).
let bgImage, bgImage2, ch1Image;
let gedankenColumn, kartenMarkierungenEl;
let stationenData;
let kapitel03Data; // eigenes Datenset fürs Kapitel-3-Spine-Panel (Kartenausschnitt-Zoom)

// Automatische Erstentwurf-Datensätze für Kapitel 2, 4–18 (siehe
// data-prep/05 bereinigen/baue-kapitel-stationen.py) — geladen, aber noch
// nirgends im Draw-Loop verwendet; das Verdrahten von Spine-Panel/Kreisen
// pro Kapitel (wie bisher nur für Kapitel 3) folgt in einem Folgeschritt.
const WEITERE_KAPITEL_NUMMERN = ['02', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18'];
let weitereKapitelDaten = {}; // z.B. weitereKapitelDaten['04'].ortRuns
let gedankenEintraege = [];
let markierungsEintraege = [];
let stationsMarker = [];
let zwischenMarker = [];
let annotationText;
let annotationInner;
let annotationTag;
let annotationBar;
let fotoPopup, fotoPopupTitel, fotoPopupPlz, fotoPopupBild, fotoPopupBeschreibung;
let scrollFortschritt, scrollFortschrittFuellung; // Fortschrittsleiste unten (Übersicht Scrollytelling-Hauptstrang) — ausgeblendet während einer Kapitel-Ansicht (siehe kapitelAnsichtsModus)
let kapitelRegister; // Kapitelregister links (inkl. Plan/Graph + Alle), sichtbar während eines Kapitel-Zooms
let kapitelRegisterEintraege = {}; // nr -> Eintrags-Element, fürs Aktiv-Highlighting in draw()
let planEintrag, graphEintrag; // "Plan"/"Graph"-Hälften oben im Register, fürs Aktiv-Highlighting in draw()
let modusZeile, leerzeile, alleEintrag; // Plan/Graph-Zeile + Abstandshalter + "Alle" — in der Übersicht (kein Kapitel gezoomt) blendet draw() modusZeile/leerzeile aus und markiert alleEintrag als aktiv
let orteOhneAdresse; // Platzhalter-Box unterhalb des Kapitelregisters, liefert die Bildschirmposition für zeichneOrteOhneAdresse()
let legendeBox; // Register-Container (Tab+Inhalt), mitte rechts — sichtbar wie kapitelRegister (Plan UND Graph)
let legendeValenzText, legendeValenzKreis; // Valenz-Zeile der Legende — Text/Symbol wechseln je Ansicht (siehe draw())
const LEGENDE_VALENZ_KARTE = 'Volltonfarbe: links negativ, rechts positiv bewertet';
const LEGENDE_VALENZ_GRAPH = 'Volltonfarbe: oben positiv, unten negativ bewertet';
let legendeFwertHinweis; // Positions-Hinweis der F-Wert-Punkte — ebenfalls ansichtsabhängig
const LEGENDE_FWERT_KARTE = 'Position ausserhalb des Kreises: negativ oben links, positiv oben rechts, neutral/unbewertet unten.';
const LEGENDE_FWERT_GRAPH = 'Position ausserhalb des Kreises: positiv oben, negativ unten, neutral/unbewertet rechts.';
let legendeTab, legendeInhalt; // Tab (vertikal beschriftet, immer sichtbar solang legendeBox.sichtbar) + ausfahrender Inhalt (Farberklärung der Kreisgrafik)
let prologBox, prologTab; // Zweites Register direkt unter Legende (siehe #registerTabs in index.html) — gleiches Verhalten wie Legende, eigener (statischer, hart codierter) Inhalt Projekt-Hintergrund
let registerTabs; // gemeinsamer Fixed-Container beider Register (siehe #registerTabs in index.html) — trägt die legende-offen/prolog-offen-Klasse, an der sich der jeweils GESCHLOSSENE Tab orientiert, um mit ausrücken zu können (siehe CSS)

// Jede Kapitel-Ansicht (1–18) hat zwei Modi: 'karte' (Kartenausschnitt+Route,
// wie bisher) und 'grafik' (horizontale Spine, zentriert, mit Play-Animation
// statt Karte — siehe zeichneSpineHorizontal). Umschalten über die
// "Plan"/"Graph"-Einträge oben im Kapitel-Menübalken
// (setzeKapitelAnsichtModus).
let kapitelAnsichtsModus = 'karte';
// Zoomstand des Kapitel-1-Kartenausschnitts (0 = Startseite/Gesamtkarte,
// 1 = ganz im Ausschnitt), je Frame in draw() gesetzt. Wird ausserhalb von
// draw() gebraucht, um die Beschriftung des Routen-Startpunkts erst mit dem
// Kapitel einzublenden (siehe zeichneKreiseOrtRuns).
let kapitel1ZoomAmount = 0;
let grafikPlayButton;
let grafikSpielt = false;       // läuft die Wachstums-Animation gerade?
let grafikStartZeit = 0;        // millis() bei Play-Start (bzw. rechnerisch zurückversetzt bei Resume)
let grafikFortschritt = 0;      // 0..1, letzter berechneter Animationsstand (bleibt bei Pause stehen)
// millis() beim Play-Klick in der Graph-Ansicht. Der Kapitel-Einstiegstext
// blendet in der Kartenansicht über das Scrollen aus (siehe
// KAPITEL_EINSTIEG_SCROLL_START/ENDE) — in der Graph-Ansicht gibt es dafür
// keinen Scroll, dort weicht er stattdessen dem Play: sobald die Animation
// startet, blendet er weg und bleibt weg (auch bei Pause), bis das Kapitel
// oder der Ansichtsmodus wechselt. null = noch kein Play in dieser Ansicht.
let grafikPlayAusblendStart = null;

// Georeferenz beider Übersichtskarten (Startseite und Überblickseite). Sie
// stammen aus demselben QGIS-Ausschnitt und haben auch dieselben Pixelmasse,
// teilen sich also eine Bbox. Exakte Werte aus QGIS (EPSG:3857:
// X 247907.651 .. 270857.651, Y 6244994.107 .. 6256724.107), umgerechnet mit
// derselben Web-Mercator-Formel wie die Kapitelkarten (siehe BASIS_3857/
// x2lon/y2lat in data-prep/05 bereinigen/schneide-kapitelkarten.py) — damit
// liegen Übersichts- und Kapitelkarten auf derselben Grundlage.
// Auf beiden Bildern gegengeprüft, indem bekannte Fixpunkte darauf projiziert
// wurden: Gare Saint-Lazare landet auf dem Gleisfächer, Concorde am
// Tuilerien-Rand, Madeleine auf ihrem Kirchenblock.
// startBbox — paris-startkarte-web.png. Exakte Georeferenz aus QGIS
// (EPSG:3857: X 247907.651 .. 270857.651, Y 6244994.107 .. 6256724.107).
//
// Zwischenzeitlich standen hier X 247340.000 / Y 6245109.800 (568 m weiter
// westlich, 116 m weiter nördlich). Gegenprobe: dieselbe Kapitelroute auf
// dasselbe Bild projiziert folgt mit den Werten unten exakt den Strassen,
// mit den anderen läuft sie quer durch die Häuserblöcke und schneidet die
// Tuilerien — auf 6000px Bildbreite ein Versatz von 148px. Falls doch ein
// Export mit jenem Ausschnitt existiert, gehören die Werte zu DEM Bild,
// nicht zu diesem.
let startBbox = { west: 2.2269923194085774, east: 2.4331556771226127, south: 48.82366665448583, north: 48.892993566082404 };
// uebersichtBbox — paris-ueberblickkarte-web.png, unverändert.
let uebersichtBbox = { west: 2.2269923194085774, east: 2.4331556771226127, south: 48.82366665448583, north: 48.892993566082404 };
let ch1ImgBbox = { west: 2.317834413581757, east: 2.352393886019969, south: 48.86683338890839, north: 48.881871498351956 };

let mapOffsetX = -250;
let mapOffsetY = 0;

// --- Foto-Marker (separate, additive Ebene — Fotobank Huma-Num/FNP) ---
let fotoMarkerListe = [];
let letzteActiveBbox = null;
let letzterFotoOffsetX = mapOffsetX, letzterFotoOffsetY = mapOffsetY; // fürs Hit-Testing in mousePressed
const FOTO_MARKER_TREFFER_RADIUS = 12;

// --- Übersichtsrouten (Kapitel 02–18, nur in der letzten, rausgezoomten Ansicht) ---
let uebersichtsRouten = {};

// --- Kreisvergleich (letzter Akt): 8 handverlesene, kapitelübergreifende
// Orte, siehe data-prep/05 bereinigen/baue-kreisvergleich.py. Jeder Eintrag:
// { name, kapitel: [{nr, bandCounts}, ...] } — kapitel ist chronologisch
// sortiert und enthält nur Kapitel, in denen der Ort tatsächlich vorkommt.
let kreisVergleichOrte = [];

// --- Kapitelausschnitte: Startpunkt/Nummer einer Übersichtsroute wird zum
// Link, der auf den eigenen Kartenausschnitt dieses Kapitels zoomt. Nur
// Kapitel, die hier einen Eintrag haben, sind klickbar — das sind exakt die
// Kapitel, für die "kapitel karten/kapitelXX-{karte.png,bbox.json}"
// existiert (aktuell alle außer 01 — das hat sein eigenes, handverfeinertes
// System, siehe kapitel01-qgis-karte-web.png/stationenData). vAnchor/hAnchor
// (optional, siehe coverCrop):
// verschieben den sichtbaren Ausschnitt vertikal bzw. horizontal innerhalb
// des Kapitelbilds, ohne die zugrundeliegende karte.png/bbox.json neu
// rendern zu müssen (0 = oberster/linker Bildrand sichtbar, 1 = unterster/
// rechter Bildrand sichtbar, 0.5 = zentriert, Default). Kapitel 3s
// Routenanfang liegt z.B. nahe am Nordrand seiner Bbox — ohne vAnchor-Bias
// würde der zentrierte Bildausschnitt genau dort beschneiden.
// Kapitel 17 hatte lange keinen eigenen Ausschnitt: seine Route reichte bis
// Saint-Germain-en-Laye, weit ausserhalb des Basisbilds. Seit die Landpartie
// zu EINEM Sammelpunkt am Westrand des Bois zusammengefasst ist (kurz vor dem
// Seineübergang) und La Roche-Guyon wie Cannes/Rouen als Ersatzpunkt dort
// sitzt, wo die Stadt verlassen wird, liegt das ganze Kapitel im Bild — es
// bekommt daher wie alle anderen einen eigenen Ausschnitt.
// Kapitel 06, 07, 09 und 10 bleiben nach der Literaturwissenschafts-Korrektur
// der ortRuns/Route vollständig innerhalb von Paris (kein Bahnhof/Verlassen
// der Stadt mehr — weit entfernte Handlungsorte wie "Bois du Vésinet" in
// Kapitel 07 oder "Fahrt über Rouen nach Canteleau..." in Kapitel 09 sind
// symbolisch an den Kartenrand gesetzt statt an ihre echten, weit
// entfernten Koordinaten; Kapitel 10 spielt ohnehin komplett in Paris,
// inkl. Bois de Boulogne) und bekommen daher einen eigenen, eng um die
// tatsächliche Route zugeschnittenen Kartenausschnitt.
const OHNE_EIGENEN_KARTENAUSSCHNITT = [];
let kapitelKarten = {
  '02': { bild: null, bboxRaw: null },
  '03': { bild: null, bboxRaw: null, vAnchor: 0.15 },
  '04': { bild: null, bboxRaw: null },
  '05': { bild: null, bboxRaw: null },
  '06': { bild: null, bboxRaw: null },
  '07': { bild: null, bboxRaw: null },
  '08': { bild: null, bboxRaw: null },
  '09': { bild: null, bboxRaw: null },
  '10': { bild: null, bboxRaw: null },
  '11': { bild: null, bboxRaw: null },
  '12': { bild: null, bboxRaw: null },
  '13': { bild: null, bboxRaw: null },
  '14': { bild: null, bboxRaw: null },
  '15': { bild: null, bboxRaw: null },
  '16': { bild: null, bboxRaw: null },
  '17': { bild: null, bboxRaw: null },
  '18': { bild: null, bboxRaw: null },
};
let zoomedKapitel = null;      // z.B. '03', oder null (Übersicht)
let kapitelZoomAmount = 0;     // 0 = Übersicht, 1 = voll in Kapitelausschnitt gezoomt
let kapitelHover = null;       // Kapitelnummer unter der Maus (fürs Cursor/Highlight)
let letzterZoomKapitel = null; // bleibt waehrend des Ausblendens gesetzt, siehe draw()

// Liefert das (bereinigte) stationenData-Objekt für eine Kapitelnummer
// (String, zweistellig) — Kapitel 3 liegt in seiner eigenen Variable
// (kapitel03Data), alle anderen (02, 04–18) in weitereKapitelDaten.
function datenFuerKapitel(nr) {
  return nr === '03' ? kapitel03Data : weitereKapitelDaten[nr];
}

function preload() {
  bgImage = loadImage('paris-startkarte-web.png');
  bgImage2 = loadImage('paris-ueberblickkarte-web.png');
  ch1Image = loadImage('kapitel01-qgis-karte-web.png');

  const kapitelDatenDateien = [
    { nr: '01', ziel: 'stationenData' },
    { nr: '03', ziel: 'kapitel03Data' },
    ...WEITERE_KAPITEL_NUMMERN.map(nr => ({ nr, ziel: nr }))
  ];

  kapitelDatenDateien.forEach(({ nr, ziel }) => {
    const datei = `kapitel${nr}-stationen.json`;
    if (ziel === 'stationenData') stationenData = loadJSON(datei);
    else if (ziel === 'kapitel03Data') kapitel03Data = loadJSON(datei);
    else weitereKapitelDaten[ziel] = loadJSON(datei);
  });

  fotoMarkerListe = loadJSON('fotomarker.json');
  uebersichtsRouten = loadJSON('kapitel-routen-uebersicht.json');
  kreisVergleichOrte = loadJSON('kreisvergleich-orte.json');

  Object.keys(kapitelKarten).forEach(nr => {
    if (OHNE_EIGENEN_KARTENAUSSCHNITT.includes(nr)) return;
    // Ordnername "kapitel karten" enthält ein Leerzeichen — explizit als
    // %20 kodiert, damit loadImage/loadJSON (fetch-basiert) den Pfad
    // zuverlässig auflösen, unabhängig vom Server/Browser-Verhalten.
    kapitelKarten[nr].bild = loadImage(`kapitel%20karten/kapitel${nr}-karte.png`);
    kapitelKarten[nr].bboxRaw = loadJSON(`kapitel%20karten/kapitel${nr}-bbox.json`);
  });
}

function bereinigeEingangsdaten() {
  [stationenData, kapitel03Data, ...WEITERE_KAPITEL_NUMMERN.map(nr => weitereKapitelDaten[nr])]
    .filter(Boolean)
    .forEach(daten => {
      bereinigeStationenDaten(daten);
    });

  fotoMarkerListe = bereinigeFotoMarker(fotoMarkerListe);
  uebersichtsRouten = bereinigeUebersichtsrouten(uebersichtsRouten);
  kreisVergleichOrte = bereinigeKreisVergleichOrte(kreisVergleichOrte);
}

// Öffnet EIN Register (Legende ODER Prolog) exklusiv (Akkordeon: das jeweils
// andere schliesst automatisch mit) und markiert den Zustand zusätzlich am
// gemeinsamen #registerTabs-Container. Daran hängt in style.css die Regel,
// die den TAB (nicht den Inhalt) des GESCHLOSSENEN Registers an dieselbe
// Kante mit ausfahren lässt wie das gerade geöffnete — sonst bliebe er am
// Bildschirmrand stehen, während der geöffnete Tab zur Inhaltskante
// wandert, und die beiden Tabs würden optisch auseinanderreissen.
function oeffneRegister(box, andererBox, eigeneKlasse, andereKlasse) {
  const warOffen = box.classList.contains('offen');
  box.classList.toggle('offen', !warOffen);
  andererBox.classList.remove('offen');
  registerTabs.classList.toggle(eigeneKlasse, !warOffen);
  registerTabs.classList.remove(andereKlasse);
}

function setup() {
  bereinigeEingangsdaten();

  stage = document.getElementById('scrollyStage');
  heroText = document.querySelectorAll('h1, h2, .lead, .scroll-hinweis');
  begleitTexte = document.querySelectorAll('.begleittext');
  kapitelEinstiegsTexte = document.querySelectorAll('.kapitel-einstiegstext');

  gedankenColumn = document.getElementById('gedankenColumn');
  kartenMarkierungenEl = document.getElementById('kartenMarkierungen');
  naechstesKapitelEl = document.getElementById('naechstesKapitel');
  naechstesKapitelEl.addEventListener('click', (ev) => {
    // stopPropagation: p5 hört mousePressed am Fenster ab — ohne das liefe
    // derselbe Klick zusätzlich durch die Foto-Marker-Treffprüfung dort.
    ev.stopPropagation();
    let ziel = naechstesKapitel(zoomedKapitel);
    if (ziel) springeZuKapitelZoom(ziel);
  });
  annotationBoxEl = document.getElementById('annotationBox');
  schlusstextEl = document.getElementById('schlusstext');
  annotationText = document.getElementById('annotationText');
  annotationInner = document.getElementById('annotationInner');
  annotationTag = document.getElementById('annotationTag');
  annotationBar = document.getElementById('annotationBar');
  kapitelRegister = document.getElementById('kapitelRegister');
  orteOhneAdresse = document.getElementById('orteOhneAdresse');
  registerTabs = document.getElementById('registerTabs');
  legendeBox = document.getElementById('legendeBox');
  legendeTab = document.getElementById('legendeTab');
  legendeInhalt = document.getElementById('legendeInhalt');
  legendeTab.addEventListener('click', () => oeffneRegister(legendeBox, prologBox, 'legende-offen', 'prolog-offen'));
  prologBox = document.getElementById('prologBox');
  prologTab = document.getElementById('prologTab');
  prologTab.addEventListener('click', () => oeffneRegister(prologBox, legendeBox, 'prolog-offen', 'legende-offen'));
  scrollFortschritt = document.getElementById('scrollFortschritt');
  grafikPlayButton = document.getElementById('grafikPlayButton');
  grafikPlayButton.addEventListener('click', toggleGrafikPlay);

  fotoPopup = document.getElementById('fotoPopup');
  fotoPopupTitel = document.getElementById('fotoPopupTitel');
  fotoPopupPlz = document.getElementById('fotoPopupPlz');
  fotoPopupBild = document.getElementById('fotoPopupBild');
  fotoPopupBeschreibung = document.getElementById('fotoPopupBeschreibung');
  scrollFortschrittFuellung = document.getElementById('scrollFortschrittFuellung');
  document.getElementById('fotoPopupClose').addEventListener('click', schliesseFotoPopup);
  fotoPopup.addEventListener('click', e => { if (e.target === fotoPopup) schliesseFotoPopup(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { schliesseFotoPopup(); schliesseKapitelZoom(); }
  });

  let cnv = createCanvas(stage.offsetWidth, stage.offsetHeight);
  cnv.parent('scrollyStage');

  baueGedankenColumn();
  baueKartenMarkierungen();
  baueKapitelRegister();
  baueLegende();
  baueStationsMarker();
  baueZwischenMarker();
}

function windowResized() {
  resizeCanvas(stage.offsetWidth, stage.offsetHeight);
}

function getScrollProgress() {
  let trackEl = document.querySelector('.scroll-track');
  return constrain(window.scrollY / trackEl.offsetHeight, 0, 1);
}

function coverCrop(imgW, imgH, vAnchor = 0.5, hAnchor = 0.5, offsetX = mapOffsetX) {
  // Nutzt die effektive Breite (width - offsetX), nicht die reine
  // Canvas-Breite — sonst deckt die geografische Bbox nicht den ganzen,
  // durch den Offset verschobenen Canvas ab (grauer Rand rechts). offsetX
  // ist standardmässig mapOffsetX (Kapitel-1-Kartenausschnitt), die grosse,
  // zentrierte Übersichtskarte (bgImage) ruft explizit mit offsetX=0 auf.
  let canvasRatio = (width - offsetX) / height;
  let imgRatio = imgW / imgH;
  let coverW, coverH;
  if (imgRatio > canvasRatio) { coverH = imgH; coverW = imgH * canvasRatio; }
  else { coverW = imgW; coverH = imgW / canvasRatio; }
  // vAnchor/hAnchor verschieben den beschnittenen Ausschnitt innerhalb des
  // Bildes: 0 = oberster/linker Bildrand sichtbar (Rest wird unten/rechts
  // beschnitten), 1 = unterster/rechter Bildrand sichtbar, 0.5 = zentriert
  // (bisheriges Verhalten).
  return { x: (imgW - coverW) * hAnchor, y: (imgH - coverH) * vAnchor, w: coverW, h: coverH };
}

function lonLatToScreen(lon, lat, bbox, offsetX = mapOffsetX, offsetY = mapOffsetY) {
  let x = map(lon, bbox.west, bbox.east, 0, width - offsetX) + offsetX;
  let y = map(lat, bbox.north, bbox.south, 0, height) + offsetY;
  return { x, y };
}

// ---------------------------------------------------------------------------
// Massstabsleiste (unten rechts) — Balken mit Meter-/Kilometerangabe, wie auf
// klassischen Kartendarstellungen. Skaliert live mit der aktuell sichtbaren
// Bbox (Übersicht bis Kapitel-Zoom), da lonLatToScreen Grad linear auf Pixel
// abbildet — für die kurze Ost-West-Ausdehnung eines Kartenausschnitts reicht
// die Haversine-Distanz bei mittlerer Breite als Näherung völlig aus.
// ---------------------------------------------------------------------------

function haversineMeter(lon1, lat1, lon2, lat2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// "Schöne" Rundwerte für die Balkenlänge (Meter) — deckt Übersichtskarte
// (mehrere km) bis engen Kapitel-Zoom (wenige hundert Meter) ab.
const MASSSTAB_SCHRITTE = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];

function zeichneMassstabsleiste(bbox, offsetX, alphaMultiplier = 1) {
  if (alphaMultiplier <= 0) return;
  let mapPixelWidth = width - offsetX;
  if (mapPixelWidth <= 0) return;
  let midLat = (bbox.north + bbox.south) / 2;
  let breiteMeter = haversineMeter(bbox.west, midLat, bbox.east, midLat);
  let meterProPixel = breiteMeter / mapPixelWidth;
  if (!isFinite(meterProPixel) || meterProPixel <= 0) return;

  // Grösster "schöner" Wert, dessen Balken noch unter ~160px bleibt.
  let ziel = MASSSTAB_SCHRITTE[0];
  for (let schritt of MASSSTAB_SCHRITTE) {
    if (schritt / meterProPixel <= 160) ziel = schritt;
    else break;
  }
  let balkenBreite = ziel / meterProPixel;
  let label = ziel >= 1000 ? `${ziel / 1000} km` : `${ziel} m`;

  let randX = 40, randY = 36, tickHoehe = 6;
  let x1 = width - randX - balkenBreite;
  let x2 = width - randX;
  let y = height - randY;

  push();
  stroke(26, 26, 26, 220 * alphaMultiplier);
  strokeWeight(2);
  line(x1, y, x2, y);
  line(x1, y - tickHoehe, x1, y);
  line(x2, y - tickHoehe, x2, y);
  noStroke();
  fill(26, 26, 26, 220 * alphaMultiplier);
  textFont("'Source Sans 3', sans-serif");
  textStyle(NORMAL);
  textSize(11);
  textAlign(CENTER, BOTTOM);
  drawingContext.fillText(label, (x1 + x2) / 2, y - tickHoehe - 4); // p5s text() bleibt bei laufender Animation manchmal unsichtbar, siehe zeichneSpineHorizontal
  pop();
}

// ---------------------------------------------------------------------------
// Windrose (oben rechts) — Haussmann-Paris Farbpalette. Läuft im p5-
// Standard-Winkelmodus (Grad, kein angleMode(RADIANS) im Projekt), daher
// hier bewusst ohne radians()-Umwandlung: cos()/sin() erwarten Grad.
// ---------------------------------------------------------------------------

function zeichneWindrose(x, y, groesse, alphaMultiplier = 1) {
  if (alphaMultiplier <= 0) return;

  const zinkgrau = '#9DA69D';
  const kalksteinCreme = '#212B2E';
  const schmiedeeisenSchwarz = '#9DA69D';
  const cafeRot = '#212B2E';
  const messingGold = '#212B2E';

  // Hilfsfunktion: zweigeteilter Zacken (Kite-Form). winkel: 0 = Norden
  // (oben), im Uhrzeigersinn — die -90 richtet das an p5s 0°=Osten aus.
  function zeichneZacke(winkel, radius, basisBreite, farbeLinks, farbeRechts) {
    const w = radians(winkel - 90);
    const spitzeX = radius * cos(w);
    const spitzeY = radius * sin(w);
    const basis1X = basisBreite * cos(w + HALF_PI);
    const basis1Y = basisBreite * sin(w + HALF_PI);
    const basis2X = basisBreite * cos(w - HALF_PI);
    const basis2Y = basisBreite * sin(w - HALF_PI);
    

    // Helle, dünne Kontur — sonst verschwindet z.B. schmiedeeisenSchwarz auf
    // der dunklen Startseiten-Karte fast komplett (nur die helle Zackenhälfte
    // bliebe sichtbar, die Zacke wirkt dann einseitig/"verzogen").
    stroke('#9DA69D');
    strokeWeight(0.75);
    fill(farbeLinks);
    triangle(0, 0, spitzeX, spitzeY, basis1X, basis1Y);
    fill(farbeRechts);
    triangle(0, 0, spitzeX, spitzeY, basis2X, basis2Y);
  }

  push();
  drawingContext.globalAlpha = alphaMultiplier;
  translate(x, y);

  const rHaupt = groesse;
  const rNeben = groesse * 0.6;

 // Äussere Ringe
  noStroke();
  fill(226, 230, 225, 40); // zinkgrau mit Transparenz (0–255, z.B. 40 = sehr leicht)
  circle(0, 0, rHaupt * 2 + 20);
  circle(0, 0, rHaupt * 2);

  // Haupt-Zacken: Nord, Ost, Süd, West
  const richtungenHaupt = [
    { winkel: 0, farbeLinks: cafeRot, farbeRechts: schmiedeeisenSchwarz },
    { winkel: 90, farbeLinks: kalksteinCreme, farbeRechts: schmiedeeisenSchwarz },
    { winkel: 180, farbeLinks: kalksteinCreme, farbeRechts: schmiedeeisenSchwarz },
    { winkel: 270, farbeLinks: kalksteinCreme, farbeRechts: schmiedeeisenSchwarz },
  ];
  const breite = groesse * 0.08;
  richtungenHaupt.forEach(r => zeichneZacke(r.winkel, rHaupt, breite, r.farbeLinks, r.farbeRechts));

  // Neben-Zacken: NO, SO, SW, NW
  const richtungenNeben = [45, 135, 225, 315];
  const breiteNeben = groesse * 0.05;
  richtungenNeben.forEach(w => zeichneZacke(w, rNeben, breiteNeben, messingGold, zinkgrau));

  // Zentrum
  stroke(messingGold);
  strokeWeight(1);
  fill(kalksteinCreme);
  circle(0, 0, groesse * 0.18);
  noStroke();
  fill(schmiedeeisenSchwarz);
  circle(0, 0, groesse * 0.05);

  // Beschriftung Haupthimmelsrichtungen — schmiedeeisenSchwarz/zinkgrau sind
  // inzwischen helle Zacken-Farben (siehe oben) und taugen als Text-Füllung
  // nicht mehr, daher eigene beschriftungsFarbe.
  // p5s text() bleibt bei laufender Animation manchmal unsichtbar (siehe
  // zeichneSpineHorizontal) — Fill hier direkt über den Canvas-Context, die
  // p5-Aufrufe oben (fill/textAlign/textSize/textFont/textStyle) setzen die
  // dafür nötigen Context-Eigenschaften weiterhin wie gewohnt.
  function zeichneBeschriftung(label, x, y) {
    drawingContext.fillText(label, x, y);
  }

  const beschriftungsFarbe = '#A4860A';
  noStroke();
  fill(beschriftungsFarbe);
  textAlign(CENTER, CENTER);
  textSize(groesse * 0.2);
  textFont("'Source Sans 3', sans-serif");
  textStyle(BOLD);
  zeichneBeschriftung('N', 0, -rHaupt - 16);
  zeichneBeschriftung('O', rHaupt + 16, 0);
  zeichneBeschriftung('S', 0, rHaupt + 16);
  zeichneBeschriftung('W', -rHaupt - 16, 0);

  // Beschriftung Nebenrichtungen — dieselbe -90-Ausrichtung wie die Zacken,
  // sonst landet z.B. "NO" geometrisch auf der SO-Position.
  fill(beschriftungsFarbe);
  textSize(groesse * 0.1);
  const offsetNeben = rNeben + 14;
  richtungenNeben.forEach((w, i) => {
    const label = ['NO', 'SO', 'SW', 'NW'][i];
    const a = radians(w - 90);
    zeichneBeschriftung(label, offsetNeben * cos(a), offsetNeben * sin(a));
  });

  pop();
}

function bboxToImgCrop(bbox, refBbox, imgW, imgH) {
  let x0 = map(bbox.west, refBbox.west, refBbox.east, 0, imgW);
  let y0 = map(bbox.north, refBbox.north, refBbox.south, 0, imgH);
  let x1 = map(bbox.east, refBbox.west, refBbox.east, 0, imgW);
  let y1 = map(bbox.south, refBbox.north, refBbox.south, 0, imgH);
  x0 = constrain(x0, 0, imgW); y0 = constrain(y0, 0, imgH);
  x1 = constrain(x1, 0, imgW); y1 = constrain(y1, 0, imgH);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

function cropToBbox(crop, refBbox, imgW, imgH) {
  return {
    west: map(crop.x, 0, imgW, refBbox.west, refBbox.east),
    east: map(crop.x + crop.w, 0, imgW, refBbox.west, refBbox.east),
    north: map(crop.y, 0, imgH, refBbox.north, refBbox.south),
    south: map(crop.y + crop.h, 0, imgH, refBbox.north, refBbox.south),
  };
}

function baueGedankenColumn() {
  stationenData.gedanken.forEach(g => {
    let el = document.createElement('div');
    el.className = 'gedanken-entry';
    let dot = document.createElement('div');
    dot.className = 'ortspunkt';
    let label = document.createElement('span');
    label.textContent = g.ort;
    el.appendChild(dot);
    el.appendChild(label);
    gedankenColumn.appendChild(el);
    gedankenEintraege.push({ el, dot, ort: g.ort, nachStation: g.nachStation });
  });
}

// Kapitelregister (linker Rand). Oben drei feste Einträge (ersetzen den
// ehemaligen ansicht-wechseln-btn oben rechts):
//   - "Plan"/"Graph" (eine Zeile, zwei Hälften): setzt kapitelAnsichtsModus
//     direkt auf 'karte' bzw. 'grafik' (siehe setzeKapitelAnsichtModus) für
//     die gerade offene Kapitel-Ansicht.
//   - Leerzeile als Abstandshalter.
//   - "Alle": verlässt jede offene Kapitel-Ansicht zurück auf die neutrale
//     Übersichtskarte (springeZurUebersicht).
// Danach ein Eintrag je Kapitel, 01–18 lückenlos. 01 hat kein
// kapitelKarten-Pendant, eigenes System — springt per scrolleZuKapitel1()
// zurück in die Hauptgeschichte statt in einen Kapitel-Zoom. Alle anderen
// (inkl. 03, das in WEITERE_KAPITEL_NUMMERN fehlt, da eigene Datenquelle
// kapitel03Data) springen per springeZuKapitelZoom(nr) — die Funktion hat
// einen eigenen Sicherheits-Guard und tut bei fehlenden Daten einfach nichts.
function baueKapitelRegister() {
  modusZeile = document.createElement('div');
  modusZeile.className = 'kapitel-register-modus-zeile';

  planEintrag = document.createElement('button');
  planEintrag.type = 'button';
  planEintrag.className = 'kapitel-register-modus-item';
  planEintrag.textContent = 'Plan';
  planEintrag.addEventListener('click', () => setzeKapitelAnsichtModus('karte'));
  modusZeile.appendChild(planEintrag);

  graphEintrag = document.createElement('button');
  graphEintrag.type = 'button';
  graphEintrag.className = 'kapitel-register-modus-item';
  graphEintrag.textContent = 'Graph';
  graphEintrag.addEventListener('click', () => setzeKapitelAnsichtModus('grafik'));
  modusZeile.appendChild(graphEintrag);

  kapitelRegister.appendChild(modusZeile);

  leerzeile = document.createElement('div');
  leerzeile.className = 'kapitel-register-leerzeile';
  kapitelRegister.appendChild(leerzeile);

  alleEintrag = document.createElement('button');
  alleEintrag.type = 'button';
  alleEintrag.className = 'kapitel-register-item';
  alleEintrag.textContent = 'Alle';
  alleEintrag.addEventListener('click', springeZurUebersicht);
  kapitelRegister.appendChild(alleEintrag);

  let alleNummern = ['01', '03', ...WEITERE_KAPITEL_NUMMERN].sort();

  alleNummern.forEach(nr => {
    let eintrag = document.createElement('button');
    eintrag.type = 'button';
    eintrag.className = 'kapitel-register-item';
    eintrag.textContent = 'Kapitel ' + parseInt(nr, 10);
    eintrag.addEventListener('click', nr === '01' ? scrolleZuKapitel1 : () => springeZuKapitelZoom(nr));
    kapitelRegister.appendChild(eintrag);
    kapitelRegisterEintraege[nr] = eintrag;
  });
}

// Legende (mitte rechts, sichtbar in Plan- UND Graph-Ansicht, siehe
// draw()) — Farberklärung der Kreisgrafik (zeichneKreiseFuerRun). Inhalt aus
// KREIS_KATEGORIEN/CATEGORY_LABELS (datenbereinigung.js) gebaut statt hart
// codiert, damit Legende und tatsächliche Kreisfarben nie auseinanderlaufen.
// Erklärt beide Bild-Ebenen einzeln: die schraffierte Gesamtfläche (alle
// Erwähnungen der Kategorie, auch neutrale/unbewertete) und die vollflächigen
// Halbkreise (nur negativ/positiv bewertete, per fester Position links/rechts
// unterschieden — NICHT per Farbe, siehe "Kreise"-Kommentar bei
// zeichneKreiseFuerRun).
function baueLegende() {
  let titel = document.createElement('div');
  titel.className = 'legende-titel';
  titel.textContent = 'Legende';
  legendeInhalt.appendChild(titel);

  KREIS_KATEGORIEN.forEach(k => {
    let zeile = document.createElement('div');
    zeile.className = 'legende-zeile';

    let kreis = document.createElement('span');
    kreis.className = 'legende-kreis';
    kreis.style.setProperty('--legende-farbe', `rgb(${k.farbe.join(', ')})`);
    zeile.appendChild(kreis);

    let label = document.createElement('span');
    label.className = 'legende-label';
    label.textContent = CATEGORY_LABELS[k.key] || k.key;
    zeile.appendChild(label);

    legendeInhalt.appendChild(zeile);
  });

  let hinweisSchraffur = document.createElement('p');
  hinweisSchraffur.className = 'legende-hinweis';
  hinweisSchraffur.textContent = 'Schraffur: alle Erwähnungen der Kategorie (auch neutral/unbewertet). Kreisgrösse = Anzahl.';
  legendeInhalt.appendChild(hinweisSchraffur);

  let valenzZeile = document.createElement('div');
  valenzZeile.className = 'legende-valenz';

  let valenzKreis = document.createElement('span');
  valenzKreis.className = 'legende-valenz-kreis';
  let beispielFarbe = KREIS_KATEGORIEN.find(k => k.key === 'gold_mittel') || KREIS_KATEGORIEN[0];
  valenzKreis.style.setProperty('--legende-farbe', `rgb(${beispielFarbe.farbe.join(', ')})`);
  valenzZeile.appendChild(valenzKreis);

  let valenzText = document.createElement('span');
  valenzText.className = 'legende-valenz-text';
  valenzText.textContent = LEGENDE_VALENZ_KARTE;
  valenzZeile.appendChild(valenzText);
  // Für die Umschaltung Plan/Graph merken: die Halbkreise stehen in der
  // Graph-Ansicht oben/unten statt links/rechts (siehe
  // zeichneSpineHorizontal), die Legende muss das mitmachen — sie ist in
  // BEIDEN Ansichten sichtbar.
  legendeValenzText = valenzText;
  legendeValenzKreis = valenzKreis;

  legendeInhalt.appendChild(valenzZeile);

  let neutralZeile = document.createElement('div');
  neutralZeile.className = 'legende-valenz legende-valenz-mehr';

  let neutralKreis = document.createElement('span');
  neutralKreis.className = 'legende-valenz-kreis-voll';
  neutralKreis.style.setProperty('--legende-farbe', `rgb(${beispielFarbe.farbe.join(', ')})`);
  neutralZeile.appendChild(neutralKreis);

  let neutralText = document.createElement('span');
  neutralText.className = 'legende-valenz-text';
  neutralText.textContent = 'Ganzer Kreis: neutral bewertet';
  neutralZeile.appendChild(neutralText);

  legendeInhalt.appendChild(neutralZeile);

  let fwertTitel = document.createElement('div');
  fwertTitel.className = 'legende-fwert-titel';
  fwertTitel.textContent = 'F-Wert';
  legendeInhalt.appendChild(fwertTitel);

  // Reihenfolge = Grösse 1..3, siehe FWERT_PUNKTGROESSE (datenbereinigung.js).
  [
    { groesse: 1, text: 'Raum löst Emotion aus' },
    { groesse: 2, text: 'Emotion färbt Raum' },
    { groesse: 3, text: 'Körper als Sensor' },
  ].forEach(({ groesse, text }) => {
    let zeile = document.createElement('div');
    zeile.className = 'legende-fwert-zeile';

    let punkt = document.createElement('span');
    punkt.className = 'legende-fwert-punkt';
    let d = FWERT_PUNKT_DURCHMESSER[groesse];
    punkt.style.width = d + 'px';
    punkt.style.height = d + 'px';
    punkt.style.backgroundColor = FWERT_PUNKT_FARBE;
    zeile.appendChild(punkt);

    let label = document.createElement('span');
    label.className = 'legende-label';
    label.textContent = text;
    zeile.appendChild(label);

    legendeInhalt.appendChild(zeile);
  });

  let fwertHinweis = document.createElement('p');
  fwertHinweis.className = 'legende-hinweis';
  fwertHinweis.textContent = LEGENDE_FWERT_KARTE;
  legendeInhalt.appendChild(fwertHinweis);
  legendeFwertHinweis = fwertHinweis; // wechselt mit der Ansicht, siehe draw()
}

function baueKartenMarkierungen() {
  stationenData.markierungen.filter(m => !m.deaktiviert).forEach(m => {
    let wrap = document.createElement('div');
    wrap.className = 'karten-markierung';
    let dot = document.createElement('div');
    dot.className = 'ortspunkt';
    let label = document.createElement('div');
    label.className = 'label';
    label.textContent = m.ort;
    wrap.appendChild(dot);
    wrap.appendChild(label);
    kartenMarkierungenEl.appendChild(wrap);
    markierungsEintraege.push({ el: wrap, lon: m.lon, lat: m.lat, revealIndex: m.revealIndex });
  });
}

function baueStationsMarker() {
  stationenData.route.forEach((station, i) => {
    if (i === 0) return;
    if (station.deaktiviert) return;
    let wrap = document.createElement('div');
    wrap.className = 'karten-markierung stations-marker';
    let dot = document.createElement('div');
    dot.className = 'ortspunkt';
    let label = document.createElement('div');
    label.className = 'label';
    label.textContent = station.ort;
    wrap.appendChild(dot);
    wrap.appendChild(label);
    kartenMarkierungenEl.appendChild(wrap);
    stationsMarker.push({ el: wrap, lon: station.lon, lat: station.lat, revealIndex: station.revealIndex });
  });
}

function baueZwischenMarker() {
  (stationenData.zwischenPunkte || []).filter(z => !z.deaktiviert).forEach(z => {
    let wrap = document.createElement('div');
    wrap.className = 'karten-markierung zwischen-marker';
    let dot = document.createElement('div');
    dot.className = 'ortspunkt';
    let label = document.createElement('div');
    label.className = 'label';
    label.textContent = z.name;
    wrap.appendChild(dot);
    wrap.appendChild(label);
    kartenMarkierungenEl.appendChild(wrap);
    zwischenMarker.push({ el: wrap, lon: z.lon, lat: z.lat, revealIndex: z.revealIndex });
  });
}

function baueSpineTimeline() {
  spineLinie = document.createElement('div');
  spineLinie.className = 'spine-linie';
  spineTimeline.appendChild(spineLinie);

  stationenData.route.forEach((station, i) => {
    fuegeSpineEintragHinzu(station.ort, 'route', i);
    stationenData.gedanken.filter(g => g.nachStation === i).forEach(g => fuegeSpineEintragHinzu(g.ort, 'gedanke', i));
    stationenData.markierungen.filter(m => m.nachStation === i).forEach(m => fuegeSpineEintragHinzu(m.ort, 'markierung', i));
  });
}

function fuegeSpineEintragHinzu(text, typ, stationIndex) {
  let el = document.createElement('div');
  el.className = 'spine-entry' + (typ !== 'route' ? ' spalte-' + typ : '');
  let dot = document.createElement('div');
  dot.className = 'ortspunkt';
  let label = document.createElement('span');
  label.textContent = text;
  el.appendChild(dot);
  el.appendChild(label);
  spineTimeline.appendChild(el);
  spineEintraege.push({ el, stationIndex });
}

// ---------------------------------------------------------------------------
// draw()
// ---------------------------------------------------------------------------

function draw() {
  background(220);

  if (spineEintraegep5.length === 0 && stationenData.ortRuns) {
    spineEintraegep5 = baueSpineDaten(stationenData, ortRunsFuerSpine(stationenData), { parisAllgemein: PARIS_ALLGEMEIN });
  }
  // Generisches Spine-Panel fürs jeweils gezoomte Kapitel (02–18, ausser 01 —
  // das hat sein eigenes live wachsendes Panel), einmal berechnet und dann
  // gecacht — die Hauptorte kommen aber wie bei Kapitel 1 dynamisch aus
  // ortRunsFuerSpine(daten), nicht mehr aus einer je Kapitel von Hand
  // gepflegten Liste (siehe KAPITEL_MIT_SPINE_PANEL in datenbereinigung.js).
  // letzterZoomKapitel bleibt auch nach dem Schliessen (zoomedKapitel=null)
  // gesetzt, damit das Panel während des Ausblendens (kapitelZoomAmount -> 0)
  // weiter die richtigen Daten zeigt, statt abrupt zu verschwinden.
  if (zoomedKapitel) letzterZoomKapitel = zoomedKapitel;
  if (letzterZoomKapitel && !spineEintraegeKapitel[letzterZoomKapitel]) {
    let daten = datenFuerKapitel(letzterZoomKapitel);
    if (daten && daten.ortRuns) {
      spineEintraegeKapitel[letzterZoomKapitel] = baueSpineDaten(daten, ortRunsFuerSpine(daten));
    }
  }
  let targetCrop = coverCrop(ch1Image.width, ch1Image.height);
  let targetBbox = cropToBbox(targetCrop, ch1ImgBbox, ch1Image.width, ch1Image.height);

  let progress = getScrollProgress();
  // Ein offenes Kapitel endet mit seiner letzten Annotation — dahinter wird
  // nicht weitergescrollt: kein Hinübergleiten in den Kreisvergleich, kein
  // Ausblenden der Kapitelkarte. Die Scrollposition wird dafür am Ende des
  // Kapitel-Akts festgehalten; nach OBEN bleibt sie frei, das ist der Weg
  // zurück (siehe uebersichtRoutenFortschritt <= 0 -> schliesseKapitelZoom).
  if (zoomedKapitel && progress > SCROLL_MEILENSTEINE.uebersichtRoutenEnd) {
    progress = SCROLL_MEILENSTEINE.uebersichtRoutenEnd;
    let trackEl = document.querySelector('.scroll-track');
    window.scrollTo(0, trackEl.offsetHeight * progress);
  }
  scrollFortschrittFuellung.style.width = (progress * 100) + '%';

  // Wechsel Startseiten-Karte -> zweite Übersichtskarte genau an dem Punkt,
  // an dem bgImage ohnehin unsichtbar ist (voll in Kapitel 1 eingezoomt) —
  // dadurch kein sichtbarer Sprung. Rück-Scrollen über diesen Punkt schaltet
  // symmetrisch wieder auf die Startseiten-Karte zurück. Beide Bilder zeigen
  // denselben Ausschnitt (siehe uebersichtBbox) und haben dieselben
  // Pixelmasse — es wechselt also wirklich nur, welches gezeichnet wird.
  // Im Schlussakt kehrt die STARTkarte zurück (nicht die Überblickkarte) —
  // der Bogen schliesst dort, wo er begonnen hat. Jedes der beiden Bilder
  // bringt seine eigene Georeferenz mit.
  let imStartkarteAkt = progress >= SCROLL_MEILENSTEINE.startkarteStart;
  let zeigeStartkarte = progress < SCROLL_MEILENSTEINE.zoomEnd || imStartkarteAkt;
  let currentBgImage = zeigeStartkarte ? bgImage : bgImage2;
  let currentBgBbox = zeigeStartkarte ? startBbox : uebersichtBbox;
  let fullCrop = coverCrop(currentBgImage.width, currentBgImage.height, 0.5, 0.5, 0); // grosse Karte bleibt zentriert, unabhängig von mapOffsetX
  let fullBbox = cropToBbox(fullCrop, currentBgBbox, currentBgImage.width, currentBgImage.height);

  let zoomAmount = constrain(map(progress, SCROLL_MEILENSTEINE.zoomStart, SCROLL_MEILENSTEINE.zoomEnd, 0, 1), 0, 1);
  // Nach Abschluss der Route wieder auf die Gesamtkarte rauszoomen — die
  // Route/Kreise/Spine bleiben dabei sichtbar, da ihr Fortschritt
  // (routeAmount, unten) über constrain() bei 1 gehalten wird und nicht
  // vom Zoom abhängt.
  let zoomOutAmount = constrain(map(progress, SCROLL_MEILENSTEINE.zoomOutStart, SCROLL_MEILENSTEINE.zoomOutEnd, 0, 1), 0, 1);
  zoomAmount *= (1 - zoomOutAmount);
  kapitel1ZoomAmount = zoomAmount;

  // "In einer Kapitel-Ansicht" (1–18, für Menübalken/Ansichtsmodus/
  // Scroll-Fortschritt-Sichtbarkeit): entweder ein gezoomtes Kapitel 02–18
  // (zoomedKapitel) ODER Kapitel 1s eigener Kartenausschnitt (zoomAmount
  // mehrheitlich eingezoomt). inKapitelGrafikAnsicht zusätzlich nur, wenn
  // dort auch aktiv auf 'grafik' umgeschaltet wurde (siehe
  // setzeKapitelAnsichtModus).
  let inKapitel1Kartenausschnitt = !zoomedKapitel && zoomAmount > 0.5;
  let inKapitelAnsicht = !!zoomedKapitel || inKapitel1Kartenausschnitt;
  let inKapitelGrafikAnsicht = inKapitelAnsicht && kapitelAnsichtsModus === 'grafik';

  // Gemeinsamer Kapitel-1-Kartenoffset für alle Overlay-Elemente (Route,
  // Kreise/Labels, Ortsmarker, Foto-Marker): 0 bei zoomAmount=0 (zentrierte
  // Übersichtskarte sichtbar), voller mapOffsetX bei zoomAmount=1 (voll in
  // ch1Image gezoomt) — sonst blieben diese Elemente beim Rein-/Rauszoomen
  // gegenüber der jeweils sichtbaren Karte verschoben.
  let kartenOffsetX = lerp(0, mapOffsetX, zoomAmount);
  let kartenOffsetY = lerp(0, mapOffsetY, zoomAmount);

  // Übersichtsrouten/Kapitel-Zoom sind nur im letzten Akt (voll rausgezoomt)
  // erreichbar — schon hier berechnet, da activeBbox unten davon abhängt.
  // Auch der Weg zurück aus einem Kapitel-Zoom: Hoch-scrollen bis vor den
  // Anfang dieses Akts schliesst ihn wieder — Kapitel 1 ist die einzige
  // Ausnahme, das funktioniert weiterhin über Runter-scrollen.
  let uebersichtRoutenFortschritt = constrain(map(progress, SCROLL_MEILENSTEINE.uebersichtRoutenStart, SCROLL_MEILENSTEINE.uebersichtRoutenEnd, 0, 1), 0, 1);
  if (zoomedKapitel && uebersichtRoutenFortschritt <= 0) schliesseKapitelZoom(); // zurückgescrollt

  // Letzter Akt: Ortsveränderung an sieben kapitelübergreifenden Orten
  // (siehe zeichneOrtsveraenderung und die Phasen OV_*).
  // Schlussakt "Ortsveränderung" (siehe zeichneOrtsveraenderung): ein
  // durchgehender Fortschritt 0..1 über den ganzen Akt, aus dem sich die
  // Phasen ableiten. Der Kartenfade läuft nicht mehr sofort, sondern über
  // OV_KARTE_AUS — die Karte verschwindet langsam, während die senkrechten
  // Linien schon wachsen.
  let ovFortschritt = constrain(map(progress, SCROLL_MEILENSTEINE.kreisVergleichStart, SCROLL_MEILENSTEINE.kreisVergleichEnd, 0, 1), 0, 1);
  let skFortschritt = constrain(map(progress, SCROLL_MEILENSTEINE.startkarteStart, 1, 0, 1), 0, 1);
  let skEinblenden = ovPhase(skFortschritt, SK_EINBLENDEN);
  let skRauszoom = ovPhase(skFortschritt, SK_RAUSZOOM);
  if (schlusstextEl) schlusstextEl.style.opacity = ovPhase(skFortschritt, SK_TEXT);
  let kreisVergleichMapFade = ovPhase(ovFortschritt, OV_KARTE_AUS);
  // Ein noch offener Kapitel-Zoom soll nicht mit in diesen Akt "hinüber-
  // gescrollt" werden können (sonst läge sein Kartenausschnitt über dem
  // ausblendenden Übersichtsbild und dem neuen Kreis-Raster).
  if (zoomedKapitel && kreisVergleichMapFade > 0) schliesseKapitelZoom();

  // Kapitel-Zoom (Klick auf «04» etc., siehe oeffneKapitelZoom): öffnet sich
  // sofort mit voll sichtbarer Route, kein eigener Scroll-Akt — nur zeitlich
  // weich eingeblendet (wie zuvor).
  kapitelZoomAmount = lerp(kapitelZoomAmount, zoomedKapitel ? 1 : 0, 0.08);

  let activeBbox = {
    west: lerp(fullBbox.west, targetBbox.west, zoomAmount),
    east: lerp(fullBbox.east, targetBbox.east, zoomAmount),
    south: lerp(fullBbox.south, targetBbox.south, zoomAmount),
    north: lerp(fullBbox.north, targetBbox.north, zoomAmount),
  };

  // Schlusszoom auf den Ausschnitt, der die sieben Orte der Ortsveränderung
  // fasst — erst nachdem die Linien zurückgeschrumpft sind und die Punkte auf
  // ihrem echten Ort liegen (siehe OV_ZOOM). Dadurch rücken die Orte weit
  // genug auseinander, dass ihre Kreise sich nicht überlagern.
  let ovZoom = ovPhase(ovFortschritt, OV_ZOOM);
  if (ovZoom > 0) {
    let ziel = ovZoomBbox();
    if (ziel) {
      activeBbox = {
        west: lerp(activeBbox.west, ziel.west, ovZoom),
        east: lerp(activeBbox.east, ziel.east, ovZoom),
        south: lerp(activeBbox.south, ziel.south, ovZoom),
        north: lerp(activeBbox.north, ziel.north, ovZoom),
      };
    }
  }

  // Und wieder heraus: aus dem Ausschnitt der sieben Orte zurück auf die
  // ganze Startkarte, nachdem diese eingeblendet hat.
  if (skRauszoom > 0) {
    activeBbox = {
      west: lerp(activeBbox.west, fullBbox.west, skRauszoom),
      east: lerp(activeBbox.east, fullBbox.east, skRauszoom),
      south: lerp(activeBbox.south, fullBbox.south, skRauszoom),
      north: lerp(activeBbox.north, fullBbox.north, skRauszoom),
    };
  }

  // Kapitel-Zoom (Klick auf «03» etc.) — zoomt von der Gesamtkarte weiter in
  // den eigenen Kartenausschnitt des Kapitels, genau wie oben bgImage→ch1Image.
  let kapitelCrop = null;
  // Ausserhalb des Blocks, weil die Platzwahl der Annotationsbox weiter unten
  // dieselbe (unanimierte) Ziel-Bbox braucht — mit der laufend
  // interpolierten activeBbox würde sie während des Reinzoomens wandern.
  let kapitelTargetBbox = null;
  if (zoomedKapitel && kapitelKarten[zoomedKapitel] && kapitelKarten[zoomedKapitel].bild
    && kapitelKarten[zoomedKapitel].bild.width && kapitelKarten[zoomedKapitel].bboxRaw) {
    let k = kapitelKarten[zoomedKapitel];
    kapitelCrop = coverCrop(k.bild.width, k.bild.height, k.vAnchor ?? 0.5, k.hAnchor ?? 0.5);
    kapitelTargetBbox = cropToBbox(kapitelCrop, k.bboxRaw, k.bild.width, k.bild.height);
    activeBbox = {
      west: lerp(activeBbox.west, kapitelTargetBbox.west, kapitelZoomAmount),
      east: lerp(activeBbox.east, kapitelTargetBbox.east, kapitelZoomAmount),
      south: lerp(activeBbox.south, kapitelTargetBbox.south, kapitelZoomAmount),
      north: lerp(activeBbox.north, kapitelTargetBbox.north, kapitelZoomAmount),
    };
  }

  // currentBgImage steht schon oben fest (zusammen mit fullBbox) — hier wird
  // daraus nur noch der zu zeichnende Bildausschnitt für die aktuelle
  // activeBbox berechnet.
  let bgCrop = bboxToImgCrop(activeBbox, currentBgBbox, currentBgImage.width, currentBgImage.height);
  // ch1Image "zoomt" nicht selbst mit — es blendet an seiner bereits fest
  // berechneten, korrekt proportionierten Zielposition (targetCrop) ein.
  // Ein dynamisch aus der (während des Übergangs noch viel zu grossen)
  // activeBbox berechneter Ausschnitt würde auf die Bildgrenzen geklemmt
  // und dabei im falschen Seitenverhältnis erscheinen (sichtbare Verzerrung
  // bei einer Strassenkarte).
  let ch1Crop = targetCrop;

  // (1 - kreisVergleichMapFade) blendet die Karte im Ortsveränderungs-Akt aus;
  // skEinblenden holt sie im allerletzten Akt zurück.
  tint(255, 255 * (1 - zoomAmount) * Math.max(1 - kreisVergleichMapFade, skEinblenden));
  image(currentBgImage, 0, 0, width, height, bgCrop.x, bgCrop.y, bgCrop.w, bgCrop.h);
  tint(255, 255 * zoomAmount * (1 - kreisVergleichMapFade));
  image(ch1Image, mapOffsetX, mapOffsetY, width - mapOffsetX, height, ch1Crop.x, ch1Crop.y, ch1Crop.w, ch1Crop.h);
  noTint();

  if (kapitelCrop && kapitelZoomAmount > 0.001) {
    let k = kapitelKarten[zoomedKapitel];
    tint(255, 255 * kapitelZoomAmount * (1 - kreisVergleichMapFade));
    image(k.bild, mapOffsetX, mapOffsetY, width - mapOffsetX, height, kapitelCrop.x, kapitelCrop.y, kapitelCrop.w, kapitelCrop.h);
    noTint();
  }

  let massstabOffsetX = (kapitelCrop && kapitelZoomAmount > 0.5) ? mapOffsetX : kartenOffsetX;
  zeichneMassstabsleiste(activeBbox, massstabOffsetX, 1 - kreisVergleichMapFade);
  zeichneWindrose(width - 90, 150, 50, 1 - kreisVergleichMapFade);

  let routeAmount = constrain(map(progress, SCROLL_MEILENSTEINE.routeStart, SCROLL_MEILENSTEINE.routeEnd, 0, 1), 0, 1);

  let annListe = stationenData.annotationen;
  let annIndex = Math.min(annListe.length - 1, Math.floor(routeAmount * annListe.length));
  let punktIndex = annListe[annIndex].revealIndex;
  if (annListe[annIndex].vorRoutenstart) punktIndex = 0;

  let endStation = stationenData.route.filter(s => s.routeEndsHere).pop()
    || stationenData.route[stationenData.route.length - 1];
  let liniIndex = Math.min(punktIndex, endStation.revealIndex);

  // Übersichtsrouten (Kapitel 02–18) — beginnen erst zu zeichnen, wenn das
  // Rauszoomen vollständig abgeschlossen ist (eigener Akt danach). Zuerst
  // gezeichnet, damit Kapitel 1s Route (unten) und ihre Kreise (falls
  // sichtbar) darüber liegen. (uebersichtRoutenFortschritt bereits oben
  // berechnet, wird dort schon für den Kapitel-Zoom gebraucht.)
  let aktuelleAnnotationZoom = null;
  // Die Routen bleiben im Ortsveränderungs-Akt zunächst stehen, auch wenn die
  // Karte darunter ausblendet — auf sie kommen die Ortspunkte zu liegen. Erst
  // mit dem Zoom verschwinden sie ganz: bis dahin sind die Punkte gelandet,
  // und fürs Kapitelzählen soll der Hintergrund leer sein.
  //
  // Beim Rauszoomen im allerletzten Akt kommen sie zurück (Math.max) — das
  // Schlussbild ist wieder die ganze Karte mit allen achtzehn Routen, so wie
  // der Überblicksakt sie hinterlassen hat.
  if (uebersichtRoutenFortschritt > 0) {
    let routenSichtbar = Math.max((1 - 0.45 * kreisVergleichMapFade) * (1 - ovZoom), skRauszoom);
    let routenAlpha = 180 * routenSichtbar;
    let uebersichtRoutenErgebnis = zeichneUebersichtsrouten(activeBbox, routenAlpha, uebersichtRoutenFortschritt);
    aktuelleAnnotationZoom = uebersichtRoutenErgebnis && uebersichtRoutenErgebnis.aktuelleAnnotationZoom;
  } else {
    kapitelHover = null; // Routen (und damit Hover-Ziele) aktuell nicht gezeichnet
    cursor(ARROW);
  }

  // Kapitel 1s eigene Route/Kreise nutzen weiterhin activeBbox — sobald ein
  // ANDERES Kapitel gezoomt ist (zoomedKapitel), zeigt activeBbox aber dessen
  // Bbox, nicht mehr Kapitel 1s eigene Gegend. Ohne diese Sperre würde
  // Kapitel 1s (geografisch bedeutungslose) Route/Kreise über dem gezoomten
  // Kartenausschnitt des anderen Kapitels weitergezeichnet — das erzeugte
  // genau das chaotische Liniengewirr, das beim Testen auffiel.
  if (!zoomedKapitel) {
    // Strichstärke der Kapitel-1-Route läuft beim Rauszoomen von 10 auf 2 —
    // exakt die Stärke der Übersichtsrouten (siehe zeichneUebersichtsrouten),
    // damit Kapitel 1s Linie in der Gesamtkarten-Ansicht gleich dünn wirkt.
    // Kapitel 1s eigene Route folgt demselben Ausblenden wie die Übersichts-
    // routen oben — sonst verschwände sie schon mit der Karte, während die
    // anderen noch stehen.
    zeichneRoute(stationenData.routenPunkte, liniIndex, activeBbox, lerp(10, 2, zoomOutAmount), kartenOffsetX, kartenOffsetY,
      Math.max((1 - 0.45 * kreisVergleichMapFade) * (1 - ovZoom), skRauszoom));
    // Kreisgrafik (Karte) in der letzten Ansicht (Rauszoomen) für den Moment
    // ausgeblendet — Route/Spine bleiben davon unberührt sichtbar.
    if (zoomOutAmount <= 0) {
      zeichneKreiseOrtRuns(punktIndex, annIndex, activeBbox, kartenOffsetX, kartenOffsetY);
    }
  }

  // Letzter Akt: Ortsveränderung — senkrechte Linien wachsen gestaffelt,
  // die Karte blendet aus, die Linien schrumpfen zurück auf die echten Orte,
  // Zoom, dann wachsen die Kreise während die Kapitel durchzählen.
  if (ovFortschritt > 0 && !zoomedKapitel) {
    zeichneOrtsveraenderung(activeBbox, ovFortschritt, 255 * (1 - skRauszoom));
  }

  // Grafische Ansicht (siehe kapitelAnsichtsModus): deckt Karte/Route/Kreise
  // dieses Frames vollständig mit einer eigenen, auf den Browser
  // zentrierten horizontalen Spine-Darstellung ab, statt der üblichen
  // rechten Spine-Spalte — siehe zeichneSpineHorizontal/aktualisiereGrafik.
  // In der Kartenansicht bleibt die rechte Spine-Spalte dagegen komplett
  // ausgeblendet (nicht mehr wie früher permanent während des Zooms
  // sichtbar).
  if (inKapitelGrafikAnsicht) {
    background(226, 230, 225); // #E2E6E1
    let grafikEintraege = zoomedKapitel ? spineEintraegeKapitel[zoomedKapitel] : spineEintraegep5;
    let grafikDaten = zoomedKapitel ? datenFuerKapitel(zoomedKapitel) : stationenData;
    aktualisiereGrafikFortschritt();
    zeichneSpineHorizontal(grafikEintraege || [], grafikFortschritt, grafikDaten);
  }

  // Annotation — in der letzten Ansicht (Rauszoomen) für den Moment ausgeblendet.
  // Kapitel 1 (eigener Kartenausschnitt) läuft über routeAmount/annIndex;
  // ein gezoomtes anderes Kapitel (02–18) stattdessen über
  // aktuelleAnnotationZoom (siehe zeichneUebersichtsrouten oben) — beide
  // schliessen sich gegenseitig aus (zoomedKapitel ist nie gleichzeitig
  // Kapitel 1s eigene Ansicht).
  let aktuelleAnnotation = !zoomedKapitel
    ? ((routeAmount > 0 && zoomOutAmount <= 0) ? annListe[annIndex] : null)
    : (kapitelZoomAmount > 0.5 ? aktuelleAnnotationZoom : null);
  // Platz der Box je Kapitel bestimmen (siehe annotationBoxPlatz) — die
  // Ziel-Bbox des Kapitels, nicht die animierte activeBbox, sonst wanderte
  // die Wahl während des Reinzoomens.
  let platzKapitel = zoomedKapitel || '01';
  let platzBbox = zoomedKapitel ? kapitelTargetBbox : targetBbox;
  let platzDaten = zoomedKapitel ? datenFuerKapitel(zoomedKapitel) : stationenData;
  if (annotationBoxEl && platzBbox && platzDaten && platzDaten.ortRuns) {
    let platz = annotationBoxPlatz(platzKapitel, platzDaten, platzBbox);
    ANNOTATION_BOX_PLAETZE.forEach(p => annotationBoxEl.classList.toggle('pos-' + p, p === platz));
  }

  // Hinweis "Nächstes Kapitel" am Ende eines Kapitels (02–18). Sichtbar,
  // sobald der kapitel-eigene Fortschritt durchgelaufen ist — also Route
  // gezeichnet und die letzte Annotation erreicht. Nur in der Kartenansicht:
  // in der Graph-Ansicht sitzt an derselben Stelle der Play-Button (siehe
  // .scrolly-stage.grafik-ansicht #naechstesKapitel in style.css).
  // kapitelZoomAmount > 0.5 verhindert ein Aufblitzen während des Zoom-
  // Übergangs, naechstesKapitel() blendet ihn im Schlusskapitel 18 aus.
  if (naechstesKapitelEl) {
    let kapitelLokalerFortschritt = constrain(
      map(uebersichtRoutenFortschritt, KAPITEL_EINSTIEG_SCROLL_ENDE, 1, 0, 1), 0, 1);
    // Schwelle exakt dort, wo die LETZTE Annotation erscheint — dieselbe
    // Rechnung wie annIndexZoom in zeichneUebersichtsrouten
    // (floor(fortschritt * anzahl) erreicht anzahl-1). Ein fester Wert wie
    // 0.995 läge je nach Kapitellänge davor oder dahinter; bei 79
    // Annotationen etwa erst deutlich nach der letzten.
    let endDaten = datenFuerKapitel(zoomedKapitel);
    let anzahl = endDaten && endDaten.annotationen ? endDaten.annotationen.length : 0;
    let amEnde = !!zoomedKapitel && kapitelZoomAmount > 0.5
      && kapitelAnsichtsModus === 'karte'
      && anzahl > 0 && kapitelLokalerFortschritt >= (anzahl - 1) / anzahl
      && !!naechstesKapitel(zoomedKapitel);
    naechstesKapitelEl.classList.toggle('sichtbar', amEnde);
  }

  if (aktuelleAnnotation) {
    annotationText.textContent = '«' + aktuelleAnnotation.text + '»';
    annotationText.style.opacity = 1;
    annotationInner.style.opacity = 1;
    annotationInner.style.background = 'rgba(226, 230, 225, 0.85)';
    let catColor = CATEGORY_COLORS[aktuelleAnnotation.category] || ROUTE_COLOR;
    let fwertColor = FWERT_COLORS[aktuelleAnnotation.fWertType] || FWERT_COLOR;
    annotationBar.style.background = aktuelleAnnotation.hasFwert
      ? `linear-gradient(90deg, ${catColor}, ${fwertColor})`
      : catColor;
    annotationTag.textContent = CATEGORY_LABELS[aktuelleAnnotation.category] || '';
  } else {
    annotationText.style.opacity = 0;
    annotationInner.style.opacity = 0;
    annotationTag.textContent = '';
  }

  // Kapitelregister (inkl. Plan/Graph + Alle oben drin) — sichtbar in JEDER
  // Kapitel-Ansicht (inKapitelAnsicht, oben berechnet: zoomedKapitel ODER
  // Kapitel 1s eigener Kartenausschnitt) UND zusätzlich schon in der
  // Übersicht (alle Kapitelrouten gleichzeitig, uebersichtRoutenFortschritt
  // > 0, noch kein Kapitel gezoomt) — so lässt sich von dort direkt in ein
  // Kapitel springen, ohne erst eines anklicken zu müssen. Nicht mehr im
  // letzten Akt (Kreisvergleich, kreisVergleichMapFade > 0), der ersetzt die
  // Übersichtskarte durch das Kreis-Raster. Legende bleibt bewusst NUR in
  // der eigentlichen Kapitel-Ansicht sichtbar (in der Übersicht gibt es
  // keine Kreisgrafik, die sie erklären könnte).
  let inUebersichtRouten = uebersichtRoutenFortschritt > 0 && !zoomedKapitel && kreisVergleichMapFade <= 0;
  kapitelRegister.classList.toggle('sichtbar', inKapitelAnsicht || inUebersichtRouten);

  // Legende und Prolog sind überall sichtbar AUSSER auf der Startkarte —
  // dort soll nichts vom Einstieg ablenken. Auf der Schlusskarte bleibt nur
  // der Prolog stehen: die Kreisgrafik ist dann verblasst, die Legende hätte
  // nichts mehr zu erklären.
  //
  // Beide Register hängen an einem gemeinsamen fixed-Container und werden
  // über visibility (nicht display) geschaltet — der Prolog bleibt deshalb
  // an seinem Platz, auch wenn die Legende darüber verschwindet.
  let aufStartkarte = progress < SCROLL_MEILENSTEINE.zoomStart;
  let aufSchlusskarte = progress >= SCROLL_MEILENSTEINE.startkarteStart;
  legendeBox.classList.toggle('sichtbar', !aufStartkarte && !aufSchlusskarte);
  prologBox.classList.toggle('sichtbar', !aufStartkarte);

  // Ausgefahrener Inhalt fährt ein, sobald sein Register verschwindet —
  // taucht es später wieder auf, startet es eingefahren (nur der Tab) statt
  // im zuletzt offenen Stand.
  if (aufStartkarte || aufSchlusskarte) {
    legendeBox.classList.remove('offen');
    registerTabs.classList.remove('legende-offen');
  }
  if (aufStartkarte) {
    prologBox.classList.remove('offen');
    registerTabs.classList.remove('prolog-offen');
  }
  // Plan/Graph (inkl. Leerzeile darunter) braucht es nur innerhalb einer
  // echten Kapitel-Ansicht — in der Übersicht gibt es keine Karte/Grafik zum
  // Umschalten, dafür ist dort "Alle" selbst der aktive Eintrag.
  modusZeile.classList.toggle('versteckt', !inKapitelAnsicht);
  leerzeile.classList.toggle('versteckt', !inKapitelAnsicht);
  alleEintrag.classList.toggle('aktiv', inUebersichtRouten);
  if (inKapitelAnsicht) {
    planEintrag.classList.toggle('aktiv', kapitelAnsichtsModus === 'karte');
    graphEintrag.classList.toggle('aktiv', kapitelAnsichtsModus === 'grafik');
    Object.entries(kapitelRegisterEintraege).forEach(([nr, eintrag]) => {
      eintrag.classList.toggle('aktiv', zoomedKapitel ? nr === zoomedKapitel : nr === '01');
    });
  } else if (inUebersichtRouten) {
    // Neutral bis auf "Alle" (oben schon gesetzt): kein Kapitel ist "aktiv",
    // sonst bliebe eine veraltete Hervorhebung vom zuletzt betrachteten
    // Kapitel stehen.
    Object.values(kapitelRegisterEintraege).forEach(eintrag => eintrag.classList.remove('aktiv'));
  }

  // Orte-ohne-Adresse-Box direkt unterhalb des Kapitelregisters andocken
  // (dessen Höhe variiert nicht, aber so bleibt es robust gegen künftige
  // Änderungen an der Registergröße) — nur in der Kartenansicht relevant,
  // im Strahl-Modus (Spine) gibt es keine geografischen Kreise.
  orteOhneAdresse.classList.toggle('sichtbar', inKapitelAnsicht && kapitelAnsichtsModus === 'karte');
  if (inKapitelAnsicht) {
    let registerRect = kapitelRegister.getBoundingClientRect();
    orteOhneAdresse.style.top = (registerRect.bottom + 12) + 'px';
  }

  // Untere Scroll-Fortschritt-Leiste: nur ausserhalb jeder Kapitel-Ansicht
  // sichtbar (dort ersatzlos in der Kartenansicht, ersetzt durch den
  // Play-Button in der grafischen Ansicht).
  scrollFortschritt.classList.toggle('versteckt', inKapitelAnsicht);
  grafikPlayButton.classList.toggle('sichtbar', inKapitelGrafikAnsicht);
  grafikPlayButton.textContent = grafikSpielt ? '❚❚' : '▶';

  // Kartenbezogene DOM-Overlays (Ortsmarker, Gedanken-Spalte, Karten-
  // Markierungen, Annotation-Box) blenden sich in der grafischen Ansicht
  // per CSS aus (siehe .scrolly-stage.grafik-ansicht in style.css).
  stage.classList.toggle('grafik-ansicht', inKapitelGrafikAnsicht);

  // Legende an die Ansicht anpassen: in der Graph-Ansicht sind die
  // Valenz-Halbkreise oben/unten geteilt, auf der Karte links/rechts.
  if (legendeValenzText) {
    legendeValenzText.textContent = inKapitelGrafikAnsicht ? LEGENDE_VALENZ_GRAPH : LEGENDE_VALENZ_KARTE;
    legendeValenzKreis.classList.toggle('valenz-oben-unten', inKapitelGrafikAnsicht);
    legendeFwertHinweis.textContent = inKapitelGrafikAnsicht ? LEGENDE_FWERT_GRAPH : LEGENDE_FWERT_KARTE;
  }

  // DOM-Marker
  let stageRect = stage.getBoundingClientRect();

  gedankenEintraege.forEach(g => {
    let rv = stationenData.route[g.nachStation].revealIndex;
    // Gedanken-Spalte (Kapitel-1-Ansicht) für den Moment komplett ausgeblendet.
    let sichtbar = false;
    g.el.classList.toggle('sichtbar', sichtbar);
    if (!sichtbar) return;

    let dotRect = g.dot.getBoundingClientRect();
    let cx = dotRect.left + dotRect.width / 2 - stageRect.left;
    let cy = dotRect.top + dotRect.height / 2 - stageRect.top;
    let bc = zaehleAnnotationenLiveNachOrtBasis(GEDANKEN_FILTER[g.ort] || g.ort, annIndex);
    zeichneKreiseFuerRun(cx, cy, bc);
  });
  // Ortspunkte/Labels auf der Karte (Kapitel-1-Ansicht) für den Moment
  // ausgeblendet — Route/Kreisgrafik/Spine bleiben davon unberührt sichtbar.
  markierungsEintraege.forEach(m => {
    let p = lonLatToScreen(m.lon, m.lat, activeBbox);
    m.el.style.left = p.x + 'px';
    m.el.style.top = p.y + 'px';
    m.el.classList.toggle('sichtbar', false);
  });
  stationsMarker.forEach(m => {
    let p = lonLatToScreen(m.lon, m.lat, activeBbox);
    m.el.style.left = p.x + 'px';
    m.el.style.top = p.y + 'px';
    m.el.classList.toggle('sichtbar', false);
  });
  zwischenMarker.forEach(m => {
    let p = lonLatToScreen(m.lon, m.lat, activeBbox);
    m.el.style.left = p.x + 'px';
    m.el.style.top = p.y + 'px';
    m.el.classList.toggle('sichtbar', false);
  });

  // Hero / Marker Opacity
  let heroProgress = constrain(map(progress, SCROLL_MEILENSTEINE.heroFadeStart, SCROLL_MEILENSTEINE.heroFadeEnd, 0, 1), 0, 1);
  let heroFade = heroProgress * heroProgress * heroProgress;
  let heroOpacity = 1 - heroFade;
  heroText.forEach(el => el.style.opacity = heroOpacity);

  // Begleittexte: beliebig viele <p class="begleittext" data-von="…" data-bis="…">
  // — jeder blendet sich in seinem eigenen Scroll-Fenster (Anteil 0–1 der
  // gesamten Scrollstrecke) ein und wieder aus. Neue Texte = einfach neue
  // <p>-Tags in index.html, kein JS nötig.
  begleitTexte.forEach(el => {
    let von = parseFloat(el.dataset.von);
    let bis = parseFloat(el.dataset.bis);
    let fadeDauerMax = 0.142857; // 0.2 auf die verlängerte Scrollstrecke umskaliert (2200/3080)
    // Auf höchstens 35% des Anzeige-Fensters begrenzt (statt sonst würden
    // sich Ein- und Ausblend-Rampe bei kurzen Fenstern überlappen, bevor die
    // Box volle Deckkraft erreicht) — lässt zusätzlich ein echtes Plateau bei
    // opacity 1 übrig (mind. 30% des Fensters), statt nur einen einzigen
    // Momentanpunkt zu treffen.
    let fadeDauer = Math.min(fadeDauerMax, (bis - von) * 0.35);
    let opacity = constrain(
      Math.min(
        map(progress, von, von + fadeDauer, 0, 1),
        map(progress, bis - fadeDauer, bis, 1, 0)
      ),
      0, 1
    );
    // Kapitel 1 hat keinen eigenen .kapitel-einstiegstext — in seiner
    // Graph-Ansicht steht an dieser Stelle der Begleittext des laufenden
    // Scroll-Fensters. Damit "Play blendet den Einstiegstext aus" auch dort
    // greift, bekommt er hier denselben Play-Ausblendweg. Nur in der
    // Graph-Ansicht: in der Kartenansicht ist der Begleittext die normale,
    // scroll-gesteuerte Erzählspur und muss unberührt bleiben.
    if (inKapitelGrafikAnsicht && grafikPlayAusblendStart !== null) {
      opacity = Math.min(opacity, 1 - constrain(
        map(millis() - grafikPlayAusblendStart, 0, KAPITEL_EINSTIEG_FADE_MS, 0, 1), 0, 1));
    }
    el.style.opacity = opacity;
  });
  // Kapitel-Einstiegstexte (02–18): zeitbasierter Fade ab Klick-Zeitpunkt
  // (kapitelEinstiegsStartMillis, gesetzt in setzeKapitelAnsichtZurueck) —
  // kein data-von/data-bis möglich, da diese Kapitel per Klick statt per
  // Scroll-Fortschritt öffnen (siehe springeZuKapitelZoom/oeffneKapitelZoom).
  // Zusätzlich mit kapitelZoomAmount multipliziert, damit der Text beim
  // Schliessen/Wechseln synchron mit der Karte mit-ausblendet.
  // Übersichtsakt: jedes Kapitel bekommt seine eigene Scheibe des Akts
  // (i/n .. (i+1)/n, dieselbe Aufteilung wie die Routen in
  // zeichneUebersichtsrouten). Sobald eine Route zu wachsen beginnt, blendet
  // der Einstiegstext dieses Kapitels ein und wieder aus, bevor das nächste
  // an die Reihe kommt.
  let uebersichtScheiben = !zoomedKapitel ? kapitelScheiben() : null;
  let imUebersichtsakt = uebersichtRoutenFortschritt > 0
    && progress < SCROLL_MEILENSTEINE.kreisVergleichStart;

  kapitelEinstiegsTexte.forEach(el => {
    let passtZuOffenemKapitel = el.dataset.kapitel === zoomedKapitel;
    let opacity = 0;

    if (uebersichtScheiben && imUebersichtsakt) {
      let scheibe = uebersichtScheiben.find(sch => sch.nr === el.dataset.kapitel);
      if (scheibe) {
        let lokal = constrain(map(uebersichtRoutenFortschritt, scheibe.von, scheibe.bis, 0, 1), 0, 1);
        // Einblenden über das erste Achtel der Scheibe, ausblenden gegen ihr
        // Ende. Das Fenster ist bewusst breit gehalten: seit die Scheiben
        // nach Routenlänge gewichtet sind, haben kurze Kapitel deutlich
        // weniger Strecke, und ihr Text soll trotzdem lesbar bleiben.
        opacity = Math.min(
          constrain(map(lokal, 0, 0.12, 0, 1), 0, 1),
          1 - constrain(map(lokal, 0.72, 0.88, 0, 1), 0, 1));
      }
    }
    if (passtZuOffenemKapitel && kapitelEinstiegsStartMillis !== null) {
      let elapsed = millis() - kapitelEinstiegsStartMillis;
      let einblenden = constrain(map(elapsed, 0, KAPITEL_EINSTIEG_FADE_MS, 0, 1), 0, 1);
      let ausblenden = 1 - constrain(map(uebersichtRoutenFortschritt,
        KAPITEL_EINSTIEG_SCROLL_START, KAPITEL_EINSTIEG_SCROLL_ENDE, 0, 1), 0, 1);
      // Graph-Ansicht: zusätzlicher, zeitbasierter Ausblendweg ab dem
      // Play-Klick (grafikPlayAusblendStart) — gleiche Dauer wie das
      // Einblenden, damit Text und Animation sauber ineinander übergehen.
      let ausblendenPlay = grafikPlayAusblendStart === null ? 1 :
        1 - constrain(map(millis() - grafikPlayAusblendStart, 0, KAPITEL_EINSTIEG_FADE_MS, 0, 1), 0, 1);
      opacity = Math.min(einblenden, ausblenden, ausblendenPlay) * kapitelZoomAmount * (1 - kreisVergleichMapFade);
    }
    el.style.opacity = opacity;
  });
  // Foto-Marker (separate, additive Ebene) — ganz zuletzt, über allem anderen.
  // Nutzt denselben Offset wie die jeweils sichtbare Karte: kartenOffsetX/Y
  // für Übersichts-/Kapitel-1-Ansicht (blendet dort zwischen 0 und
  // mapOffsetX), aber den FIXEN mapOffsetX/Y, sobald ein einzelnes Kapitel
  // (04–18) gezoomt ist — dessen Kartenausschnitt/Route wird immer mit dem
  // fixen mapOffsetX/Y gezeichnet (siehe kapitelCrop/"Genauere Route" oben),
  // nicht mit kartenOffsetX/Y (das bleibt im letzten Akt durchgehend bei 0).
  // Ohne diese Unterscheidung sassen die Foto-Marker bei offenem
  // Kapitel-Zoom sichtbar neben der eigentlichen Karte.
  let fotoOffsetX = (zoomedKapitel && kapitelZoomAmount > 0.001) ? mapOffsetX : kartenOffsetX;
  let fotoOffsetY = (zoomedKapitel && kapitelZoomAmount > 0.001) ? mapOffsetY : kartenOffsetY;
  letzteActiveBbox = activeBbox;
  letzterFotoOffsetX = fotoOffsetX;
  letzterFotoOffsetY = fotoOffsetY;
  // In der grafischen Ansicht deckt zeichneSpineHorizontal (oben) die Karte
  // bereits vollständig ab — Foto-Marker blieben sonst sichtbar darüber
  // schweben.
  // kartenZoomFaktor fürs Skalieren der Sternchen-Grösse: der grössere von
  // Kapitel-1-eigenem Zoom (zoomAmount) und Kapitel-Zoom (kapitelZoomAmount)
  // — je nachdem, welche der beiden Kartenausschnitt-Arten gerade aktiv ist.
  if (!inKapitelGrafikAnsicht) zeichneFotoMarker(activeBbox, fotoOffsetX, fotoOffsetY, 1 - kreisVergleichMapFade, Math.max(zoomAmount, kapitelZoomAmount));
}

// ---------------------------------------------------------------------------
// Sonifikations-Play-Modus (sonifikation.js) — zeitbasierte Kapitel-1-Wiedergabe
// ---------------------------------------------------------------------------
// Liefert nur noch den Ton (spieleKapitel1SonifikationAudio/
// beendeSonifikationAudio in sonifikation.js) — das Bild dazu ist die ganz
// normale Graph-Ansicht (zeichneSpineHorizontal), siehe toggleGrafikPlay/
// aktuelleGrafikAnimationDauer weiter unten. Frühere Fassung hatte hier ein
// eigenes, per window.sonifikationSpieltAb kurzgeschlossenes Karten-Bild —
// entfernt, da es die Graph-Ansicht beim Abspielen unerwartet verdeckte.

// ---------------------------------------------------------------------------
// Foto-Marker (Fotobank Huma-Num/FNP) — eigenständige, additive Ebene
// ---------------------------------------------------------------------------

function zeichneFotoMarker(activeBbox, offsetX = mapOffsetX, offsetY = mapOffsetY, alphaMultiplier = 1, kartenZoomFaktor = 0) {
  if (alphaMultiplier <= 0) return; // z.B. Kreisvergleich-Akt — keine Karte mehr, also auch keine Foto-Marker
  // Grösse skaliert mit dem Zoom: 11 (wie die Kapitelnummern) nur ganz
  // draussen in der Übersicht — dieselbe Fläche wirkt in einem eingezoomten
  // Kartenausschnitt (viel kleinerer geografischer Ausschnitt auf derselben
  // Canvas-Grösse, alles andere also visuell grösser) winzig. kartenZoomFaktor
  // (0 = Übersicht, 1 = voll in Kapitel-1- oder Kapitel-Kartenausschnitt
  // gezoomt, siehe Aufrufer) skaliert linear bis zur alten festen Grösse
  // (20/24, vor der "wie Kapitelnummern"-Angleichung) hoch.
  let sternGroesse = lerp(11, 20, constrain(kartenZoomFaktor, 0, 1));
  fotoMarkerListe.forEach(f => {
    let pos = lonLatToScreen(f.lon, f.lat, activeBbox, offsetX, offsetY);
    let hover = dist(mouseX, mouseY, pos.x, pos.y) < FOTO_MARKER_TREFFER_RADIUS;

    noStroke();
    fill(hover
      ? color(FWERT_COLOR_RGB.r, FWERT_COLOR_RGB.g, FWERT_COLOR_RGB.b, 255 * alphaMultiplier) // #C2511C
      : color(33, 43, 46, 255 * alphaMultiplier)); // #212B2E
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(hover ? sternGroesse * 1.2 : sternGroesse);
    drawingContext.fillText('*', pos.x, pos.y - 3); // leichte optische Korrektur nach oben (Sternchen-Glyphe); p5s text() bleibt bei laufender Animation manchmal unsichtbar, siehe zeichneSpineHorizontal

    if (hover) {
      textFont("'Source Sans 3', sans-serif"); // wie .annotation-tag (var(--sans)) und die Kreis-Labels/Kapitelnummern
      textStyle(BOLD); // .annotation-tag ist font-weight: 700
      textSize(11);
      let label = f.titel || 'Foto ansehen';
      let tw = textWidth(label) + 16;
      fill(0, 200 * alphaMultiplier);
      rect(pos.x + 10, pos.y - 12, tw, 20, 4);
      fill(255, 255 * alphaMultiplier);
      textAlign(LEFT, CENTER);
      drawingContext.fillText(label, pos.x + 18, pos.y - 2);
    }
  });
  textStyle(NORMAL);
}

function mousePressed() {
  if (kapitelHover === '01') { scrolleZuKapitel1(); return; }
  // Über springeZuKapitelZoom statt direkt über oeffneKapitelZoom: Der
  // Einstiegstext und der Start der Kapitelroute hängen am Fortschritt
  // INNERHALB des uebersichtRouten-Akts (siehe KAPITEL_EINSTIEG_SCROLL_ENDE).
  // Die Routen-Startpunkte sind aber erst sichtbar, wenn man schon ein gutes
  // Stück in den Akt gescrollt hat — ein Klick dort öffnete das Kapitel
  // deshalb mitten im Ablauf: Einstiegstext längst ausgeblendet, Route schon
  // fertig gezeichnet. springeZuKapitelZoom setzt die Scrollposition zuerst
  // an den Anfang des Akts zurück, genau wie der Klick im Kapitelregister.
  if (kapitelHover) { springeZuKapitelZoom(kapitelHover); return; }
  if (!letzteActiveBbox) return;
  for (let f of fotoMarkerListe) {
    let pos = lonLatToScreen(f.lon, f.lat, letzteActiveBbox, letzterFotoOffsetX, letzterFotoOffsetY);
    if (dist(mouseX, mouseY, pos.x, pos.y) < FOTO_MARKER_TREFFER_RADIUS) {
      if (f.fotoUrl) oeffneFotoPopup(f);
      return;
    }
  }
}

function oeffneFotoPopup(f) {
  fotoPopupTitel.textContent = f.titel || '';
  fotoPopupPlz.textContent = f.plz || '';
  fotoPopupBild.src = f.fotoUrl;
  fotoPopupBild.alt = f.titel || '';
  fotoPopupBeschreibung.textContent = f.beschreibung || '';
  fotoPopup.classList.add('offen');
}

function schliesseFotoPopup() {
  fotoPopup.classList.remove('offen');
}

// ---------------------------------------------------------------------------
// Kreise
// ---------------------------------------------------------------------------

function drawHatchedCircle(cx, cy, r, color, alphaSkala = 1) {
  if (r <= 0) return;
  const ctx = drawingContext;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55 * alphaSkala;
  ctx.lineWidth = 1.8;
  for (let ly = cy - r; ly <= cy + r; ly += HATCH_SPACING) {
    ctx.beginPath();
    ctx.moveTo(cx - r, ly);
    ctx.lineTo(cx + r, ly);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

// Orte ohne konkrete Adresse werden nicht mehr in einen einzigen
// "UNBESTIMMT"-Topf geworfen, sondern nach Art des Inhalts getrennt: reine
// Ortsunkenntnis (generisches "Unbestimmt (Kapitel XX)"/PARIS_ALLGEMEIN)
// gegenüber Erinnerung/Phantasie/Wunsch/Gedanken — Inhalte, die gar keine
// reale Szene an einem echten Ort sind, sondern im Kopf der Figur spielen
// (siehe Kapitel 3: Kindheitserinnerung, erträumtes Liebesabenteuer, etc.).
// Reihenfolge hier bestimmt die Stapel-Reihenfolge in zeichneOrteOhneAdresse.
const SAMMELPUNKT_KATEGORIEN = [
  { prefix: 'Erinnerung (Kapitel', label: 'ERINNERUNG' },
  { prefix: 'Phantasie (Kapitel', label: 'PHANTASIE' },
  { prefix: 'Wunsch (Kapitel', label: 'WUNSCH' },
  { prefix: 'Gedanken (Kapitel', label: 'GEDANKEN' },
  { prefix: 'Unbestimmt (Kapitel', label: 'UNBESTIMMT' },
];

function sammelpunktKategorie(ort) {
  if (PARIS_ALLGEMEIN.has(ort)) return 'UNBESTIMMT';
  let treffer = SAMMELPUNKT_KATEGORIEN.find(k => ort.startsWith(k.prefix));
  return treffer ? treffer.label : null;
}

function leereBandCounts() {
  return {
    gold_dunkel: { neg: 0, pos: 0, neutral: 0, unrated: 0 },
    gold_mittel: { neg: 0, pos: 0, neutral: 0, unrated: 0 },
    gold_hell: { neg: 0, pos: 0, neutral: 0, unrated: 0 },
  };
}

// ---------------------------------------------------------------------------
// Platz der Annotationsbox. Sie stand fest oben links und deckte dort je nach
// Kapitel bis zu sechs Ortskreise zu. Statt die Kartenausschnitte dagegen zu
// verschieben (was nur bedingt geht — nach rechts stossen viele Kapitel an den
// rechten Rand, und ein vertikales Verschieben wirkt gar nicht: die Karten sind
// mit Seitenverhältnis 2.45 breiter als jedes übliche Browserfenster und werden
// deshalb seitlich beschnitten, nicht oben/unten) weicht jetzt die Box aus.
//
// Vier Plätze in der Reihenfolge der Bevorzugung: die Box bleibt oben links,
// solange dort nichts Wichtiges liegt, und rückt erst weiter, wenn Kreise oder
// Route darunter geraten. Entschieden wird je Kapitel UND Fenstergrösse (der
// seitliche Beschnitt hängt am Fensterformat, die Kreise liegen also nicht auf
// jedem Bildschirm gleich) und dann zwischengespeichert, damit die Box beim
// Scrollen nicht springt.
// ---------------------------------------------------------------------------
const ANNOTATION_BOX_PLAETZE = ['oben-links', 'unten-links', 'oben-rechts', 'unten-rechts'];
// Manuelle Festlegung je Kapitel ('01'..'18'), überstimmt die automatische
// Wahl — für den Fall, dass ein Kapitel gestalterisch anders liegen soll.
const ANNOTATION_BOX_PLATZ_FEST = {};
const ANNOTATION_BOX_BREITE = 572;   // max-width 520px + 2x26px Innenabstand, siehe .annotation-text
const ANNOTATION_BOX_RAND_X = 0.05;  // left/right 5%, siehe .annotation-box
const ANNOTATION_BOX_RAND_OBEN = 0.10;
const ANNOTATION_BOX_RAND_UNTEN = 0.12;
const annotationBoxPlatzCache = new Map(); // "kapitel|breite|hoehe" -> Platz

function annotationBoxPlatz(kapitelNr, daten, bbox) {
  if (ANNOTATION_BOX_PLATZ_FEST[kapitelNr]) return ANNOTATION_BOX_PLATZ_FEST[kapitelNr];
  let schluessel = `${kapitelNr}|${Math.round(width)}|${Math.round(height)}`;
  if (annotationBoxPlatzCache.has(schluessel)) return annotationBoxPlatzCache.get(schluessel);

  // Boxhöhe aus dem LÄNGSTEN Annotationstext dieses Kapitels — die Box wächst
  // mit dem Text, und ausweichen muss sie für ihren grössten Zustand.
  let stil = getComputedStyle(annotationText);
  let zeilenHoehe = parseFloat(stil.fontSize) * 1.35;
  drawingContext.save();
  drawingContext.font = `${stil.fontSize} ${stil.fontFamily}`;
  let maxZeilen = 1;
  (daten.annotationen || []).forEach(a => {
    let breite = drawingContext.measureText('«' + (a.text || '') + '»').width;
    maxZeilen = Math.max(maxZeilen, Math.ceil(breite / 520));
  });
  drawingContext.restore();
  let boxHoehe = 25 + (maxZeilen + 1) * zeilenHoehe + 24; // +1 Zeile Reserve für den Umbruch

  // Kreise im Endstand (Radien wie in zeichneKreiseFuerRun) und die Route.
  let letzterIndex = daten.annotationen.length - 1;
  let kreise = [];
  (daten.ortRuns || []).forEach(r => {
    if (sammelpunktKategorie(r.ort)) return; // liegt im Kasten, nicht auf der Karte
    let bc = zaehleAnnotationenLiveNachOrtBasis(wohnungFilterFuerOrt(r.ort), letzterIndex, daten);
    let radius = 0;
    KREIS_KATEGORIEN.forEach(kat => {
      let b = bc[kat.key] || {};
      radius = Math.max(radius, kreisRadius((b.neg || 0) + (b.pos || 0) + (b.neutral || 0) + (b.unrated || 0)));
    });
    if (radius <= 0) return;
    let p = lonLatToScreen(r.lon, r.lat, bbox, mapOffsetX, mapOffsetY);
    kreise.push({ x: p.x, y: p.y, r: radius });
  });
  let routenPunkte = (daten.routenPfadDetail || daten.routenPunkte || []).map(
    p => lonLatToScreen(p[0], p[1], bbox, mapOffsetX, mapOffsetY));

  let bester = ANNOTATION_BOX_PLAETZE[0];
  let besteStrafe = Infinity;
  ANNOTATION_BOX_PLAETZE.forEach(platz => {
    let links = platz.endsWith('links');
    let x0 = links ? ANNOTATION_BOX_RAND_X * width : width * (1 - ANNOTATION_BOX_RAND_X) - ANNOTATION_BOX_BREITE;
    let y0 = platz.startsWith('oben') ? ANNOTATION_BOX_RAND_OBEN * height
      : height * (1 - ANNOTATION_BOX_RAND_UNTEN) - boxHoehe;
    let x1 = x0 + ANNOTATION_BOX_BREITE, y1 = y0 + boxHoehe;

    // Ein zugedeckter Kreis wiegt nach seinem Radius — ein grosser Kreis
    // (viele Annotationen) zu verdecken ist schlimmer als ein kleiner.
    let strafe = 0;
    kreise.forEach(k => {
      let dx = Math.max(x0 - k.x, 0, k.x - x1);
      let dy = Math.max(y0 - k.y, 0, k.y - y1);
      if (dx * dx + dy * dy < k.r * k.r) strafe += k.r;
    });
    // Die Route zählt schwächer mit: eine Linie unter der Box stört weniger
    // als ein verdeckter Kreis, soll aber den Ausschlag geben, wenn zwei
    // Plätze sonst gleichauf liegen.
    if (routenPunkte.length) {
      let drin = routenPunkte.filter(p => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1).length;
      strafe += (drin / routenPunkte.length) * 80;
    }
    if (strafe < besteStrafe - 0.001) { besteStrafe = strafe; bester = platz; }
  });

  annotationBoxPlatzCache.set(schluessel, bester);
  return bester;
}

function zeichneKreiseOrtRuns(punktIndex, annIndex, activeBbox, offsetX = mapOffsetX, offsetY = mapOffsetY, daten = stationenData) {
  let runs = daten.ortRuns || [];
  let keineAdresseNachKategorie = new Map(); // Label -> bandCounts
  let labelKandidaten = [];

  runs.forEach(r => {
    if (punktIndex < r.revealIndex) return;
    if (istVorzeitigeErwaehnung(r, daten)) return;
    // Die folgenden drei Ausnahmen gehören zu Kapitel-1-eigenen Mechanismen
    // (Gedanken-Spalte, Wohnung/Rue-Notre-Dame-Split) und dürfen nur dort
    // greifen: sie sind reine Namens-Sets ohne Kapitelbezug, und mehrere
    // automatisch gebaute Kapitel (z.B. Kapitel 3) verwenden zufällig
    // denselben ortBasis-Namen (z.B. "Parc Monceau") für einen eigenen,
    // echten Ort — ohne diesen Kapitel-1-Filter würde dessen Kreis
    // faelschlich komplett unterdrückt.
    if (daten === stationenData) {
      if (WOHNUNG_SAMMELPUNKT_ABSORBIERTE_ORTRUNS.has(r.ort)) return;
      if (GEDANKEN_ORTRUN_UNTERDRUECKT.has(r.ort)) return;
      if (r.ort === RUE_NOTRE_DAME_DE_LORETTE_ORT && annIndex < wohnungSplitAi(daten)) return;
    }
    // Orte ohne echte, konkrete Adresse (Kapitel-1s Alt-Sammelbecken
    // "Paris (allgemein)" & Co. — PARIS_ALLGEMEIN — sowie der generische
    // Sammelpunkt "Unbestimmt (Kapitel XX)" der automatisch gebauten
    // Kapitel 02–18): erscheinen nicht mehr auf der Karte an einer
    // erfundenen Koordinate, sondern gesammelt als ein Kreis unterhalb des
    // Kapitelregisters (siehe zeichneOrteOhneAdresse-Aufruf am Funktionsende).
    let kategorie = sammelpunktKategorie(r.ort);
    if (kategorie) {
      if (!keineAdresseNachKategorie.has(kategorie)) {
        keineAdresseNachKategorie.set(kategorie, leereBandCounts());
      }
      let bc = keineAdresseNachKategorie.get(kategorie);
      ['gold_dunkel', 'gold_mittel', 'gold_hell'].forEach(cat => {
        ['neg', 'pos', 'neutral', 'unrated'].forEach(v => {
          bc[cat][v] += (r.bandCounts[cat]?.[v] || 0);
        });
      });
    } else {
      // Alle ortRuns wachsen live mit annIndex (nicht nur die Hauptorte) —
      // so löst wirklich jede Annotation irgendwo auf der Karte eine
      // sichtbare Änderung aus, statt dass Nebenerwähnungen als fertiger,
      // fest vorberechneter Kreis auf einmal aufploppen.
      let pos = lonLatToScreen(r.lon, r.lat, activeBbox, offsetX, offsetY);
      let filter = wohnungFilterFuerOrt(r.ort);
      let bandCounts = zaehleAnnotationenLiveNachOrtBasis(filter, annIndex, daten);
      let radius = zeichneKreiseFuerRun(pos.x, pos.y, bandCounts, 1);
      let fwertAnnotationen = sammleAnnotationenNachOrtBasis(filter, annIndex, daten).filter(a => a.hasFwert);
      zeichneFwertPunkte(pos.x, pos.y, radius, fwertAnnotationen, 1);
      if (radius > 0) {
        // Label mit demselben Begriff wie in der Spine (r.ort) — erst
        // sammeln, Kollisionen erst nach der Schleife auflösen (siehe
        // zeichneKreisLabels), da sich mehrere Kreise dieselbe Koordinate
        // teilen können (z.B. Aussenraum/Innenraum-Paare).
        // Der Kreis des Routen-Startpunkts ("Lokal in der Nähe der Rue
        // Notre-Dame de Lorette", revealIndex 0) ist schon auf der Startseite
        // zu sehen — seine Beschriftung soll dort aber noch fehlen und erst
        // mit dem Kapitel-1-Kartenausschnitt einblenden. Deckkraft daher am
        // Zoomstand (kapitel1ZoomAmount) statt fest 1. Farbe wie alle anderen
        // Labels (#212B2E); vorher stand hier fest #9DA69D.
        let istRoutenStart = daten === stationenData && r.ort === WOHNUNG_SAMMELPUNKT_ANKER;
        labelKandidaten.push({
          ankerX: pos.x, ankerY: pos.y,
          x: pos.x, y: pos.y + 15,
          text: r.ort.toUpperCase(), // .annotation-tag ist text-transform: uppercase
          farbe: null,
          alpha: istRoutenStart ? kapitel1ZoomAmount : 1,
        });
      }
    }
  });

  zeichneKreisLabels(labelKandidaten);

  if (keineAdresseNachKategorie.size > 0) {
    zeichneOrteOhneAdresse(keineAdresseNachKategorie);
  }
}

// Kreise + Labels für Orte ohne konkrete Adresse — Startposition kommt aus
// der unsichtbaren .orte-ohne-adresse-Box in index.html (direkt unterhalb
// des Kapitelregisters angedockt, siehe draw()), nicht aus lon/lat. Mehrere
// Kategorien (Erinnerung/Phantasie/Wunsch/Gedanken/Unbestimmt) stapeln sich
// untereinander in fester, grosszügiger Distanz (max. Kreisdurchmesser laut
// kreisRadius ist 2*100px, plus Label-Zeile darunter) — nur Kategorien mit
// tatsächlichem Inhalt (radius > 0) belegen einen Stapelplatz.
function zeichneOrteOhneAdresse(nachKategorie) {
  let rect = orteOhneAdresse.getBoundingClientRect();
  let cx = rect.left + rect.width / 2;
  let cy = rect.top + rect.height / 2;
  // Die Box dockt unterhalb des vollen 18-Kapitel-Registers an, d.h. sie
  // sitzt oft schon nahe am unteren Bildschirmrand — nach unten bleibt wenig
  // Luft. Abstand bewusst knapp gewählt (reicht für die aktuell einzigen
  // mehrfach gleichzeitig aktiven Kategorien, Kapitel 3: max. ~44px Radius);
  // sollte ein Kapitel künftig mehrere SEHR grosse Kategorien gleichzeitig
  // haben, müsste die Anordnung grundsätzlicher überarbeitet werden (z.B.
  // horizontal statt vertikal stapeln).
  const STAPEL_ABSTAND = 90;

  let reihenfolge = SAMMELPUNKT_KATEGORIEN.map(k => k.label);
  let platz = 0;
  reihenfolge.forEach(label => {
    let bandCounts = nachKategorie.get(label);
    if (!bandCounts) return;
    let y = cy + platz * STAPEL_ABSTAND;
    let radius = zeichneKreiseFuerRun(cx, y, bandCounts);
    if (radius > 0) {
      zeichneKreisLabels([{
        ankerX: cx, ankerY: y,
        x: cx, y: y + 15,
        text: label,
        farbe: null,
      }]);
      platz++;
    }
  });
}

// Zeichnet die Kreis-Labels und löst dabei Überlagerungen auf: Kandidaten
// (sortiert von oben nach unten) werden nacheinander platziert, ein Label
// wird nach unten versetzt, sobald es die Bounding-Box eines bereits
// platzierten Labels überlappen würde (z.B. bei Aussenraum/Innenraum-Paaren,
// die dieselbe Koordinate teilen). Bei nennenswertem Versatz zeigt eine
// gestrichelte Linie an, zu welchem Kreis das Label gehört.
function zeichneKreisLabels(kandidaten) {
  // Vollständig transparente Kandidaten (alpha 0, z.B. der Routen-Startpunkt
  // auf der Startseite) fallen ganz raus — sie sollen auch keinen Platz im
  // Kollisions-Layout belegen und keine Hilfslinie ziehen.
  kandidaten = kandidaten.filter(k => (k.alpha === undefined ? 1 : k.alpha) > 0.002);
  if (kandidaten.length === 0) return;

  noStroke();
  fill(33, 43, 46, 255); // #212B2E, wie die Kapitelnummern
  textFont("'Source Sans 3', sans-serif"); // wie .annotation-tag (var(--sans)) und die Spine-Labels
  textSize(11);
  textStyle(BOLD); // .annotation-tag ist font-weight: 700
  textAlign(LEFT, CENTER);

  let labelHoehe = 14, padding = 4;
  let platziert = [];

  kandidaten
    .map(k => ({ ...k, w: textWidth(k.text) }))
    .sort((a, b) => a.y - b.y)
    .forEach(k => {
      let y = k.y;
      let ueberlappt = true;
      while (ueberlappt) {
        ueberlappt = platziert.some(p =>
          y < p.y + labelHoehe + padding && y + labelHoehe + padding > p.y &&
          k.x < p.x + p.w && k.x + k.w > p.x
        );
        if (ueberlappt) y += labelHoehe + padding;
      }
      platziert.push({ x: k.x, y, w: k.w });

      let alpha = k.alpha === undefined ? 1 : k.alpha;
      if (Math.abs(y - k.y) > 1) {
        stroke(0, 100 * alpha);
        strokeWeight(0.8);
        drawingContext.setLineDash([2, 3]);
        line(k.ankerX, k.ankerY, k.x - 4, y);
        drawingContext.setLineDash([]);
        noStroke();
      }
      if (k.farbe) fill(k.farbe);
      else fill(33, 43, 46, 255 * alpha); // #212B2E
      // p5s text() bleibt hier während des Scrollens (viele Frames/Sekunde,
      // wechselnde Werte) manchmal unsichtbar, obwohl der Canvas-Context
      // nachweislich korrekt gesetzt ist (siehe zeichneSpineHorizontal,
      // gleicher Bug/Workaround) — direkt über den Canvas-Context gezeichnet,
      // fillStyle kommt schon vom fill()-Aufruf oben.
      drawingContext.fillText(k.text, k.x, y);
    });
}

// Vollflächiger Halbkreis (PIE-Modus über exakt 180°, daher ohne sichtbaren
// Keil-Rand — die beiden Radiuslinien am Rand liegen genau gegenüber und
// bilden zusammen den Durchmesser). winkelMitte = Bildschirm-Winkel der
// Mitte der Wölbung (p5-Konvention: 0 = rechts, wächst im Uhrzeigersinn).
// Deckkraft (0.75) und Multiply-Blend wie im alten Entwurf
// (kapitel01-embed.js/addBand) — blend=true für gold_hell/gold_dunkel,
// blend=false (normale, deckende Basis) für gold_mittel; siehe Aufrufer.
// p5s arc()/ellipse() bleiben bei laufender Animation (viele Frames/
// Sekunde, wechselnde Werte) manchmal unsichtbar, obwohl alle Canvas-
// Context-Eigenschaften (fillStyle/globalAlpha/composite) nachweislich
// korrekt gesetzt sind — derselbe Bug wie bei p5s text(), siehe
// zeichneSpineHorizontal. Beide Formen deshalb direkt über den
// Canvas-Context gezeichnet statt über p5s arc()/ellipse().
function zeichneHalbkreis(cx, cy, r, winkelMitte, farbeRgb, alphaSkala = 1, blend = false) {
  if (r <= 0) return;
  let ctx = drawingContext;
  if (blend) ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgba(${farbeRgb[0]}, ${farbeRgb[1]}, ${farbeRgb[2]}, ${0.75 * alphaSkala})`;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, winkelMitte - HALF_PI, winkelMitte + HALF_PI);
  ctx.closePath();
  ctx.fill();
  if (blend) ctx.globalCompositeOperation = 'source-over';
}

// Vollflächiger Kreis für neutrale Valenz — dieselbe Deckkraft/Blend-Logik
// wie zeichneHalbkreis (s.o.), aber als ganze Fläche statt Halbkreis:
// neutral hat keine Links/Rechts- bzw. Oben/Unten-Seite wie neg/pos.
function zeichneVollkreis(cx, cy, r, farbeRgb, alphaSkala = 1, blend = false) {
  if (r <= 0) return;
  let ctx = drawingContext;
  if (blend) ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgba(${farbeRgb[0]}, ${farbeRgb[1]}, ${farbeRgb[2]}, ${0.75 * alphaSkala})`;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TWO_PI);
  ctx.fill();
  if (blend) ctx.globalCompositeOperation = 'source-over';
}

// winkel: feste (NICHT von der Routenrichtung abgeleitete) Basis für die
// Links/Rechts-Aufteilung der Valenz-Halbkreise, siehe unten — Default
// -HALF_PI ("nach oben ausgerichtet") ergibt neg=links/pos=rechts, die
// senkrechte Trennlinie für alle geografisch verstreuten Kreise (Karte,
// Orte-ohne-Adresse, Kreisvergleich). Die horizontale Spine
// (zeichneSpineHorizontal) übergibt stattdessen 0 ("nach rechts
// ausgerichtet") für neg=oben/pos=unten — bei einer Reihe nebeneinander
// liegender Kreise würde eine links/rechts-Teilung benachbarte Kreise
// gegenseitig überlappen/verdecken, eine oben/unten-Teilung bleibt dagegen
// innerhalb der eigenen Spalte.
// radiusSkala/maxRadius: nur die Übersichtskarten-Knoten nutzen sie (siehe
// zeichneVergleichsKnoten) — dort werden die Radien ohne Deckel berechnet und
// danach gemeinsam so weit verkleinert, dass die senkrecht gestaffelten Kreise
// ins Fenster passen. Die Skalierung greift am fertigen Radius, nicht über
// eine Canvas-Transformation: so behalten Schraffur-Abstand und Strichstärken
// ihre normale Grösse.
function zeichneKreiseFuerRun(cx, cy, bandCounts, alphaSkala = 1, winkel = -HALF_PI, radiusSkala = 1, maxRadius = 100) {
  // Zwei Ebenen, jede für sich nach Radius geordnet (kleinste zuoberst,
  // mittlere danach, grösste zuunterst): unten die schraffierten
  // Gesamt-Kreise (neg+pos+neutral+unrated) der 3 Kategorien, darüber die
  // flächigen Valenz-Formen (neg/pos als Halbkreis, neutral als ganzer
  // Kreis). Die Ebenen selbst bleiben in dieser Reihenfolge FEST (schraffiert
  // immer unten) — sonst könnte eine flächenmässig kleinere Schraffur einer
  // Kategorie eine grössere Valenz-Fläche einer ANDEREN Kategorie zudecken,
  // die Kreisgrafik wirkte dann unvollständig (schraffiert statt farbig).
  let hatchFormen = [];
  let flaechenFormen = [];
  let groessterHatchRadius = 0;

  KREIS_KATEGORIEN.forEach(k => {
    let bc = bandCounts[k.key] || {};
    let n = (bc.neg || 0) + (bc.pos || 0) + (bc.neutral || 0) + (bc.unrated || 0);
    let hatchR = kreisRadius(n, maxRadius) * radiusSkala;
    if (hatchR > groessterHatchRadius) groessterHatchRadius = hatchR;
    if (hatchR > 0) {
      let hex = '#' + k.farbe.map(v => v.toString(16).padStart(2, '0')).join('');
      hatchFormen.push({ r: hatchR, zeichne: () => drawHatchedCircle(cx, cy, hatchR, hex, alphaSkala) });
    }

    // blend=true (Multiply) für gold_hell/gold_dunkel, blend=false (normale,
    // deckende Fläche) für gold_mittel — wie im alten Entwurf
    // (kapitel01-embed.js/addBand). winkel bewusst NICHT an die lokale
    // Laufrichtung der Route angelehnt, sondern fest: die Trennlinie
    // zwischen neg/pos dreht sich nie mit der Route mit. Kartenansicht
    // (Default -HALF_PI): negativ links, positiv rechts. Graph-Ansicht
    // (winkel PI, siehe zeichneSpineHorizontal): positiv oben, negativ
    // unten — dort liegen die Kreise auf einer waagrechten Linie, eine
    // Links/Rechts-Teilung liefe mit der Leserichtung mit statt quer dazu.
    let blend = k.key !== 'gold_mittel';
    let negR = kreisRadius(bc.neg || 0, maxRadius) * radiusSkala;
    let posR = kreisRadius(bc.pos || 0, maxRadius) * radiusSkala;
    let neutralR = kreisRadius(bc.neutral || 0, maxRadius) * radiusSkala;
    if (negR > 0) flaechenFormen.push({ r: negR, zeichne: () => zeichneHalbkreis(cx, cy, negR, winkel - HALF_PI, k.farbe, alphaSkala, blend) });
    if (posR > 0) flaechenFormen.push({ r: posR, zeichne: () => zeichneHalbkreis(cx, cy, posR, winkel + HALF_PI, k.farbe, alphaSkala, blend) });
    // Neutrale Valenz: ganzer flächiger Kreis statt Halbkreis — hat keine
    // Links/Rechts- bzw. Oben/Unten-Seite wie neg/pos.
    if (neutralR > 0) flaechenFormen.push({ r: neutralR, zeichne: () => zeichneVollkreis(cx, cy, neutralR, k.farbe, alphaSkala, blend) });
  });

  hatchFormen.sort((a, b) => b.r - a.r).forEach(f => f.zeichne());
  flaechenFormen.sort((a, b) => b.r - a.r).forEach(f => f.zeichne());

  if (groessterHatchRadius > 0) {
    // p5s ellipse() bleibt bei laufender Animation manchmal unsichtbar,
    // siehe zeichneHalbkreis — direkt über den Canvas-Context gezeichnet.
    drawingContext.fillStyle = `rgba(0, 0, 0, ${alphaSkala})`;
    drawingContext.beginPath();
    drawingContext.arc(cx, cy, 4, 0, TWO_PI);
    drawingContext.fill();
  }

  return groessterHatchRadius; // fuer Label-Platzierung durch den Aufrufer
}

// Pixel-Durchmesser je F-Wert-Punktgrösse (1..3, siehe FWERT_PUNKTGROESSE in
// datenbereinigung.js), sowie Ring-/Randabstände für zeichneFwertPunkte.
const FWERT_PUNKT_DURCHMESSER = { 1: 5, 2: 7.5, 3: 10 };
const FWERT_PUNKT_FARBE_RGB = hexZuRgb(FWERT_PUNKT_FARBE);
const FWERT_PUNKT_RAND_ABSTAND = 6; // Luft zwischen Kreisrand und erstem Punkte-Ring
const FWERT_PUNKT_RING_ABSTAND = 8; // Abstand zwischen zwei Punkte-Ringen, falls ein Drittel nicht in einen Ring passt

// F-Wert-Punkte ausserhalb des Kreisdiagramms: jede Annotation mit F-Wert
// (a.hasFwert) bekommt hier — anders als die aggregierten bandCounts — einen
// EIGENEN Punkt. Grösse nach F-Wert-Typ (FWERT_PUNKTGROESSE: 1 Raum löst
// Emotion aus, 2 Emotion färbt Raum, 3 Körper als Sensor), Farbe einheitlich
// (FWERT_PUNKT_FARBE). Position: eines von drei 120°-Dritteln rund um den
// Kreis, auf derselben Seite wie der Valenz-Halbkreis derselben Bewertung
// (siehe anordnung unten und zeichneKreiseFuerRun).
// Reichen die Punkte eines Drittels nicht auf einen Bogen, wachsen
// weitere, weiter aussen liegende Ringe nach (z.B. "Cannes", Kapitel 8, mit
// 87 F-Wert-Annotationen an einem einzigen Ort).
function zeichneFwertPunkte(cx, cy, kreisRadius, fwertAnnotationen, alphaSkala = 1, anordnung = 'seitlich') {
  if (!fwertAnnotationen.length || kreisRadius <= 0) return;

  const DRITTEL = TWO_PI / 3;
  // Gruppenmitten [negativ, positiv, neutral/unbewertet] je Anordnung. Sie
  // folgen der Teilung der Halbkreise in zeichneKreiseFuerRun, damit die
  // Punkte einer Valenz auf DERSELBEN Seite liegen wie ihre Fläche:
  //   'seitlich' (Karte, Halbkreise links/rechts): negativ oben-links,
  //     positiv oben-rechts, neutral unten — die beiden Valenz-Gruppen
  //     liegen als Drittel-Paar symmetrisch um die Senkrechte.
  //   'obenUnten' (Graph, Halbkreise oben/unten): positiv GENAU oben,
  //     negativ GENAU unten, neutral rechts daneben. Hier lassen sich die
  //     Mitten nicht aus einer gemeinsamen Drehung ableiten — oben und unten
  //     liegen 180° auseinander, drei gleiche Drittel aber nur 120°. Darum
  //     stehen sie hier fest, statt wie bei 'seitlich' aus einem Winkel
  //     berechnet zu werden.
  let mitten = anordnung === 'obenUnten'
    ? [HALF_PI, -HALF_PI, 0]
    : [-HALF_PI - DRITTEL / 2, -HALF_PI + DRITTEL / 2, HALF_PI];
  let gruppen = mitten.map(mitte => ({ mitte, formen: [] }));
  fwertAnnotationen.forEach(a => {
    let gruppe = a.valenz === -1 ? gruppen[0] : a.valenz === 1 ? gruppen[1] : gruppen[2];
    let groesse = FWERT_PUNKTGROESSE[a.fWertType] || 1;
    gruppe.formen.push({
      d: FWERT_PUNKT_DURCHMESSER[groesse],
      rgb: FWERT_PUNKT_FARBE_RGB,
    });
  });

  noStroke();
  gruppen.forEach(({ mitte, formen }) => {
    if (!formen.length) return;
    let ringRadius = kreisRadius + FWERT_PUNKT_RAND_ABSTAND;
    let rest = formen;
    while (rest.length) {
      let bogenlaenge = ringRadius * DRITTEL;
      let platz = 0;
      let anzahlImRing = 0;
      for (let f of rest) {
        let breite = f.d + 2; // Mindestabstand zwischen benachbarten Punkten
        if (anzahlImRing > 0 && platz + breite > bogenlaenge) break;
        platz += breite;
        anzahlImRing++;
      }
      let ringFormen = rest.slice(0, anzahlImRing);
      rest = rest.slice(anzahlImRing);

      // Etwas schmaler als das volle Drittel verteilt, damit Punkte an der
      // Drittel-Grenze nicht ins Nachbar-Drittel hineinragen.
      let spanne = DRITTEL * 0.8;
      let n = ringFormen.length;
      ringFormen.forEach((f, i) => {
        let winkelPunkt = n === 1 ? mitte : mitte - spanne / 2 + (i / (n - 1)) * spanne;
        let x = cx + Math.cos(winkelPunkt) * ringRadius;
        let y = cy + Math.sin(winkelPunkt) * ringRadius;
        // p5s ellipse() bleibt bei laufender Animation manchmal unsichtbar,
        // siehe zeichneHalbkreis — direkt über den Canvas-Context gezeichnet.
        drawingContext.fillStyle = `rgba(${f.rgb.r}, ${f.rgb.g}, ${f.rgb.b}, ${alphaSkala})`;
        drawingContext.beginPath();
        drawingContext.arc(x, y, f.d / 2, 0, TWO_PI);
        drawingContext.fill();
      });

      ringRadius += FWERT_PUNKT_RING_ABSTAND;
    }
  });
}

// Das frühere 4er-Raster des Kreisvergleichs (zeichneKreisVergleich) ist
// entfallen — dieselbe Information steht jetzt an den echten Orten auf der
// Karte, siehe zeichneOrtsveraenderung. kreisvergleich-orte.json bleibt als
// Datenartefakt bestehen: baue-sammelpunkte-handkuriert.py prüft bei jedem
// Kapitel-Neubau dagegen, ob sich die kapitelübergreifenden Summen geändert
// haben.

function zeichneRoute(punkte, upToIndex, bbox, strichstaerke = 2, offsetX = mapOffsetX, offsetY = mapOffsetY, alphaMultiplier = 1) {
  if (upToIndex < 1) return;
  let fadeStrecke = 20, minAlpha = 20, maxAlpha = 255;
  noFill();
  strokeWeight(strichstaerke);
  for (let i = 0; i < upToIndex && i < punkte.length - 1; i++) {
    let alter = upToIndex - i;
    let alpha = constrain(map(alter, 0, fadeStrecke, maxAlpha, minAlpha), minAlpha, maxAlpha) * alphaMultiplier;
    stroke(ROUTE_COLOR_RGB.r, ROUTE_COLOR_RGB.g, ROUTE_COLOR_RGB.b, alpha);
    let p0 = lonLatToScreen(punkte[i][0], punkte[i][1], bbox, offsetX, offsetY);
    let p1 = lonLatToScreen(punkte[i + 1][0], punkte[i + 1][1], bbox, offsetX, offsetY);
    line(p0.x, p0.y, p1.x, p1.y);
  }
}

// Die sieben kapitelübergreifenden Orte der Ortsveränderung (Schlussakt,
// siehe zeichneOrtsveraenderung). Jeder ist an seiner echten Koordinate
// verankert; die senkrechte Linie darunter ist eine Zwischenphase, an deren
// Ende die Punkte wieder auf ihrem Ort liegen.
//
// Orte mit mehreren Namen teilen sich einen Anker: Rue Fontaine (Forestiers
// Wohnung, dann Duroys) und Rue Constantinople sind ohnehin dieselbe Adresse,
// die Madeleine-Varianten liegen 51 m auseinander. Die beiden Walter-Adressen
// sind 465 m getrennt — der Anker liegt in ihrer Mitte.
const VERGLEICHS_KNOTEN = [
  { label: 'Redaktion La Vie Française', lon: 2.34663, lat: 48.87224,
    namen: ['Redaktion La Vie Française'] },
  { label: 'Wohnung Duroy/Madeleine (17 Rue Fontaine)', lon: 2.33417, lat: 48.88147,
    namen: ['Wohnung Forestier (17 Rue Fontaine)', 'Wohnung Duroy/Madeleine (17 Rue Fontaine)'] },
  { label: 'Rue Constantinople 127', lon: 2.31921, lat: 48.88037,
    namen: ['Rue Constantinople 127', 'Wohnung Du Roy (Rue Constantinople 127)'] },
  { label: 'Palais Walter, Faubourg Saint-Honoré', lon: 2.31919, lat: 48.87126,
    namen: ['Boulevard Malesherbes (Walters Haus)', 'Palais Walter, Faubourg Saint-Honoré'] },
  { label: 'Georges Duroys Wohnung (Rue Boursault)', lon: 2.31879, lat: 48.88519,
    namen: ['Georges Duroys Wohnung (Rue Boursault)'] },
  { label: 'Place de la Madeleine', lon: 2.32439, lat: 48.86993,
    namen: ['Place de la Madeleine', 'Église de la Madeleine, Paris'] },
  // Einziger öffentlicher Ort neben der Madeleine, der über mehrere Kapitel
  // trägt — aber nur, wenn man die kapitelweise vergebenen Einzelnamen wieder
  // zusammenführt: derselbe Boulevard heisst je nach Kapitel "Boulevard des
  // Italiens", "Café Riche", "Café Tortoni" oder "Café am Boulevard". Einzeln
  // steht jeder davon in genau einem Kapitel, zusammen sind es sieben.
  // Bewusst NICHT dabei: die ÄUSSEREN Boulevards (Weinstube und verdächtige
  // Lokale, lat 48.883 — eine andere Achse im Norden), der Boulevard
  // Malesherbes (das ist das Haus Walter, eigener Knoten) und der Boulevard
  // des Batignolles. Das Label ist als einziges kein Kapitelname: für die
  // Gruppe gibt es keinen, "Grands Boulevards" ist der historische Name der
  // Achse.
  { label: 'Grands Boulevards', lon: 2.33617, lat: 48.87124,
    namen: ['Boulevard des Italiens', 'Boulevard des Capucines', 'Boulevard Poissonnière',
      'Café Riche, Boulevard des Italiens, Paris', 'Café Tortoni, Boulevard des Italiens',
      'Café am Boulevard (Näherung Boulevard Poissonière)', 'Café-Chantant am Boulevard des Capucines',
      'Théâtre du Vaudeville, Boulevard des Capucines', 'Juwelierladen am Boulevard des Capucines',
      'Boulevard-Cafés (unterwegs), Paris'] },
];
// ── Schlussakt "Ortsveränderung" ───────────────────────────────────────────
// Ablauf über den letzten Akt (kreisVergleichStart..1.0), als Anteile davon.
// Die Phasen überlappen bewusst, damit nichts hart einsetzt.
//   1. Die senkrechten Linien wachsen gestaffelt nach unten — erst hier,
//      wenn die letzte Übersichtsroute fertig gezeichnet ist.
//   2. Die Karte blendet aus. Die ROUTEN bleiben stehen: auf sie sollen die
//      Ortspunkte gleich zu liegen kommen.
//   3. Die Linien schrumpfen wieder, die Punkte landen auf ihrem echten Ort.
//   4. Die Ortsbeschriftung blendet ein — sobald die Linien ausgewachsen
//      sind und bevor sie zurückschrumpfen. Sie hängt am unteren Ende der
//      Linie und fährt beim Schrumpfen mit dem Punkt nach oben.
//   5. Zoom auf den Ausschnitt, der alle sieben Orte fasst — dadurch rücken
//      sie weit genug auseinander, dass die Kreise sich nicht überlagern.
//      Läuft GLEICHZEITIG mit dem Schrumpfen der Linien an: die Punkte
//      fahren nach oben zurück, während die Karte sich unter ihnen aufzieht,
//      statt beides nacheinander abzuspulen.
//   6. Die Kreise wachsen, während unter ihnen die Kapitel durchzählen.
const OV_LINIE_WACHSEN = [0.00, 0.18];
const OV_KARTE_AUS     = [0.12, 0.32];
const OV_LINIE_ZURUECK = [0.32, 0.46];
const OV_LABEL_EIN     = [0.18, 0.30];
const OV_ZOOM          = [0.32, 0.52];
const OV_KAPITEL       = [0.64, 1.00];
// Allerletzter Akt: die Startkarte kommt zurück. Erst blendet sie hinter den
// sieben Kreisen ein, danach fährt die Ansicht aus deren Ausschnitt auf die
// Gesamtkarte zurück. Die Kreise verblassen dabei — beim Rauszoomen behalten
// sie ihre Pixelgrösse, während die Karte darunter schrumpft, und würden
// sonst ineinanderlaufen.
const SK_EINBLENDEN = [0.00, 0.45];
const SK_RAUSZOOM   = [0.45, 1.00];
// Der Schlusstext kommt zuletzt: erst die Karte, dann die Zoomfahrt, dann das
// Wort. Er steht am Ende allein auf der Gesamtkarte.
const SK_TEXT       = [0.62, 0.90];

const OV_STAFFEL = 0.45;      // Anteil des Wachstumsfensters, über den die Linien versetzt starten
const OV_ZOOM_RAND = 0.18;    // Luft um die sieben Orte im Zielausschnitt
const OV_LINIE_BASIS = 70;    // Tiefe der ersten Linie
const OV_LINIE_SCHRITT = 64;  // zusätzliche Tiefe je weiterem Knoten

const OV_LABEL_MAX_BREITE = 200; // ab dieser Breite wird zweizeilig gesetzt
const OV_LABEL_ZEILE = 15;       // Zeilenhöhe der Ortsbeschriftung

// Bricht eine lange Ortsbeschriftung auf zwei Zeilen. Bevorzugte Trennstellen
// in dieser Reihenfolge: vor einer Klammer ("GEORGES DUROYS WOHNUNG" /
// "(RUE BOURSAULT)"), nach einem Komma ("PALAIS WALTER," / "FAUBOURG
// SAINT-HONORÉ"), sonst am Leerzeichen, das der Mitte am nächsten liegt.
// Setzt voraus, dass Schrift und Grösse der Beschriftung bereits gesetzt sind
// (textWidth misst mit dem aktuellen Zustand).
function ovLabelZeilen(text) {
  if (textWidth(text) <= OV_LABEL_MAX_BREITE) return [text];
  let klammer = text.indexOf('(');
  if (klammer > 0) return [text.slice(0, klammer).trim(), text.slice(klammer).trim()];
  let komma = text.indexOf(',');
  if (komma > 0 && komma < text.length - 1) {
    return [text.slice(0, komma + 1).trim(), text.slice(komma + 1).trim()];
  }
  let mitte = text.length / 2, beste = -1, abstand = Infinity;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ' ') continue;
    if (Math.abs(i - mitte) < abstand) { abstand = Math.abs(i - mitte); beste = i; }
  }
  if (beste < 0) return [text];
  return [text.slice(0, beste).trim(), text.slice(beste + 1).trim()];
}

function ovPhase(p, fenster) {
  return constrain(map(p, fenster[0], fenster[1], 0, 1), 0, 1);
}

// Je Knoten und Kapitel vorberechnet: bandCounts und F-Wert-Annotationen.
// Der Schlussakt zählt die Kapitel durch (1..18) und summiert dabei auf —
// das live über alle 18 Kapitel zu scannen wären 126 Durchläufe pro Frame.
// Einmal gebaut, danach nur noch aufaddiert.
let ovProKapitel = null;   // [knoten][kapitelNr] -> { bandCounts, fwerte }
let ovRohradien = null;    // Endstand-Rohradius je Knoten (ohne Deckel)
let ovLayout = null;       // { breite, hoehe, tiefen, kreisSkala, bbox }

function ovLeereBandCounts() {
  return {
    gold_dunkel: { neg: 0, pos: 0, neutral: 0, unrated: 0 },
    gold_mittel: { neg: 0, pos: 0, neutral: 0, unrated: 0 },
    gold_hell: { neg: 0, pos: 0, neutral: 0, unrated: 0 },
  };
}

function ovAddiere(ziel, quelle) {
  ['gold_dunkel', 'gold_mittel', 'gold_hell'].forEach(cat => {
    ['neg', 'pos', 'neutral', 'unrated'].forEach(v => { ziel[cat][v] += quelle[cat][v]; });
  });
}

function ovRadiusAus(bandCounts) {
  let r = 0;
  KREIS_KATEGORIEN.forEach(kat => {
    let b = bandCounts[kat.key] || {};
    r = Math.max(r, kreisRadius((b.neg || 0) + (b.pos || 0) + (b.neutral || 0) + (b.unrated || 0), Infinity));
  });
  return r;
}

function ovBaueDaten() {
  if (ovProKapitel) return;
  ovProKapitel = VERGLEICHS_KNOTEN.map(k => {
    let filter = new Set(k.namen);
    let proKapitel = {};
    let alleDaten = [['01', stationenData]].concat(
      Object.keys(uebersichtsRouten || {}).sort().map(nr => [nr, datenFuerKapitel(nr)]));
    alleDaten.forEach(([nr, daten]) => {
      if (!daten || !daten.annotationen || !daten.annotationen.length) return;
      let bis = daten.annotationen.length - 1;
      proKapitel[nr] = {
        bandCounts: zaehleAnnotationenLiveNachOrtBasis(filter, bis, daten),
        fwerte: sammleAnnotationenNachOrtBasis(filter, bis, daten).filter(a => a.hasFwert),
      };
    });
    return proKapitel;
  });
  ovRohradien = ovProKapitel.map(proKapitel => {
    let summe = ovLeereBandCounts();
    Object.values(proKapitel).forEach(k => ovAddiere(summe, k.bandCounts));
    return ovRadiusAus(summe);
  });
  ovLayout = null;
}

// Summe bis einschliesslich Kapitel maxNr ('18' = alles). Liefert zusätzlich
// die Nummer des letzten Kapitels, das überhaupt beigetragen hat — sie steht
// im Schlussakt unter dem Kreis.
function ovStand(index, maxNr) {
  let summe = ovLeereBandCounts();
  let fwerte = [];
  let letztes = null;
  Object.keys(ovProKapitel[index]).sort().forEach(nr => {
    if (parseInt(nr, 10) > maxNr) return;
    let k = ovProKapitel[index][nr];
    ovAddiere(summe, k.bandCounts);
    fwerte = fwerte.concat(k.fwerte);
    let n = (summe.gold_dunkel.neg + summe.gold_dunkel.pos + summe.gold_dunkel.neutral + summe.gold_dunkel.unrated)
      + (summe.gold_mittel.neg + summe.gold_mittel.pos + summe.gold_mittel.neutral + summe.gold_mittel.unrated)
      + (summe.gold_hell.neg + summe.gold_hell.pos + summe.gold_hell.neutral + summe.gold_hell.unrated);
    if (n > 0 && k.fwerte.length + 1 > 0) letztes = nr;
  });
  return { bandCounts: summe, fwerte, letztes };
}

// Zielausschnitt des Schlusszooms: alle sieben Orte plus Rand, auf das
// Seitenverhältnis des Canvas gebracht. Dazu die Kreis-Skala, bei der sich in
// diesem Ausschnitt keine zwei Kreise berühren — dadurch stehen die Kreise am
// Ende deutlich grösser als in der gestaffelten Zwischenphase.
function ovBerechneLayout() {
  if (ovLayout && ovLayout.breite === width && ovLayout.hoehe === height) return ovLayout;

  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + radians(lat) / 2));
  const mercLat = (y) => degrees(2 * Math.atan(Math.exp(y)) - Math.PI / 2);
  const RAND = 12; // Mindestluft zum Fensterrand

  // Beschriftungsbreiten einmal messen — sie bestimmen mit, wie weit ein Ort
  // vom seitlichen Rand entfernt stehen muss ("GEORGES DUROYS WOHNUNG (RUE
  // BOURSAULT)" ist deutlich breiter als sein Kreis).
  textFont("'Source Sans 3', sans-serif");
  textStyle(BOLD);
  textSize(13);
  let labelZeilen = VERGLEICHS_KNOTEN.map(k => ovLabelZeilen(k.label.toUpperCase()));
  let labelHalb = labelZeilen.map(z => Math.max(...z.map(t => textWidth(t))) / 2);
  // Höhe unterhalb des Kreises: Abstand zur ersten Zeile, weitere Zeilen,
  // dann die Kapitelzeile.
  let untenHoehe = labelZeilen.map(z => 24 + (z.length - 1) * OV_LABEL_ZEILE + 16 + 7);
  textStyle(NORMAL);

  let lons = VERGLEICHS_KNOTEN.map(k => k.lon);
  let lats = VERGLEICHS_KNOTEN.map(k => k.lat);
  let w0 = Math.min(...lons), o0 = Math.max(...lons);
  let s0 = Math.min(...lats), n0 = Math.max(...lats);

  // Bbox für einen gegebenen Rand bauen: Rand auf die Ankerspanne, dann auf
  // das Canvas-Seitenverhältnis aufziehen.
  //
  // Das Verhältnis wird in MERCATOR-Einheiten gebildet, nicht in Grad: die
  // Karten sind EPSG:3857, dort entspricht ein Breitengrad auf Pariser Höhe
  // dem 1/cos(48.87°) = 1.52-fachen eines Längengrads. Mit demselben
  // Meterfaktor für beide Achsen kam ein um genau diesen Faktor horizontal
  // gestreckter Ausschnitt heraus.
  let baueBbox = (rand) => {
    let dLon = (o0 - w0) * rand, dLat = (n0 - s0) * rand;
    let west = w0 - dLon, ost = o0 + dLon, sued = s0 - dLat, nord = n0 + dLat;
    let xW = radians(west), xO = radians(ost);
    let yS = mercY(sued), yN = mercY(nord);
    let sv = width / height;
    if ((xO - xW) / (yN - yS) < sv) {
      let zu = ((yN - yS) * sv - (xO - xW)) / 2;
      west = degrees(xW - zu); ost = degrees(xO + zu);
    } else {
      let zu = ((xO - xW) / sv - (yN - yS)) / 2;
      sued = mercLat(yS - zu); nord = mercLat(yN + zu);
    }
    return { west, east: ost, south: sued, north: nord };
  };

  // Kreis-Skala: grösster Faktor, bei dem sich keine zwei Kreise berühren.
  let skalaFuer = (bbox, pos) => {
    let skala = 1;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        let d = dist(pos[i].x, pos[i].y, pos[j].x, pos[j].y);
        skala = Math.min(skala, d / ((ovRohradien[i] + ovRohradien[j]) * 1.06));
      }
    }
    return skala;
  };

  // Überstand über den Fensterrand, in px. Berücksichtigt, was um den
  // Ankerpunkt herum tatsächlich Platz braucht: der Kreis nach allen Seiten,
  // unten zusätzlich Ortsbeschriftung und Kapitelzeile, seitlich die halbe
  // Beschriftungsbreite. Ein Rand, der nur die Anker umschliesst, reicht
  // nicht — die Kreise ragen um ihren Radius darüber hinaus.
  let ueberstand = (pos, skala) => {
    let max = 0;
    pos.forEach((p, i) => {
      let r = ovRohradien[i] * skala;
      max = Math.max(max,
        RAND - (p.y - r),                       // oben
        (p.y + r + untenHoehe[i]) - (height - RAND), // unten (inkl. aller Textzeilen)
        RAND - (p.x - Math.max(r, labelHalb[i])),
        (p.x + Math.max(r, labelHalb[i])) - (width - RAND));
    });
    return max;
  };

  // Rand so weit aufziehen, bis alles hineinpasst. Grösserer Rand heisst
  // kleinere Kreise (die Skala hängt an den Pixelabständen), das Verfahren
  // konvergiert deshalb.
  let rand = OV_ZOOM_RAND;
  let bbox = baueBbox(rand);
  let pos = VERGLEICHS_KNOTEN.map(k => lonLatToScreen(k.lon, k.lat, bbox, 0, 0));
  let kreisSkala = skalaFuer(bbox, pos);
  for (let versuch = 0; versuch < 20 && ueberstand(pos, kreisSkala) > 0.5; versuch++) {
    rand *= 1.15;
    bbox = baueBbox(rand);
    pos = VERGLEICHS_KNOTEN.map(k => lonLatToScreen(k.lon, k.lat, bbox, 0, 0));
    kreisSkala = skalaFuer(bbox, pos);
  }

  // Tiefe der senkrechten Linien in der Zwischenphase: gestaffelt nach der
  // Höhenlage der Anker, gedeckelt auf die Fensterhöhe.
  let reihenfolge = pos.map((p, i) => ({ i, y: p.y })).sort((a, b) => a.y - b.y).map(a => a.i);
  let tiefen = [];
  reihenfolge.forEach((idx, rang) => { tiefen[idx] = OV_LINIE_BASIS + rang * OV_LINIE_SCHRITT; });
  let maxTiefe = Math.max(...tiefen);
  let platz = height - 90;
  if (maxTiefe > platz) tiefen = tiefen.map(t => t * platz / maxTiefe);

  ovLayout = { breite: width, hoehe: height, bbox, kreisSkala, tiefen, reihenfolge, rand, labelZeilen };
  return ovLayout;
}

// Zielausschnitt für den Schlusszoom — draw() blendet activeBbox dorthin.
function ovZoomBbox() {
  if (!ovProKapitel) return null;
  return ovBerechneLayout().bbox;
}

// Zeichnet den Schlussakt. p = Fortschritt im Akt (0..1), bbox = die gerade
// gültige (bereits Richtung ovZoomBbox geblendete) Kartenbbox.
function zeichneOrtsveraenderung(bbox, p, alpha) {
  if (alpha <= 0 || !stationenData || !stationenData.annotationen) return;
  ovBaueDaten();
  let layout = ovBerechneLayout();

  let pWachsen = ovPhase(p, OV_LINIE_WACHSEN);
  let pZurueck = ovPhase(p, OV_LINIE_ZURUECK);
  let pLabel = ovPhase(p, OV_LABEL_EIN);
  let pKapitel = ovPhase(p, OV_KAPITEL);
  let maxKapitel = Math.max(1, Math.min(18, Math.ceil(pKapitel * 18)));
  let kreisAlpha = pKapitel > 0 ? 1 : 0;

  let n = VERGLEICHS_KNOTEN.length;

  textFont("'Source Sans 3', sans-serif");
  textAlign(CENTER, CENTER);

  VERGLEICHS_KNOTEN.forEach((k, i) => {
    let anker = lonLatToScreen(k.lon, k.lat, bbox, 0, 0);
    // Gestaffelter Start: der Knoten mit dem obersten Anker beginnt zuerst.
    let rang = layout.reihenfolge.indexOf(i);
    let start = (rang / n) * OV_STAFFEL;
    let wachsen = constrain(map(pWachsen, start, start + (1 - OV_STAFFEL), 0, 1), 0, 1);
    let tiefe = layout.tiefen[i] * wachsen * (1 - pZurueck);
    let cy = anker.y + tiefe;

    if (tiefe > 0.5) {
      stroke(ROUTE_COLOR_RGB.r, ROUTE_COLOR_RGB.g, ROUTE_COLOR_RGB.b, alpha);
      strokeWeight(1.5);
      line(anker.x, anker.y, anker.x, cy);
      noStroke();
    }

    // Ortspunkt am unteren Ende der Linie — er wandert hinunter und wieder
    // zurück auf seinen echten Ort.
    drawingContext.fillStyle = `rgba(${ROUTE_COLOR_RGB.r}, ${ROUTE_COLOR_RGB.g}, ${ROUTE_COLOR_RGB.b}, ${alpha / 255})`;
    drawingContext.beginPath();
    drawingContext.arc(anker.x, cy, 3.5, 0, TWO_PI);
    drawingContext.fill();

    let radius = 0;
    let stand = null;
    if (kreisAlpha > 0) {
      stand = ovStand(i, maxKapitel);
      radius = zeichneKreiseFuerRun(anker.x, cy, stand.bandCounts, (alpha / 255) * kreisAlpha,
        -HALF_PI, layout.kreisSkala, Infinity);
      zeichneFwertPunkte(anker.x, cy, radius, stand.fwerte, (alpha / 255) * kreisAlpha);
    }

    // Reihenfolge von oben nach unten: Kreis, Ortsbeschriftung, Kapitelzähler.
    let rand = radius > 0 ? radius : 6;

    let zeilen = layout.labelZeilen[i];
    if (pLabel > 0) {
      textStyle(BOLD);
      textSize(13);
      fill(33, 43, 46, alpha * pLabel); // #212B2E
      zeilen.forEach((zeile, z) => {
        drawingContext.fillText(zeile, anker.x, cy + rand + 24 + z * OV_LABEL_ZEILE);
      });
    }

    // Kapitelzähler darunter — rutscht bei zweizeiliger Beschriftung mit.
    if (kreisAlpha > 0 && stand) {
      textStyle(NORMAL);
      textSize(11);
      fill(90, 90, 90, alpha * kreisAlpha);
      drawingContext.fillText(stand.letztes ? `Kapitel ${stand.letztes}` : 'Kapitel –',
        anker.x, cy + rand + 24 + (zeilen.length - 1) * OV_LABEL_ZEILE + 16);
    }
  });

  textAlign(LEFT, CENTER); // zurücksetzen — andere Zeichenfunktionen erwarten das
  textStyle(NORMAL);
}

// Übersichtsrouten (Kapitel 02–18) auf der grossen, rausgezoomten Karte —
// echte Strassenrouten aus data-prep/05 bereinigen/baue-uebersichtsrouten.py,
// gedämpft in Goldton (Kategorie-Farbe gold_dunkel). Laufen in Kapitel-
// reihenfolge ab statt gemeinsam zu wachsen: der gesamte fortschritt (0..1)
// wird in gleich grosse Abschnitte pro Kapitel aufgeteilt — Kapitel 02
// zeichnet sich zuerst komplett, dann 03, usw. Ein Kapitel, dessen Abschnitt
// noch nicht erreicht ist, bleibt (Route + Startpunkt/Nummer) unsichtbar.
// Aufteilung des Übersichtsakts auf die Kapitel. Früher bekam jedes Kapitel
// gleich viel Scrollstrecke — dabei schwankte die Zeichengeschwindigkeit um
// das 27-fache: Kapitel 5 zog 1625 Routenpunkte durch dieselben 173vh wie
// Kapitel 18 seine 60, und Kapitel 2 stand mit seinem einzigen Punkt zwei
// Bildschirmhöhen lang still.
//
// Jetzt richtet sich die Scheibenbreite nach der Routenlänge. Ein fester
// Grundanteil wird trotzdem gleichmässig verteilt, damit auch ein kurzes
// Kapitel genug Strecke für Badge und Einstiegstext behält — ohne ihn bekäme
// Kapitel 2 mit einem von 10974 Punkten praktisch keine.
const OV_SCHEIBE_GRUNDANTEIL = 0.45; // Anteil des Akts, der gleichmässig verteilt wird
let ovScheiben = null;

function kapitelScheiben() {
  if (ovScheiben) return ovScheiben;
  let liste = Object.keys(uebersichtsRouten || {}).sort();
  if (!liste.length) return [];
  let laengen = liste.map(nr => uebersichtsRouten[nr].length);
  let summe = laengen.reduce((a, b) => a + b, 0) || 1;
  let grund = OV_SCHEIBE_GRUNDANTEIL / liste.length;
  let rest = 1 - OV_SCHEIBE_GRUNDANTEIL;
  let scheiben = [];
  let kum = 0;
  liste.forEach((nr, i) => {
    let anteil = grund + rest * laengen[i] / summe;
    scheiben.push({ nr, von: kum, bis: kum + anteil });
    kum += anteil;
  });
  ovScheiben = scheiben;
  return ovScheiben;
}

// Wie "heiss" ein Kapitel gerade ist: 1 während seiner eigenen Scheibe des
// Akts, danach auf 0. Route und Badge nehmen denselben Wert und wechseln
// dadurch gemeinsam von der Hoverfarbe (#C2511C) auf das Routengold.
//
// Der Wechsel fällt mit der Übergabe zusammen: sobald das nächste Kapitel
// aktiv wird, ist das vorherige gold. Das Nachglühen dauert nur so lange,
// dass kein harter Farbsprung entsteht. Auf 0 gesetzt springt die Farbe hart um.
const OV_NACHGLUEHEN = 0.05; // Anteil einer Scheibe für den Übergang

function kapitelHitze(fortschritt, scheibe) {
  if (!scheibe) return 0;
  let breite = scheibe.bis - scheibe.von;
  return 1 - constrain(map(fortschritt, scheibe.bis, scheibe.bis + breite * OV_NACHGLUEHEN, 0, 1), 0, 1);
}

function zeichneUebersichtsrouten(bbox, alpha, fortschritt) {
  noFill();
  strokeWeight(2);

  let kapitelListe = Object.entries(uebersichtsRouten).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  let n = kapitelListe.length;

  // Für die genaue Route des gezoomten Kapitels (weiter unten) gebraucht:
  // anders als die grobe Übersichtslinie (die pro Kapitel nur einen i/n-Slice
  // des Akts bekommt) nutzt das gezoomte Kapitel den vollen, unaufgeteilten
  // fortschritt — sonst hätte jedes Kapitel nur ~1/n des Akts zum Durchscrollen
  // seiner Annotationen (deutlich schneller/unruhiger als bei Kapitel 1, das
  // seinen eigenen vollen Scrollbereich hat). So bekommt jedes geöffnete
  // Kapitel den vollen Akt als eigene Reveal-Skala, unabhängig von seiner
  // Position in der Kapitelliste, und bleibt trotzdem exakt scrubbar.
  // Der Anfang des Akts gehört dem Einstiegstext (siehe
  // KAPITEL_EINSTIEG_SCROLL_ENDE) — die Annotationen des Kapitels verteilen
  // sich auf den Rest, damit die erste gleich beim Erscheinen der Route zu
  // sehen ist und nicht schon während des Textes weggescrollt wurde.
  let zoomedLokalerFortschritt = constrain(
    map(fortschritt, KAPITEL_EINSTIEG_SCROLL_ENDE, 1, 0, 1), 0, 1);
  let aktuelleAnnotationZoom = null; // für die Annotationsbox in draw() (siehe Rückgabewert unten)

  // Im Kapitel-Zoom (Klick auf «03» etc.) bleibt nur die Route des gezoomten
  // Kapitels (+ Kapitel 1, die separat über zeichneRoute läuft) eingeblendet
  // — alle anderen Übersichtsrouten blenden mit kapitelZoomAmount aus.
  kapitelListe.forEach(([kapitelNr, punkte], i) => {
    let scheibe = kapitelScheiben()[i];
    let lokalerFortschritt = scheibe
      ? constrain(map(fortschritt, scheibe.von, scheibe.bis, 0, 1), 0, 1) : 0;
    if (lokalerFortschritt <= 0) return;

    // kapitel-routen-uebersicht.json enthält seit
    // baue-uebersichtsrouten-aus-kapiteln.py exakt dieselben Punkte wie
    // routenPfadDetail des jeweiligen Kapitels — die Übersichtslinie IST also
    // die Kapitelroute. Sobald genau dieses Kapitel gezoomt ist, wird sie
    // trotzdem übersprungen und stattdessen unten aus den Kapiteldaten
    // gezeichnet: dieselbe Geometrie, aber mit mapOffsetX/mapOffsetY des
    // Kartenausschnitts statt zentriert — beide gleichzeitig ergäben zwei
    // gegeneinander versetzte Linien.
    if (kapitelNr === zoomedKapitel && kapitelZoomAmount > 0.001) return;

    let routenAlpha = (zoomedKapitel && kapitelNr !== zoomedKapitel)
      ? alpha * (1 - kapitelZoomAmount)
      : alpha;
    if (routenAlpha <= 0) return;
    // Während sie wächst, wird die Route in der Hoverfarbe gezeichnet und
    // kühlt danach auf Gold ab — so ist im Scrollen zu sehen, welche Linie
    // gerade entsteht und welche schon liegt.
    let hitze = zoomedKapitel ? 0 : kapitelHitze(fortschritt, scheibe);
    stroke(lerp(ROUTE_COLOR_RGB.r, FWERT_COLOR_RGB.r, hitze),
      lerp(ROUTE_COLOR_RGB.g, FWERT_COLOR_RGB.g, hitze),
      lerp(ROUTE_COLOR_RGB.b, FWERT_COLOR_RGB.b, hitze), routenAlpha);
    let anzahl = Math.max(1, Math.round(lokalerFortschritt * punkte.length));
    beginShape();
    for (let j = 0; j < anzahl; j++) {
      let p = lonLatToScreen(punkte[j][0], punkte[j][1], bbox, 0, 0); // zentrierte Übersichtskarte, kein mapOffsetX
      vertex(p.x, p.y);
    }
    endShape();
  });

  // Route des gezoomten Kapitels (aus datenFuerKapitel(), siehe
  // baue-kapitel-stationen.py/baue_kapitel03.py) — ersetzt die Übersichts-
  // linie für genau dieses Kapitel, sobald es gezoomt ist (gleiche Punkte,
  // anderer Offset, siehe oben). Nutzt
  // denselben fixen mapOffsetX/mapOffsetY wie der Kartenausschnitt (k.bild)
  // selbst, nicht den ch1-spezifischen kartenOffsetX-Blend.
  // Erscheint bewusst erst, NACHDEM der Kapitel-Einstiegstext (siehe
  // KAPITEL_EINSTIEG_SCROLL_ENDE weiter
  // unten in draw()) fertig ausgeblendet ist — exakt dasselbe Nacheinander
  // wie bei Kapitel 1 (dort per Scroll-Meilenstein: der Begleittext blendet
  // bis routeStart aus, erst ab dort wächst routeAmount los). Ohne dieses
  // Gate erschienen Route/Kreise/Annotationsbox gleichzeitig mit dem noch
  // sichtbaren Einstiegstext, statt sauber danach.
  let kapitelEinstiegAbgeschlossen = fortschritt >= KAPITEL_EINSTIEG_SCROLL_ENDE;
  if (zoomedKapitel && kapitelZoomAmount > 0.001 && kapitelEinstiegAbgeschlossen) {
    let daten = datenFuerKapitel(zoomedKapitel);
    // routenPfadDetail (falls vorhanden) statt routenPunkte: Letzteres ist
    // auf genau 1 Punkt pro Annotation/revealIndex komprimiert (siehe
    // baue-kapitel-stationen.py) — bei eng aufeinanderfolgenden Annotationen
    // (häufigster Fall) bleiben davon oft nur Start+Ziel übrig, der echte
    // OSM-Fussweg dazwischen (mit allen Abbiegungen) geht verloren und die
    // Linie sieht wie eine Luftlinie aus. routenPfadDetail behält die volle
    // Strassenform. routenPfadKumulativ (falls vorhanden, siehe
    // baue_stopandgo_pfade.py) bindet das Wachstum dieses dichten Pfads an
    // die Annotations-Reihenfolge zurück: pro Annotation ein Index in
    // routenPfadDetail, flach solange sich ortBasis nicht ändert (Stop),
    // springt beim Ortswechsel auf den vollen echten Fussweg zum nächsten
    // Ort (Go) — echtes Stop-and-go MIT Strassenform, nicht mehr nur
    // proportional zum Gesamt-Scrollfortschritt.
    let routenLinie = (daten && daten.routenPfadDetail && daten.routenPfadDetail.length > 1)
      ? daten.routenPfadDetail
      : (daten && daten.routenPunkte);
    if (routenLinie && routenLinie.length > 1) {
      // Exakt dieselbe Zeichenfunktion/Darstellung wie Kapitel 1s eigene
      // Route (zeichneRoute: Fade-Schweif, jüngere Segmente heller). Der
      // Fortschritt (zoomedLokalerFortschritt, oben im ersten forEach
      // mitgefasst) ist derselbe scroll-gebundene Wert wie für die grobe
      // Übersichtslinie dieses Kapitels — beim Hochscrollen sinkt er wieder,
      // die Route zieht sich also denselben Weg rückwärts zurück, statt nur
      // pauschal auszublenden. kapitelZoomAmount bleibt als zusätzlicher
      // Alpha-Multiplikator fürs Ein-/Ausblenden beim Öffnen/Schliessen.
      let kumulativ = daten && daten.routenPfadKumulativ;
      let upToIndex;
      if (kumulativ && kumulativ.length === (daten.annotationen || []).length) {
        // Kontinuierliche Annotations-Position (nicht gerundet) innerhalb
        // [0, annotationen.length-1] — linear zwischen den kumulativen
        // Pfad-Indizes zweier benachbarter Annotationen interpoliert, damit
        // der Ortswechsel-"Sprung" innerhalb seines Scroll-Abschnitts noch
        // weich (Punkt für Punkt den echten Fussweg entlang) wächst, statt
        // schlagartig aufzupoppen.
        let stelle = constrain(zoomedLokalerFortschritt * (kumulativ.length - 1), 0, kumulativ.length - 1);
        let i0 = Math.floor(stelle), i1 = Math.min(kumulativ.length - 1, i0 + 1);
        let frac = stelle - i0;
        upToIndex = Math.round(lerp(kumulativ[i0], kumulativ[i1], frac));
      } else {
        upToIndex = Math.round(zoomedLokalerFortschritt * (routenLinie.length - 1));
      }
      if (upToIndex >= 1) {
        // Strichstärke 10 wie Kapitel 1s Route in ihrer normalen (nicht
        // rausgezoomten) Ansicht — dort lerp(10, 2, zoomOutAmount), hier
        // gibt es keine entsprechende Rauszoom-Phase, also fix bei 10.
        zeichneRoute(routenLinie, upToIndex, bbox, 10, mapOffsetX, mapOffsetY, kapitelZoomAmount);
      }
    }

    // Wachsende Kreise + aktuelle Annotation — dasselbe System wie Kapitel 1
    // (zeichneKreiseOrtRuns/Annotationsbox in draw()), nur mit diesem
    // Kapitels eigenen Daten/annIndex statt stationenData. annIndex/
    // punktIndex analog zu Kapitel 1s Berechnung in draw() (dort direkt vor
    // dem Aufruf dieser Funktion), hier aber aus zoomedLokalerFortschritt
    // abgeleitet, da dieses Kapitel keine eigenen Scroll-Meilensteine hat.
    if (daten && daten.annotationen && daten.annotationen.length) {
      let annIndexZoom = Math.min(daten.annotationen.length - 1, Math.floor(zoomedLokalerFortschritt * daten.annotationen.length));
      let aktuelleAnnZoom = daten.annotationen[annIndexZoom];
      // annIndexZoom statt aktuelleAnnZoom.revealIndex: Letzteres ist bei
      // Kapitel 3 (handkuratiert) für die meisten Annotationen NICHT die
      // Array-Position (andere, hier nicht relevante Altsemantik), während
      // ortRuns[].revealIndex (siehe zeichneKreiseOrtRuns) verlässlich die
      // Array-Position ist — die beiden verglichenen Werte liefen dadurch
      // auseinander, Kreise erschienen zu spät oder gar nicht. annIndexZoom
      // ist für alle Kapitel (auch die automatisch gebauten) ohnehin schon
      // die Array-Position, also die korrekte Vergleichsbasis.
      let punktIndexZoom = aktuelleAnnZoom.vorRoutenstart ? 0 : annIndexZoom;
      zeichneKreiseOrtRuns(punktIndexZoom, annIndexZoom, bbox, mapOffsetX, mapOffsetY, daten);
      aktuelleAnnotationZoom = aktuelleAnnZoom;
    }
  }

  // Startpunkt (schwarz) + Kapitelnummer je Route — erscheint zusammen mit
  // der Route, sobald diese zu wachsen beginnt. Kapitel mit eigenem
  // Kartenausschnitt (siehe kapitelKarten) sind klickbar — Hover zeigt das
  // per Cursor/Farbe an, Klick zoomt in kapitel<NR>-karte.png (siehe
  // oeffneKapitelZoom/mousePressed).
  noStroke();
  textFont("'Source Sans 3', sans-serif"); // wie .annotation-tag (var(--sans)) und die Kreis-Labels
  textStyle(BOLD); // .annotation-tag ist font-weight: 700
  textAlign(LEFT, CENTER);
  textSize(11);
  kapitelHover = null;

  // Mehrere Kapitel können exakt denselben Startpunkt haben (z.B. "Wohnung
  // Duroy/Madeleine" für 02/10, oder "Redaktion La Vie Française" für
  // 07/11 — beide echte, wiederkehrende Orte, keine Datenfehler). Ohne
  // Versatz zeichnet das später gelistete Kapitel (höhere Nummer) sein
  // Badge exakt über das frühere, das dadurch unsichtbar UND unklickbar
  // wird — daher unten ein kleiner kreisförmiger Versatz pro Gruppe.
  // Gruppiert wird nach ABSTAND, nicht nach exakt gleicher Koordinate. Ein
  // Text-Vergleich der Zahlen hätte Kapitel 18 aus der Gruppe 08/09 fallen
  // lassen: sein Startpunkt liegt 0.24 m daneben (2.31921 gegen 2.3192132),
  // auf dem Bildschirm also exakt auf demselben Pixel. Es bekam dadurch
  // keinen Versatz und lag mittig unter den beiden anderen Badges.
  const DUP_TOLERANZ = 0.0003; // Grad, rund 25 m — deutlich unter dem kleinsten echten Abstand zweier Startpunkte (223 m)
  let startDupGruppen = {};
  let dupSchluessel = {};
  kapitelListe.forEach(([kapitelNr, punkte]) => {
    let [lon, lat] = punkte[0];
    let key = Object.keys(startDupGruppen).find(k => {
      let [kl, kb] = k.split(',').map(Number);
      return Math.abs(kl - lon) < DUP_TOLERANZ && Math.abs(kb - lat) < DUP_TOLERANZ;
    });
    if (!key) key = lon + ',' + lat;
    (startDupGruppen[key] = startDupGruppen[key] || []).push(kapitelNr);
    dupSchluessel[kapitelNr] = key;
  });

  kapitelListe.forEach(([kapitelNr, punkte], i) => {
    // Bewusst NICHT (mehr) an lokalerFortschritt (die i/n..(i+1)/n-Scheibe
    // dieses Kapitels am Gesamt-Akt) gekoppelt wie die Routenlinien oben:
    // die zeigen sich absichtlich nacheinander im Scrollverlauf, aber die
    // Start-Badges sind Klickziele, die von Anfang an alle gleichzeitig da
    // sein sollen — sonst liessen sich spät gelistete Kapitel (hohe i) erst
    // anklicken, nachdem man schon weit in den Akt gescrollt war, obwohl das
    // Kapitelregister links sie längst anzeigt.
    let labelAlpha = (zoomedKapitel && kapitelNr !== zoomedKapitel)
      ? alpha * (1 - kapitelZoomAmount)
      : alpha;
    if (labelAlpha <= 0) return;

    let start = lonLatToScreen(punkte[0][0], punkte[0][1], bbox, 0, 0); // zentrierte Übersichtskarte, kein mapOffsetX
    // Für das gerade gezoomte Kapitel zum tatsächlichen Anfang der genauen
    // Route überblenden (routenPfadDetail/routenPunkte, mapOffsetX-Rahmen)
    // statt am Startpunkt der groben, mit offsetX=0 berechneten Übersichts-
    // linie stehen zu bleiben — der trifft im Kapitel-Zoom nicht exakt auf
    // den echten Routenanfang. kapitelZoomAmount blendet weich zwischen
    // beiden Positionen (0 = Übersicht, 1 = voll gezoomt).
    if (kapitelNr === zoomedKapitel && kapitelZoomAmount > 0.001) {
      let daten = datenFuerKapitel(kapitelNr);
      let routenLinie = (daten && daten.routenPfadDetail && daten.routenPfadDetail.length > 1)
        ? daten.routenPfadDetail
        : (daten && daten.routenPunkte);
      if (routenLinie && routenLinie.length > 0) {
        let praezise = lonLatToScreen(routenLinie[0][0], routenLinie[0][1], bbox, mapOffsetX, mapOffsetY);
        start = {
          x: lerp(start.x, praezise.x, kapitelZoomAmount),
          y: lerp(start.y, praezise.y, kapitelZoomAmount),
        };
      }
    }

    // Kreisförmiger Versatz für Kapitel mit identischem Startpunkt (siehe
    // startDupGruppen oben) — jedes Kapitel der Gruppe bekommt einen festen,
    // eigenen Platz auf einem kleinen Kreis um den echten Punkt, statt sich
    // mit den anderen zu überlagern.
    let dupGruppe = startDupGruppen[dupSchluessel[kapitelNr]];
    let dupAnker = null;
    let labelLinks = false; // Nummer nach links statt rechts setzen
    if (dupGruppe.length > 1) {
      let dupWinkel = (dupGruppe.indexOf(kapitelNr) / dupGruppe.length) * TWO_PI;
      const dupVersatz = 13; // px
      dupAnker = start; // echter Routenanfang, für die Verbindungslinie unten
      start = {
        x: start.x + cos(dupWinkel) * dupVersatz,
        y: start.y + sin(dupWinkel) * dupVersatz,
      };
      // Nummer auf die AUSSENSEITE des Versatzkreises setzen. Sonst steht sie
      // immer rechts vom Punkt und damit bei den linken Badges quer über der
      // Gruppenmitte — bei Kapitel 2 lagen die Nummern von 13 und 15 direkt
      // über und unter dessen Punkt und drückten ihn zwischen sich ein.
      labelLinks = cos(dupWinkel) < -0.01;
    }

    // Klickbar, sobald entweder ein eigener Kartenausschnitt (kapitelKarten)
    // ODER zumindest ein Spine-Panel (KAPITEL_MIT_SPINE_PANEL) vorhanden ist
    // — Kapitel ohne eigenen Ausschnitt (aktuell 02, 14, 15) zeigen beim
    // Zoom dann nur das Spine-Panel, die Karte bleibt auf der Übersicht.
    let klickbar = (!!kapitelKarten[kapitelNr] || KAPITEL_MIT_SPINE_PANEL.has(kapitelNr)) && !zoomedKapitel;
    let hover = klickbar && dist(mouseX, mouseY, start.x, start.y) < FOTO_MARKER_TREFFER_RADIUS;
    if (hover) kapitelHover = kapitelNr;

    // Punkt und Nummer nehmen dieselbe Hitze wie die Linie (siehe
    // kapitelHitze): voll in der Hoverfarbe, solange die eigene Route wächst,
    // danach gemeinsam mit ihr auf die normale Farbe abkühlend. Die
    // Punktgrösse bleibt normal, damit der echte Hover unterscheidbar bleibt.
    let scheibe = kapitelScheiben()[i];
    let lokalerFortschritt = scheibe
      ? constrain(map(fortschritt, scheibe.von, scheibe.bis, 0, 1), 0, 1) : 0;
    let hitze = (!zoomedKapitel && lokalerFortschritt > 0) ? kapitelHitze(fortschritt, scheibe) : 0;

    // fill(hexString, alpha) ist keine verlässliche p5-Signatur (bricht die
    // Farb-Auflösung ab) — deshalb RGB statt Hex+Alpha, wie überall sonst
    // im Sketch (z.B. ROUTE_COLOR_RGB).
    // Verbindungsstrich vom versetzten Badge zurück zum echten Routenanfang.
    // Ohne ihn wirkt ein Badge, dessen Versatzwinkel quer zur Route zeigt,
    // wie ein Punkt ohne Route — genau das passierte Kapitel 7, das sich die
    // Redaktion als Startpunkt mit 10 und 11 teilt und den Winkel 0 (nach
    // rechts) bekam, während die Linie dort nach oben wegläuft.
    if (dupAnker) {
      stroke(33, 43, 46, labelAlpha * 0.55);
      strokeWeight(1);
      line(dupAnker.x, dupAnker.y, start.x, start.y);
      noStroke();
    }

    if (hover) fill(FWERT_COLOR_RGB.r, FWERT_COLOR_RGB.g, FWERT_COLOR_RGB.b, labelAlpha); // #C2511C
    else fill(lerp(33, FWERT_COLOR_RGB.r, hitze), lerp(43, FWERT_COLOR_RGB.g, hitze),
      lerp(46, FWERT_COLOR_RGB.b, hitze), labelAlpha); // #212B2E .. #C2511C
    ellipse(start.x, start.y, hover ? 11 : 8, hover ? 11 : 8);
    // p5s text() bleibt hier während des Scrollens (viele Frames/Sekunde,
    // wechselnde Werte) manchmal unsichtbar, obwohl der Canvas-Context
    // nachweislich korrekt gesetzt ist (siehe zeichneSpineHorizontal, gleicher
    // Bug/Workaround) — direkt über den Canvas-Context gezeichnet, fillStyle
    // kommt schon vom fill()-Aufruf oben.
    if (labelLinks) {
      textAlign(RIGHT, CENTER);
      drawingContext.textAlign = 'right';
      drawingContext.fillText(kapitelNr, start.x - 8, start.y);
      textAlign(LEFT, CENTER);
      drawingContext.textAlign = 'left';
    } else {
      drawingContext.fillText(kapitelNr, start.x + 8, start.y);
    }
  });

  // Kapitel 1 hat keine Übersichtsroute in uebersichtsRouten (eigene, separat
  // gezeichnete Route/Startpunkt) — Nummer wird hier eigens ergänzt, klickbar
  // wie die anderen, aber Klick scrollt zurück zu Kapitel 1 statt in ein Bild
  // zu zoomen (siehe scrolleZuKapitel1/mousePressed). Bleibt immer klickbar,
  // auch während eines anderen Kapitel-Zooms (Rückweg).
  let ch1Start = lonLatToScreen(stationenData.routenPunkte[0][0], stationenData.routenPunkte[0][1], bbox, 0, 0); // zentrierte Übersichtskarte, kein mapOffsetX
  let ch1Hover = dist(mouseX, mouseY, ch1Start.x, ch1Start.y) < FOTO_MARKER_TREFFER_RADIUS;
  if (ch1Hover) kapitelHover = '01';
  if (ch1Hover) fill(FWERT_COLOR_RGB.r, FWERT_COLOR_RGB.g, FWERT_COLOR_RGB.b, alpha); // #C2511C
  else fill(33, 43, 46, alpha); // #212B2E
  ellipse(ch1Start.x, ch1Start.y, ch1Hover ? 11 : 8, ch1Hover ? 11 : 8);
  drawingContext.fillText('01', ch1Start.x + 8, ch1Start.y); // siehe Kommentar oben (p5s text()-Bug)

  textStyle(NORMAL);
  cursor(kapitelHover ? HAND : ARROW);


  // aktuelleAnnotationZoom: für die Annotationsbox in draw() (nur bei
  // Kapitel 02–18 relevant — Kapitel 1s eigene Annotation läuft weiterhin
  // über routeAmount/annIndex direkt in draw()).
  return { aktuelleAnnotationZoom };
}

// Scrollt zurück in die Kapitel-1-Ansicht (Ende des Rein-Zooms/Anfang der
// Route) — schliesst einen eventuell offenen Kapitel-Zoom gleich mit.
function scrolleZuKapitel1() {
  schliesseKapitelZoom();
  let trackEl = document.querySelector('.scroll-track');
  let ziel = trackEl.offsetHeight * SCROLL_MEILENSTEINE.zoomEnd;
  window.scrollTo({ top: ziel, behavior: 'smooth' });
}

// Öffnet den Kapitel-Zoom an der AKTUELLEN Scrollposition, ohne sie zu
// verändern. Alle Bedien-Wege (Kapitelregister, Klick auf einen Routen-
// Startpunkt) laufen deshalb über springeZuKapitelZoom, das vorher an den
// Anfang des uebersichtRouten-Akts springt — sonst öffnete sich das Kapitel
// mitten im Ablauf, mit schon ausgeblendetem Einstiegstext und fertig
// gezeichneter Route (siehe KAPITEL_EINSTIEG_SCROLL_ENDE).
//
// Kartenausschnitt + Route blenden sofort weich ein (kapitelZoomAmount,
// siehe draw()). Verlassen geschieht durch Hoch-scrollen (siehe
// uebersichtRoutenFortschritt<=0-Check in draw()), über Escape, oder über
// den "Alle"-Eintrag im Kapitel-Menübalken (springeZurUebersicht).
// Setzt voraus, dass die aktuelle Scrollposition bereits im uebersichtRouten-
// Akt liegt (siehe draw()) — sonst schliesst genau dieser Check den gerade
// geöffneten Zoom im nächsten Frame gleich wieder (Sprung von einer
// früheren Position, z.B. Kapitel 1s eigenem Kartenausschnitt, MUSS daher
// über springeZuKapitelZoom() laufen, nicht direkt über diese Funktion).
// Setzt den Ansichtsmodus (Karte/Grafik) + eine eventuell laufende
// Play-Animation zurück — bei jedem Kapitelwechsel aufgerufen, damit jede
// Kapitel-Ansicht frisch in der Kartenansicht startet (siehe
// oeffneKapitelZoom/schliesseKapitelZoom/springeZuKapitelZoom).
function setzeKapitelAnsichtZurueck() {
  kapitelAnsichtsModus = 'karte';
  grafikSpielt = false;
  grafikFortschritt = 0;
  grafikPlayAusblendStart = null;
  // Kapitelwechsel während laufender Sonifikation (Kapitel 1s Graph-
  // Play-Button, siehe toggleGrafikPlay) sauber abbrechen — sonst liefe der
  // Ton unabhängig von der (jetzt zurückgesetzten) Graph-Ansicht weiter.
  if (sonifikationSpieltGerade) beendeSonifikationAudio();
  // Startzeit für den zeitbasierten Fade des Kapitel-Einstiegstexts
  // (.kapitel-einstiegstext, siehe draw()) — bei jedem Kapitelwechsel neu,
  // auch beim Schliessen (dort harmlos, da dann kein zoomedKapitel matcht).
  kapitelEinstiegsStartMillis = millis();
}

function oeffneKapitelZoom(nr) {
  if (!kapitelKarten[nr] && !KAPITEL_MIT_SPINE_PANEL.has(nr)) return;
  zoomedKapitel = nr;
  setzeKapitelAnsichtZurueck();
}

function schliesseKapitelZoom() {
  zoomedKapitel = null;
  setzeKapitelAnsichtZurueck();
}

// Sprungziel der 02–18-Badges im Kapitel-Menübalken: springt (OHNE
// Scroll-Animation — bei "smooth" liefen mehrere draw()-Frames noch mit der
// alten Scrollposition, in denen der uebersichtRoutenFortschritt<=0-Check
// den gerade gesetzten zoomedKapitel sofort wieder auf null zurückgesetzt
// hätte) auf eine sichere Position kurz NACH dem Anfang des
// uebersichtRouten-Akts (statt wie früher in dessen Mitte — dort wäre die
// Route schon gut zur Hälfte gewachsen, sobald der Einstiegstext-Gate in
// zeichneUebersichtsrouten sie freigibt, statt bei der ersten Annotation zu
// beginnen wie bei Kapitel 1) und öffnet dort direkt den Kapitel-Zoom —
// funktioniert dadurch auch von jeder früheren Scrollposition aus (z.B. aus
// Kapitel 1s eigenem Kartenausschnitt heraus). 1% Abstand zum exakten
// Akt-Anfang reicht als Sicherheitsmarge gegen den <=0-Check, liegt aber für
// jedes Kapitel (auch annotationsarme) noch klar bei dessen erster
// Annotation (siehe zoomedLokalerFortschritt/annIndexZoom dort).
function springeZuKapitelZoom(nr) {
  if (!kapitelKarten[nr] && !KAPITEL_MIT_SPINE_PANEL.has(nr)) return;
  let trackEl = document.querySelector('.scroll-track');
  let start = SCROLL_MEILENSTEINE.uebersichtRoutenStart
    + 0.01 * (SCROLL_MEILENSTEINE.uebersichtRoutenEnd - SCROLL_MEILENSTEINE.uebersichtRoutenStart);
  window.scrollTo(0, trackEl.offsetHeight * start);
  oeffneKapitelZoom(nr);
}

// Sprungziel des "Alle"-Buttons im Kapitel-Menübalken: verlässt jede
// offene Kapitel-Ansicht (Kapitel 1 eigene ODER ein gezoomtes 02–18) und
// landet auf der neutralen Übersichtskarte — dieselbe sichere Position wie
// springeZuKapitelZoom, aber ohne dort ein Kapitel zu öffnen.
function springeZurUebersicht() {
  let trackEl = document.querySelector('.scroll-track');
  let mitte = (SCROLL_MEILENSTEINE.uebersichtRoutenStart + SCROLL_MEILENSTEINE.uebersichtRoutenEnd) / 2;
  window.scrollTo(0, trackEl.offsetHeight * mitte);
  schliesseKapitelZoom();
}

// ---------------------------------------------------------------------------
// Spine in p5
// ---------------------------------------------------------------------------

// Spine-Daten: einmal beim Start berechnen (baueSpineDaten() lebt in
// datenbereinigung.js und gibt das Array zurück, siehe draw())
let spineEintraegep5 = [];  // { typ, text, rv, stationIdx, kreisId }
let spineEintraegeKapitel = {}; // Cache je Kapitelnummer (02–18), lazy befüllt beim ersten Zoom

// Ansichtsmodus direkt setzen (Menübalken-Einträge "Plan"/"Graph", siehe
// baueKapitelRegister) — setzt NICHT auf annIndex/Scroll auf, sondern
// startet/pausiert grafikFortschritt neu (siehe aktualisiereGrafikFortschritt).
// Jeder Wechsel IN die grafische Ansicht beginnt bei 0 (Animation muss aktiv
// per Play gestartet werden). Klick auf den bereits aktiven Modus tut nichts.
function setzeKapitelAnsichtModus(modus) {
  if (kapitelAnsichtsModus === modus) return;
  if (sonifikationSpieltGerade) beendeSonifikationAudio();
  kapitelAnsichtsModus = modus;
  grafikSpielt = false;
  grafikFortschritt = 0;
  grafikPlayAusblendStart = null;
}

// Gesamtdauer eines Graph-Play-Durchlaufs: für Kapitel 1 (eigene
// Sonifikationsdaten, kapitel01-sonifikation.json, wegstreckengewichtet)
// dieselbe SONIFIKATION_GESAMTDAUER_SEK wie das Audiostück (sonifikation.js),
// damit Ton und Wachstumsanimation der Spine zusammen laufen. 02–18 wachsen
// mit derselben WachstumsGESCHWINDIGKEIT (ms pro Spine-Eintrag) wie Kapitel
// 1, statt einer für alle Kapitel gleichen festen Gesamtdauer — sonst
// wirkten Kapitel mit weniger Einträgen als Kapitel 1 (18, mehr als jedes
// andere) hastiger durchgespult. Ihr Ton (spieleKapitelSonifikationAudio,
// sonifikation.js) übernimmt exakt diese Gesamtdauer und verteilt sie
// gleichmässig auf dieselben Spine-Schritte, bleibt dadurch immer synchron.
// Für Kapitel mit nur einem Eintrag (z.B. Kapitel 2) sorgt der
// n===1-Sonderfall in zeichneSpineHorizontal dafür, dass der einzige Kreis
// über diese Dauer tatsächlich sichtbar wächst, statt sofort auf vollem
// Stand zu stehen.
function aktuelleGrafikAnimationDauer() {
  if (!zoomedKapitel) return SONIFIKATION_GESAMTDAUER_SEK * 1000;
  let n1 = spineEintraegep5.length;
  let dauerProSchritt = (SONIFIKATION_GESAMTDAUER_SEK * 1000) / (n1 - 1 || 1);
  let eintraege = spineEintraegeKapitel[zoomedKapitel];
  let ni = eintraege ? eintraege.length : 1;
  return dauerProSchritt * (ni - 1 || 1);
}

// Play/Pause-Button der grafischen (Graph-)Ansicht — für JEDES Kapitel
// (1 wie 02–18) dieselbe Wachstums-Animation der Spine, bleibt dabei immer
// in der Graph-Ansicht (Resume statt Neustart bei Pause->Play über
// grafikStartZeit = jetzt - bereits-gelaufene-Zeit, damit
// aktualisiereGrafikFortschritt() nahtlos weiterzählt). Für JEDES Kapitel
// zusätzlich mit Ton: spieleKapitel1SonifikationAudio()/
// spieleKapitelSonifikationAudio(nr)/beendeSonifikationAudio()
// (sonifikation.js) starten/stoppen synchron zur Spine — kein Resume für
// den Ton (Strudel kann nicht an einer beliebigen Stelle einsteigen),
// Pause->Play beginnt den Ton daher jeweils neu, auch wenn die Spine an
// ihrer alten Stelle weiterwächst.
function toggleGrafikPlay() {
  if (grafikFortschritt >= 1) grafikFortschritt = 0; // am Ende: von vorn
  grafikSpielt = !grafikSpielt;
  if (grafikSpielt) {
    // Einstiegstext weicht dem Play — nur beim ERSTEN Start merken, damit ein
    // Pause/Weiter den schon ausgeblendeten Text nicht neu wegblenden lässt.
    if (grafikPlayAusblendStart === null) grafikPlayAusblendStart = millis();
    grafikStartZeit = millis() - grafikFortschritt * aktuelleGrafikAnimationDauer();
    if (!zoomedKapitel) spieleKapitel1SonifikationAudio();
    else spieleKapitelSonifikationAudio(zoomedKapitel);
  } else if (sonifikationSpieltGerade) {
    beendeSonifikationAudio();
  }
}

function aktualisiereGrafikFortschritt() {
  if (!grafikSpielt) return;
  grafikFortschritt = constrain((millis() - grafikStartZeit) / aktuelleGrafikAnimationDauer(), 0, 1);
  if (grafikFortschritt >= 1) grafikSpielt = false; // Ende erreicht, Button springt zurück auf Play
}

// Fester Abstand zwischen zwei Ortspunkten der Spine (siehe
// zeichneSpineHorizontal) — NICHT mehr über eine feste Spine-Breite auf n
// Einträge gestreckt, die Gesamtbreite ergibt sich also aus n * Abstand.
// Nur eine Obergrenze: reicht der Platz zwischen Kapitelregister (links,
// 5vw) und Legende-Box (rechts, 190px + Rand) bei vielen Einträgen nicht
// (Kapitel 1 z.B. 18 Einträge — mehr als jedes andere Kapitel), wird der
// Abstand in zeichneSpineHorizontal so weit gestaucht, dass die Spine nicht
// unter dem Kapitelregister/der Legende verschwindet. Ränder zusätzlich um
// den grössten möglichen Kreisradius (100px, siehe kreisRadius) vergrössert,
// damit auch der erste/letzte Kreis selbst bei maximaler Grösse nicht unter
// Kapitelregister/Legende gerät, nicht nur sein Mittelpunkt.
const SPINE_PUNKT_ABSTAND = 70;
const SPINE_RAND_LINKS = 200;
const SPINE_RAND_RECHTS = 340;
// Vertikale Linie vom Ortspunkt nach unten zur (horizontalen) Beschriftung.
const SPINE_LABEL_LINIE_LAENGE = 16;
const SPINE_LABEL_TEXT_ABSTAND = 6;

// ---------------------------------------------------------------------------
// Festes Label-Layout der Spine. Früher wurde die Zeilenzuteilung in JEDEM
// Frame neu berechnet — sortiert nach linienStartY, das mit dem wachsenden
// Kreisradius nach unten wandert. Dadurch tauschten benachbarte Labels beim
// Scrollen laufend die Zeile, und jedes Label rutschte zusätzlich mit seinem
// eigenen Kreis mit. Jetzt wird die Anordnung EINMAL je Kapitel (und Breite)
// aus dem Endstand berechnet: ein Zeilenraster unterhalb des grössten Kreises,
// den das Kapitel überhaupt erreicht, Zeilenzuteilung streng von links nach
// rechts. Die Beschriftungen stehen dadurch über den ganzen Scroll hinweg
// still — nur die Zuführungslinie wächst mit ihrem Kreis mit.
// ---------------------------------------------------------------------------
const SPINE_LABEL_HOEHE = 16;
const SPINE_LABEL_ZEILEN_ABSTAND = 6;
// Freizuhaltender Rand oben/unten für die vertikale Lage der Spine (siehe
// spineLayout). Unten mehr, weil dort der Play-Button (48px + 12px Abstand,
// siehe .grafik-play-button in style.css) und der Scroll-Fortschrittsbalken
// liegen.
const SPINE_RAND_OBEN = 24;
const SPINE_RAND_UNTEN = 76;
const spineLayoutCache = new WeakMap(); // eintraege-Array -> { breite, hoehe, versatz, breiten, linienY }

function spineLayout(eintraege, daten, abstand, startX) {
  let vorhanden = spineLayoutCache.get(eintraege);
  if (vorhanden && vorhanden.breite === width && vorhanden.hoehe === height) return vorhanden;

  // Grösster Kreisradius am Kapitelende — dieselbe Formel wie in
  // zeichneKreiseFuerRun, nur mit dem LETZTEN Annotationsindex statt dem
  // aktuellen. Alle Labels liegen darunter, damit kein später gewachsener
  // Kreis je eine Zuführungslinie oder eine Beschriftung überdeckt.
  let letzterIndex = daten.annotationen.length - 1;
  let maxRadius = 0;
  eintraege.forEach(e => {
    if (e.typ === 'rueckkehr') return; // zeichnet keinen eigenen Kreis
    let bc = zaehleAnnotationenLiveNachOrtBasis(wohnungFilterFuerOrt(e.ortBasis), letzterIndex, daten);
    KREIS_KATEGORIEN.forEach(kat => {
      let b = bc[kat.key] || {};
      let anzahl = (b.neg || 0) + (b.pos || 0) + (b.neutral || 0) + (b.unrated || 0);
      maxRadius = Math.max(maxRadius, kreisRadius(anzahl));
    });
  });

  // Höchster Rückkehr-Bogen: die Bögen sind Halbkreise ÜBER der Spine-Linie
  // (siehe zeichneSpineHorizontal), ihr Radius ist der halbe Abstand zwischen
  // Rückkehrpunkt und Ursprungskreis. Bei Kapiteln mit weit zurückreichenden
  // Rückkehren (Kapitel 5, 7: über 400px) bestimmt dieser Wert, wie tief die
  // Linie liegen muss, damit oben nichts abgeschnitten wird.
  let maxBogen = 0;
  eintraege.forEach((e, i) => {
    if (e.typ !== 'rueckkehr') return;
    maxBogen = Math.max(maxBogen, Math.abs(i - e.zielIndex) * abstand / 2);
  });

  // Textmasse mit exakt der Schrift nehmen, in der die Labels später auch
  // gezeichnet werden (sonst stimmen die Kollisionsbreiten nicht).
  textFont("'Source Sans 3', sans-serif");
  textStyle(BOLD);
  textSize(11);

  // Zeilenzuteilung von links nach rechts: jedes Label kommt in die OBERSTE
  // Zeile, in der rechts vom zuletzt gesetzten Label noch Platz ist. Da die
  // Einträge in x-Reihenfolge durchlaufen werden, genügt je Zeile das rechte
  // Ende des jeweils letzten Labels als Vergleich.
  let zeilenEnde = [];
  let versatz = [];
  let breiten = [];
  eintraege.forEach((e, i) => {
    let x = startX + i * abstand;
    breiten[i] = textWidth(e.text);
    let halbeBreite = breiten[i] / 2 + 4;
    let zeile = zeilenEnde.findIndex(ende => x - halbeBreite > ende);
    if (zeile === -1) {
      zeile = zeilenEnde.length;
      zeilenEnde.push(-Infinity);
    }
    zeilenEnde[zeile] = x + halbeBreite;
    versatz[i] = maxRadius + SPINE_LABEL_LINIE_LAENGE + zeile * (SPINE_LABEL_HOEHE + SPINE_LABEL_ZEILEN_ABSTAND);
  });

  // Vertikale Lage der Spine-Linie. Bisher fest height/2 — dabei liefen die
  // hohen Rückkehr-Bögen oben aus dem Fenster. Jetzt: so weit nach unten wie
  // nötig, damit oben Bögen und Kreise vollständig Platz haben, aber nur so
  // weit, dass unten die Labels noch hineinpassen. Kapitel, bei denen beides
  // ohnehin passt, bleiben unverändert auf der Mitte stehen.
  let oben = Math.max(maxRadius, maxBogen);
  let unten = Math.max(...versatz) + SPINE_LABEL_TEXT_ABSTAND + SPINE_LABEL_HOEHE;
  let frei = height - SPINE_RAND_OBEN - SPINE_RAND_UNTEN;
  let linienY;
  if (oben + unten <= frei) {
    linienY = constrain(height / 2, SPINE_RAND_OBEN + oben, height - SPINE_RAND_UNTEN - unten);
  } else {
    // Passt selbst ganz nach unten geschoben nicht mehr (sehr niedriges
    // Fenster): Überstand proportional auf oben und unten verteilen, statt
    // ihn ganz auf einer Seite abzuschneiden.
    linienY = SPINE_RAND_OBEN + frei * (oben / (oben + unten));
  }

  let ergebnis = { breite: width, hoehe: height, versatz, breiten, linienY };
  spineLayoutCache.set(eintraege, ergebnis);
  return ergebnis;
}

// Horizontale Spine der grafischen Ansicht: zentriert auf den Browser,
// dieselben Einträge/Kreise wie das (jetzt entfallene) vertikale Panel, aber
// sequenziell per fortschritt (0..1, siehe grafikFortschritt) statt live am
// Scroll enthüllt. Die Kreisdiagramme wachsen dabei — analog zur Route in
// der Kartenansicht — mit der Erzählung: alle Kreise teilen sich denselben,
// aus fortschritt interpolierten "Spielkopf"-annIndex (globalAnnIndex
// unten), statt sofort im fertigen Endstand zu erscheinen. Kehrt die
// Erzählung zu einem Ort zurück (siehe baueSpineDaten: eigener
// typ 'rueckkehr' statt eines zweiten Kreises), wächst dadurch ganz von
// selbst der schon bestehende Kreis weiter — der Rückkehr-Punkt bekommt hier
// nur noch einen Bogen dorthin.
function zeichneSpineHorizontal(eintraege, fortschritt, daten = stationenData) {
  if (!eintraege.length) return;

  let n = eintraege.length;
  let verfuegbareBreite = width - SPINE_RAND_LINKS - SPINE_RAND_RECHTS;
  let abstand = n > 1 ? Math.min(SPINE_PUNKT_ABSTAND, verfuegbareBreite / (n - 1)) : SPINE_PUNKT_ABSTAND;
  let startX = SPINE_RAND_LINKS + (verfuegbareBreite - (n - 1) * abstand) / 2;
  // Vertikale Lage und Label-Anordnung kommen fertig aus spineLayout (einmal
  // je Kapitel/Fenstergrösse berechnet, danach aus dem Cache) — insbesondere
  // linienY, das die Spine so weit nach unten setzt, dass die hohen
  // Rückkehr-Bögen oben vollständig ins Fenster passen.
  let layout = spineLayout(eintraege, daten, abstand, startX);
  let linieY = layout.linienY;

  // position: wie weit der "Playhead" entlang der n Einträge (0..n-1) schon
  // ist. Eintrag i blendet weich ein, sobald position i-1..i durchläuft —
  // Eintrag 0 ist dadurch schon bei fortschritt=0 (Ruhezustand vor Play)
  // sichtbar, als Startpunkt der Linie.
  let position = fortschritt * (n - 1 || 1);

  // globalAnnIndex: interpoliert zwischen den revealIndex-Werten (rv) der
  // Einträge, an denen der Playhead gerade steht — alle Kreise wachsen so
  // gemeinsam mit derselben "Erzählzeit". Letzter Wegpunkt ist NICHT der rv
  // des letzten Eintrags selbst, sondern das Ende aller Annotationen —
  // sonst erreicht der letzte Kreis bei fortschritt=1 nie seinen vollen
  // Stand (rv markiert nur seinen ANFANG, nicht das Ende der Erzählung).
  let rvWegpunkte = eintraege.map(e => e.rv);
  rvWegpunkte[n - 1] = daten.annotationen.length - 1;
  let globalAnnIndex;
  if (n === 1) {
    // Nur ein einziger Eintrag (z.B. Kapitel 2, ein Ort): i0 und i1 würden
    // unten beide auf denselben Index 0 zeigen, dessen rv oben bereits fest
    // auf das ENDE aller Annotationen gesetzt ist — der Kreis stünde dadurch
    // ab fortschritt=0 sofort auf vollem Stand, statt zu wachsen. Stattdessen
    // ab "nichts gezählt" (-1) bis zum Ende interpolieren.
    globalAnnIndex = Math.round(lerp(-1, rvWegpunkte[0], fortschritt));
  } else {
    let i0 = Math.min(n - 1, Math.floor(position));
    let i1 = Math.min(n - 1, i0 + 1);
    globalAnnIndex = Math.round(lerp(rvWegpunkte[i0], rvWegpunkte[i1], position - i0));
  }

  if (position > 0) {
    noFill();
    stroke(ROUTE_COLOR_RGB.r, ROUTE_COLOR_RGB.g, ROUTE_COLOR_RGB.b, 255);
    strokeWeight(2);
    line(startX, linieY, startX + Math.min(n - 1, position) * abstand, linieY);
  }

  // Rückkehr-Bögen unter den Kreisen/Punkten zeichnen (gleicher Stil wie die
  // Route-Linie oben, Form: Halbkreisbogen über der Spine-Linie zwischen der
  // Rückkehr-Position und dem ursprünglichen Kreis desselben Orts).
  eintraege.forEach((e, i) => {
    if (e.typ !== 'rueckkehr') return;
    let alphaSkala = constrain(position - (i - 1), 0, 1);
    if (alphaSkala <= 0) return;
    let x = startX + i * abstand;
    let zielX = startX + e.zielIndex * abstand;
    // p5s arc() bleibt bei laufender Animation manchmal unsichtbar, siehe
    // zeichneHalbkreis — direkt über den Canvas-Context gezeichnet.
    drawingContext.strokeStyle = `rgba(${ROUTE_COLOR_RGB.r}, ${ROUTE_COLOR_RGB.g}, ${ROUTE_COLOR_RGB.b}, ${alphaSkala})`;
    drawingContext.lineWidth = 2;
    drawingContext.beginPath();
    drawingContext.arc((x + zielX) / 2, linieY, Math.abs(x - zielX) / 2, PI, TWO_PI);
    drawingContext.stroke();
  });

  // Kreise NICHT in Zeitleisten-Reihenfolge zeichnen, sondern nach Grösse
  // (grösster zuerst/unterste Ebene, kleinster zuletzt/oberste Ebene) — bei
  // eng benachbarten Punkten (fester SPINE_PUNKT_ABSTAND) überschneiden sich
  // Nachbarkreise stark, und ein in Zeitleisten-Reihenfolge SPÄTER
  // gezeichneter (aber kleinerer) Kreis würde sonst einen bereits
  // gezeichneten GRÖSSEREN Nachbarn unvollständig zudecken. Innerhalb jedes
  // einzelnen Kreises sorgt zeichneKreiseFuerRun bereits selbst für die
  // gleiche Regel (schraffiert unten, Valenz-Flächen oben, je nach Grösse).
  let kreisDaten = [];
  eintraege.forEach((e, i) => {
    if (e.typ === 'rueckkehr') return;
    let alphaSkala = constrain(position - (i - 1), 0, 1);
    if (alphaSkala <= 0) return;
    let x = startX + i * abstand;
    let bc = zaehleAnnotationenLiveNachOrtBasis(wohnungFilterFuerOrt(e.ortBasis), globalAnnIndex, daten);
    let fwertAnnotationen = sammleAnnotationenNachOrtBasis(wohnungFilterFuerOrt(e.ortBasis), globalAnnIndex, daten).filter(a => a.hasFwert);
    kreisDaten.push({ i, x, bc, fwertAnnotationen, radius: 0 });
  });

  // Groesse vorab bestimmen (groesster Hatch-Radius je bandCounts, ohne zu
  // zeichnen — dieselbe Formel wie in zeichneKreiseFuerRun) und danach
  // sortieren.
  kreisDaten.forEach(k => {
    let r = 0;
    KREIS_KATEGORIEN.forEach(kat => {
      let bc = k.bc[kat.key] || {};
      let n = (bc.neg || 0) + (bc.pos || 0) + (bc.neutral || 0) + (bc.unrated || 0);
      r = Math.max(r, kreisRadius(n));
    });
    k.radius = r;
  });
  kreisDaten.sort((a, b) => b.radius - a.radius);

  let radiusNachIndex = new Map();
  kreisDaten.forEach(k => {
    // winkel = PI: Halbkreise liegen hier OBEN/UNTEN statt links/rechts wie
    // auf der Karte — positiv nach oben, negativ nach unten (zeichneHalbkreis
    // bekommt winkel+HALF_PI für positiv, winkel-HALF_PI für negativ; im
    // Canvas zeigt -HALF_PI nach oben). Die F-Wert-Punkte bekommen denselben
    // Winkel, damit sie auf der Seite ihrer Valenz bleiben.
    let radius = zeichneKreiseFuerRun(k.x, linieY, k.bc, 1, PI);
    zeichneFwertPunkte(k.x, linieY, radius, k.fwertAnnotationen, 1, 'obenUnten');
    radiusNachIndex.set(k.i, radius);
  });

  textFont("'Source Sans 3', sans-serif");
  textStyle(BOLD);
  textSize(11);
  textAlign(CENTER, TOP);

  // Ortspunkt, Zuführungslinie und Beschriftung werden bewusst ERST HIER,
  // NACH allen Kreisen (unabhängig von deren Grösse-Reihenfolge oben)
  // gezeichnet, damit sie nie unter einem Nachbarkreis verschwinden. Die
  // Zeilenanordnung steht fest (siehe spineLayout) und ändert sich während
  // des Scrollens nicht mehr — nur die Linie wächst mit ihrem Kreis.
  // Durchgang 1: Ortspunkte und Zuführungslinien.
  eintraege.forEach((e, i) => {
    let alphaSkala = constrain(position - (i - 1), 0, 1);
    if (alphaSkala <= 0) return;
    let x = startX + i * abstand;
    let radius = radiusNachIndex.get(i) || 0;

    // Ortspunkt — p5s ellipse() bleibt bei laufender Animation manchmal
    // unsichtbar, siehe zeichneHalbkreis, daher direkt über den Context.
    drawingContext.fillStyle = `rgba(0, 0, 0, ${alphaSkala})`;
    drawingContext.beginPath();
    drawingContext.arc(x, linieY, 2.5, 0, TWO_PI);
    drawingContext.fill();

    // Zuführungslinie: vertikal vom Kreisrand (bzw. vom Ortspunkt, solange
    // der Kreis noch leer ist) hinunter zur festen Label-Zeile.
    stroke(0, 110 * alphaSkala);
    strokeWeight(1);
    line(x, linieY + (radius > 0 ? radius : 4), x, linieY + layout.versatz[i]);
    noStroke();
  });

  // Durchgang 2: Beschriftungen — NACH allen Linien, damit eine Linie auf dem
  // Weg zu einer tieferen Zeile ein fremdes Label nicht durchschneidet. Jedes
  // Label stellt sich dafür zusätzlich in der Hintergrundfarbe der
  // Grafikansicht frei. Kreise werden davon nie getroffen: die oberste
  // Label-Zeile liegt per Layout unterhalb des grössten Kreises, den das
  // Kapitel überhaupt erreicht.
  eintraege.forEach((e, i) => {
    let alphaSkala = constrain(position - (i - 1), 0, 1);
    if (alphaSkala <= 0) return;
    let x = startX + i * abstand;
    let textY = linieY + layout.versatz[i] + SPINE_LABEL_TEXT_ABSTAND;
    let breite = layout.breiten[i];

    drawingContext.fillStyle = `rgba(226, 230, 225, ${alphaSkala})`;
    drawingContext.fillRect(x - breite / 2 - 3, textY - 2, breite + 6, SPINE_LABEL_HOEHE - 2);

    // p5s text() bleibt hier während einer laufenden Play-Animation (viele
    // Frames/Sekunde, wechselnde Werte) manchmal unsichtbar, obwohl Font/
    // Farbe/Alpha/Ausrichtung im Canvas-Context nachweislich korrekt gesetzt
    // sind (mit drawingContext.fillText() an derselben Stelle sofort
    // sichtbar) — direkt über den Canvas-Context gezeichnet, um diesen Bug
    // zu umgehen; textAlign/textBaseline/font/fillStyle sind über die
    // p5-Aufrufe oben bereits auf dem Context gesetzt.
    drawingContext.fillStyle = `rgba(26, 26, 26, ${alphaSkala})`;
    drawingContext.fillText(e.text, x, textY);
  });

  textStyle(NORMAL);
}

