/* =============================================================================
   sketch.js — p5-Zeichnung für Bel-Ami v2
   Datenaufbereitung und Darstellung sind getrennt gehalten.
============================================================================= */

const HATCH_SPACING = 3;

let stage, heroText, begleitTexte, kapitelEinstiegsTexte;
// Kapitel 02–18 öffnen sich per Klick (springeZuKapitelZoom/oeffneKapitelZoom),
// nicht scroll-gebunden wie Kapitel 1 — daher kein data-von/data-bis-Fenster
// möglich. Stattdessen ein fester Zeitfenster-Fade ab dem Klick-Zeitpunkt
// (kapitelEinstiegsStartMillis), siehe draw().
let kapitelEinstiegsStartMillis = null;
const KAPITEL_EINSTIEG_FADE_MS = 800;
const KAPITEL_EINSTIEG_SICHTBAR_BIS_MS = 14000;
// bgImage: Startseite/erste Übersicht (vor dem Zoom in Kapitel 1). bgImage2:
// "zweite" Übersichtskarte, die nach dem Rauszoomen aus Kapitel 1 gezeigt
// wird (Übersichtsrouten- und Kreisvergleich-Akt). Beide teilen dieselbe
// Bbox (imgBbox) und Pixelmasse, daher genügt ein einziger Crop/Bbox-
// Rechenweg — nur welches Bild tatsächlich gezeichnet wird, wechselt.
let bgImage, bgImage2, ch1Image;
let ortMarker, markerDot, markerLabel;
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
let legendeTab, legendeInhalt; // Tab (vertikal beschriftet, immer sichtbar solang legendeBox.sichtbar) + ausfahrender Inhalt (Farberklärung der Kreisgrafik)

// Jede Kapitel-Ansicht (1–18) hat zwei Modi: 'karte' (Kartenausschnitt+Route,
// wie bisher) und 'grafik' (horizontale Spine, zentriert, mit Play-Animation
// statt Karte — siehe zeichneSpineHorizontal). Umschalten über die
// "Plan"/"Graph"-Einträge oben im Kapitel-Menübalken
// (setzeKapitelAnsichtModus).
let kapitelAnsichtsModus = 'karte';
let grafikPlayButton;
let grafikSpielt = false;       // läuft die Wachstums-Animation gerade?
let grafikStartZeit = 0;        // millis() bei Play-Start (bzw. rechnerisch zurückversetzt bei Resume)
let grafikFortschritt = 0;      // 0..1, letzter berechneter Animationsstand (bleibt bei Pause stehen)

// west/east um ca. 0.0153° nach Westen korrigiert (~445px bei 6000px
// Bildbreite) — die ursprünglichen Werte platzierten Routen/Orte
// systematisch zu weit östlich gegenüber final-paris-gross-web(.2).png
// (geprüft an drei unabhängigen, bekannten Fixpunkten: Place Vendôme,
// Place de l'Opéra, Place de la Concorde — alle drei landeten mit den alten
// Werten ca. 420–460px zu weit westlich von ihrer echten Position auf der
// Karte; Nord/Süd stimmte bereits). Nach dieser Korrektur bitte visuell im
// Browser gegenprüfen (kein Zugriff auf einen echten Browser bei dieser
// Messung, nur Offline-Projektion gegen die Kartenbilder).
let imgBbox = { west: 2.2185654820200007, east: 2.424728839725431, south: 48.823985860894396, north: 48.89331233077059 };
let ch1ImgBbox = { west: 2.317834413581757, east: 2.352393886019969, south: 48.86683338890839, north: 48.881871498351956 };
// Startseiten-Marker: NICHT der Routen-Startpunkt (der bleibt bei Rue
// Notre-Dame de Lorette, siehe kapitel01-stationen.json/"Lokal in der Nähe
// der Rue Notre-Dame de Lorette") — sondern Duroys tatsächliche Wohnadresse
// laut Buch (Rue Boursault, 17. Arr.), die zuvor fälschlich mit dem Lokal
// bei Notre-Dame de Lorette gleichgesetzt wurde.
let duroyWohnung = { lon: 2.3187925, lat: 48.8851901 };

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
// System, siehe kapitel01-karte.png/stationenData). vAnchor/hAnchor
// (optional, siehe coverCrop):
// verschieben den sichtbaren Ausschnitt vertikal bzw. horizontal innerhalb
// des Kapitelbilds, ohne die zugrundeliegende karte.png/bbox.json neu
// rendern zu müssen (0 = oberster/linker Bildrand sichtbar, 1 = unterster/
// rechter Bildrand sichtbar, 0.5 = zentriert, Default). Kapitel 3s
// Routenanfang liegt z.B. nahe am Nordrand seiner Bbox — ohne vAnchor-Bias
// würde der zentrierte Bildausschnitt genau dort beschneiden.
// Kapitel 17: Route führt bis zum Bahnhof (Ziel liegt ausserhalb von
// final-paris-gross-web-2.png, bgImage2) — für dieses bleibt .bild bewusst
// null (siehe OHNE_EIGENEN_KARTENAUSSCHNITT/preload). Dadurch überspringt draw() den
// Kapitel-Zoom-Block (Zeile ~636) und das Kapitel bleibt auf der
// Übersichtskarte 2 (bgImage2, «alle Routen») — wie vereinbart, statt eines
// eigenen (zu grossen) Kartenausschnitts.
// Kapitel 06, 07, 09 und 10 bleiben nach der Literaturwissenschafts-Korrektur
// der ortRuns/Route vollständig innerhalb von Paris (kein Bahnhof/Verlassen
// der Stadt mehr — weit entfernte Handlungsorte wie "Bois du Vésinet" in
// Kapitel 07 oder "Fahrt über Rouen nach Canteleau..." in Kapitel 09 sind
// symbolisch an den Kartenrand gesetzt statt an ihre echten, weit
// entfernten Koordinaten; Kapitel 10 spielt ohnehin komplett in Paris,
// inkl. Bois de Boulogne) und bekommen daher einen eigenen, eng um die
// tatsächliche Route zugeschnittenen Kartenausschnitt.
const OHNE_EIGENEN_KARTENAUSSCHNITT = ['17'];
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
  bgImage = loadImage('final-paris-gross-web.png');
  bgImage2 = loadImage('final-paris-gross-web-2.png');
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

function setup() {
  bereinigeEingangsdaten();

  stage = document.getElementById('scrollyStage');
  heroText = document.querySelectorAll('h1, h2, .lead, .scroll-hinweis');
  begleitTexte = document.querySelectorAll('.begleittext');
  kapitelEinstiegsTexte = document.querySelectorAll('.kapitel-einstiegstext');

  ortMarker = document.getElementById('ortMarker');
  markerDot = ortMarker.querySelector('.dot');
  markerLabel = ortMarker.querySelector('.label');
  gedankenColumn = document.getElementById('gedankenColumn');
  kartenMarkierungenEl = document.getElementById('kartenMarkierungen');
  annotationText = document.getElementById('annotationText');
  annotationInner = document.getElementById('annotationInner');
  annotationTag = document.getElementById('annotationTag');
  annotationBar = document.getElementById('annotationBar');
  kapitelRegister = document.getElementById('kapitelRegister');
  orteOhneAdresse = document.getElementById('orteOhneAdresse');
  legendeBox = document.getElementById('legendeBox');
  legendeTab = document.getElementById('legendeTab');
  legendeInhalt = document.getElementById('legendeInhalt');
  legendeTab.addEventListener('click', () => legendeBox.classList.toggle('offen'));
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
  valenzText.textContent = 'Volltonfarbe: links negativ, rechts positiv bewertet';
  valenzZeile.appendChild(valenzText);

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
  fwertHinweis.textContent = 'Position ausserhalb des Kreises: negativ oben links, positiv oben rechts, neutral/unbewertet unten.';
  legendeInhalt.appendChild(fwertHinweis);
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
  let fullCrop = coverCrop(bgImage.width, bgImage.height, 0.5, 0.5, 0); // grosse Karte bleibt zentriert, unabhängig von mapOffsetX
  let fullBbox = cropToBbox(fullCrop, imgBbox, bgImage.width, bgImage.height);
  let targetCrop = coverCrop(ch1Image.width, ch1Image.height);
  let targetBbox = cropToBbox(targetCrop, ch1ImgBbox, ch1Image.width, ch1Image.height);

  let progress = getScrollProgress();
  scrollFortschrittFuellung.style.width = (progress * 100) + '%';
  let zoomAmount = constrain(map(progress, SCROLL_MEILENSTEINE.zoomStart, SCROLL_MEILENSTEINE.zoomEnd, 0, 1), 0, 1);
  // Nach Abschluss der Route wieder auf die Gesamtkarte rauszoomen — die
  // Route/Kreise/Spine bleiben dabei sichtbar, da ihr Fortschritt
  // (routeAmount, unten) über constrain() bei 1 gehalten wird und nicht
  // vom Zoom abhängt.
  let zoomOutAmount = constrain(map(progress, SCROLL_MEILENSTEINE.zoomOutStart, SCROLL_MEILENSTEINE.zoomOutEnd, 0, 1), 0, 1);
  zoomAmount *= (1 - zoomOutAmount);

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

  // Letzter Akt: Kreisvergleich handverlesener, kapitelübergreifender Orte
  // (siehe kreisvergleich-orte.json). kreisVergleichMapFade blendet die
  // Übersichtskarte/-routen in den ersten paar Prozent des Akts aus;
  // kreisVergleichAktuellesKapitel wächst danach linear über den Rest des
  // Akts von 1 auf 18 und bestimmt, wie viele Kapitel-Beiträge pro Ort
  // schon im jeweiligen Kreis aufsummiert sind.
  let kreisVergleichMapFade = constrain(map(progress, SCROLL_MEILENSTEINE.kreisVergleichStart, SCROLL_MEILENSTEINE.kreisVergleichFadeEnd, 0, 1), 0, 1);
  let kreisVergleichWachstum = constrain(map(progress, SCROLL_MEILENSTEINE.kreisVergleichFadeEnd, SCROLL_MEILENSTEINE.kreisVergleichEnd, 0, 1), 0, 1);
  let kreisVergleichAktuellesKapitel = Math.max(1, Math.min(18, Math.ceil(kreisVergleichWachstum * 18)));
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

  // Kapitel-Zoom (Klick auf «03» etc.) — zoomt von der Gesamtkarte weiter in
  // den eigenen Kartenausschnitt des Kapitels, genau wie oben bgImage→ch1Image.
  let kapitelCrop = null;
  if (zoomedKapitel && kapitelKarten[zoomedKapitel] && kapitelKarten[zoomedKapitel].bild
    && kapitelKarten[zoomedKapitel].bild.width && kapitelKarten[zoomedKapitel].bboxRaw) {
    let k = kapitelKarten[zoomedKapitel];
    kapitelCrop = coverCrop(k.bild.width, k.bild.height, k.vAnchor ?? 0.5, k.hAnchor ?? 0.5);
    let kapitelTargetBbox = cropToBbox(kapitelCrop, k.bboxRaw, k.bild.width, k.bild.height);
    activeBbox = {
      west: lerp(activeBbox.west, kapitelTargetBbox.west, kapitelZoomAmount),
      east: lerp(activeBbox.east, kapitelTargetBbox.east, kapitelZoomAmount),
      south: lerp(activeBbox.south, kapitelTargetBbox.south, kapitelZoomAmount),
      north: lerp(activeBbox.north, kapitelTargetBbox.north, kapitelZoomAmount),
    };
  }

  // Wechsel Startseiten-Karte -> zweite Übersichtskarte genau an dem Punkt,
  // an dem bgImage ohnehin unsichtbar ist (voll in Kapitel 1 eingezoomt) —
  // dadurch kein sichtbarer Sprung. Rück-Scrollen über diesen Punkt schaltet
  // symmetrisch wieder auf die Startseiten-Karte zurück.
  let currentBgImage = progress < SCROLL_MEILENSTEINE.zoomEnd ? bgImage : bgImage2;
  let bgCrop = bboxToImgCrop(activeBbox, imgBbox, currentBgImage.width, currentBgImage.height);
  // ch1Image "zoomt" nicht selbst mit — es blendet an seiner bereits fest
  // berechneten, korrekt proportionierten Zielposition (targetCrop) ein.
  // Ein dynamisch aus der (während des Übergangs noch viel zu grossen)
  // activeBbox berechneter Ausschnitt würde auf die Bildgrenzen geklemmt
  // und dabei im falschen Seitenverhältnis erscheinen (sichtbare Verzerrung
  // bei einer Strassenkarte).
  let ch1Crop = targetCrop;

  let markerScreenPos = lonLatToScreen(duroyWohnung.lon, duroyWohnung.lat, activeBbox, kartenOffsetX, kartenOffsetY);
  ortMarker.style.left = markerScreenPos.x + 'px';
  ortMarker.style.top = markerScreenPos.y + 'px';

  tint(255, 255 * (1 - zoomAmount) * (1 - kreisVergleichMapFade));
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
  if (uebersichtRoutenFortschritt > 0 && kreisVergleichMapFade < 1) {
    let uebersichtRoutenErgebnis = zeichneUebersichtsrouten(activeBbox, 180 * (1 - kreisVergleichMapFade), uebersichtRoutenFortschritt);
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
    zeichneRoute(stationenData.routenPunkte, liniIndex, activeBbox, lerp(10, 2, zoomOutAmount), kartenOffsetX, kartenOffsetY, 1 - kreisVergleichMapFade);
    // Kreisgrafik (Karte) in der letzten Ansicht (Rauszoomen) für den Moment
    // ausgeblendet — Route/Spine bleiben davon unberührt sichtbar.
    if (zoomOutAmount <= 0) {
      zeichneKreiseOrtRuns(punktIndex, annIndex, activeBbox, kartenOffsetX, kartenOffsetY);
    }
  }

  // Letzter Akt: Kreisvergleich (siehe kreisVergleichMapFade/-Wachstum oben)
  // — blendet genau dann ein, wenn die Übersichtskarte ausgeblendet ist.
  zeichneKreisVergleich(kreisVergleichMapFade, kreisVergleichAktuellesKapitel);

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
  legendeBox.classList.toggle('sichtbar', inKapitelAnsicht);
  // Register-Inhalt fährt beim Verlassen der Kapitel-Ansicht wieder ein —
  // taucht die Legende später (nächstes Kapitel) wieder auf, startet sie
  // dadurch immer eingefahren (nur der Tab), statt im zuletzt offenen Stand.
  if (!inKapitelAnsicht) legendeBox.classList.remove('offen');
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
    el.style.opacity = opacity;
  });
  // Kapitel-Einstiegstexte (02–18): zeitbasierter Fade ab Klick-Zeitpunkt
  // (kapitelEinstiegsStartMillis, gesetzt in setzeKapitelAnsichtZurueck) —
  // kein data-von/data-bis möglich, da diese Kapitel per Klick statt per
  // Scroll-Fortschritt öffnen (siehe springeZuKapitelZoom/oeffneKapitelZoom).
  // Zusätzlich mit kapitelZoomAmount multipliziert, damit der Text beim
  // Schliessen/Wechseln synchron mit der Karte mit-ausblendet.
  kapitelEinstiegsTexte.forEach(el => {
    let passtZuOffenemKapitel = el.dataset.kapitel === zoomedKapitel;
    let opacity = 0;
    if (passtZuOffenemKapitel && kapitelEinstiegsStartMillis !== null) {
      let elapsed = millis() - kapitelEinstiegsStartMillis;
      let zeitOpacity = constrain(
        Math.min(
          map(elapsed, 0, KAPITEL_EINSTIEG_FADE_MS, 0, 1),
          map(elapsed, KAPITEL_EINSTIEG_SICHTBAR_BIS_MS - KAPITEL_EINSTIEG_FADE_MS, KAPITEL_EINSTIEG_SICHTBAR_BIS_MS, 1, 0)
        ),
        0, 1
      );
      opacity = zeitOpacity * kapitelZoomAmount * (1 - kreisVergleichMapFade);
    }
    el.style.opacity = opacity;
  });
  // Georges-Duroys-Wohnung-Marker (Rue Boursault, ausserhalb von Kapitel 1s
  // Kartenausschnitt): blendet früh ein und VOR zoomStart wieder aus
  // (markerAusblendung), sonst würde er beim Reinzoomen aus dem Bild
  // wandern. (1 - kreisVergleichMapFade) zusätzlich: sonst bliebe er auch im
  // letzten Akt sichtbar über der Karte schweben, obwohl die Karte längst
  // ausgeblendet ist.
  let markerAusblendung = 1 - constrain(map(progress, SCROLL_MEILENSTEINE.markerFadeOutStart, SCROLL_MEILENSTEINE.markerFadeOutEnd, 0, 1), 0, 1);
  markerDot.style.opacity = constrain(map(progress, SCROLL_MEILENSTEINE.markerDotStart, SCROLL_MEILENSTEINE.markerDotEnd, 0, 1), 0, 1) * markerAusblendung * (1 - kreisVergleichMapFade);
  markerLabel.style.opacity = constrain(map(progress, SCROLL_MEILENSTEINE.markerLabelStart, SCROLL_MEILENSTEINE.markerLabelEnd, 0, 1), 0, 1) * markerAusblendung * (1 - kreisVergleichMapFade);

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
  if (kapitelHover) { oeffneKapitelZoom(kapitelHover); return; }
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
        // Routen-Startpunkt ("Lokal in der Nähe der Rue Notre-Dame de
        // Lorette") bekommt im Kapitel-1-Kartenausschnitt fest #9DA69D statt
        // der sonst schwarzen Beschriftung.
        labelKandidaten.push({
          ankerX: pos.x, ankerY: pos.y,
          x: pos.x, y: pos.y + 15,
          text: r.ort.toUpperCase(), // .annotation-tag ist text-transform: uppercase
          farbe: r.ort === 'Lokal in der Nähe der Rue Notre-Dame de Lorette' ? '#9DA69D' : null,
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

      if (Math.abs(y - k.y) > 1) {
        stroke(0, 100);
        strokeWeight(0.8);
        drawingContext.setLineDash([2, 3]);
        line(k.ankerX, k.ankerY, k.x - 4, y);
        drawingContext.setLineDash([]);
        noStroke();
      }
      fill(k.farbe || '#212B2E');
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
function zeichneKreiseFuerRun(cx, cy, bandCounts, alphaSkala = 1, winkel = -HALF_PI) {
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
    let hatchR = kreisRadius(n);
    if (hatchR > groessterHatchRadius) groessterHatchRadius = hatchR;
    if (hatchR > 0) {
      let hex = '#' + k.farbe.map(v => v.toString(16).padStart(2, '0')).join('');
      hatchFormen.push({ r: hatchR, zeichne: () => drawHatchedCircle(cx, cy, hatchR, hex, alphaSkala) });
    }

    // blend=true (Multiply) für gold_hell/gold_dunkel, blend=false (normale,
    // deckende Fläche) für gold_mittel — wie im alten Entwurf
    // (kapitel01-embed.js/addBand). winkel bewusst NICHT an die lokale
    // Laufrichtung der Route angelehnt, sondern fest: die Trennlinie
    // zwischen neg/pos dreht sich nie mit der Route mit.
    let blend = k.key !== 'gold_mittel';
    let negR = kreisRadius(bc.neg || 0);
    let posR = kreisRadius(bc.pos || 0);
    let neutralR = kreisRadius(bc.neutral || 0);
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
// (FWERT_PUNKT_FARBE). Position: eines von drei 120°-Dritteln rund um den Kreis,
// relativ zu winkel wie die Halbkreise in zeichneKreiseFuerRun (winkel selbst
// zeigt "neutral gegenüber" — bei winkel=-HALF_PI, der Default hier wie dort,
// ergibt das negativ oben-links, positiv oben-rechts, neutral/unbewertet
// unten). Reichen die Punkte eines Drittels nicht auf einen Bogen, wachsen
// weitere, weiter aussen liegende Ringe nach (z.B. "Cannes", Kapitel 8, mit
// 87 F-Wert-Annotationen an einem einzigen Ort).
function zeichneFwertPunkte(cx, cy, kreisRadius, fwertAnnotationen, alphaSkala = 1, winkel = -HALF_PI) {
  if (!fwertAnnotationen.length || kreisRadius <= 0) return;

  const DRITTEL = TWO_PI / 3;
  let gruppen = [
    { mitte: winkel - DRITTEL / 2, formen: [] }, // negativ: oben-links
    { mitte: winkel + DRITTEL / 2, formen: [] }, // positiv: oben-rechts
    { mitte: winkel + PI, formen: [] },          // neutral + unbewertet: unten
  ];
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

// Letzter Akt: 8 handverlesene, kapitelübergreifende Orte (Rue
// Constantinople, Rue Notre-Dame de Lorette, Boulevard des Italiens/
// Capucines, Parc Monceau, Boulevard Malesherbes, Folies Bergère, Place de
// la Madeleine, Redaktion — siehe kreisvergleich-orte.json/
// baue-kreisvergleich.py) im 4er-Raster. aktuellesKapitelMax wächst mit dem
// Scrollen von 1 auf 18 (siehe draw()); jeder Kreis summiert dabei nur die
// bandCounts der Kapitel auf, in denen der Ort tatsächlich vorkommt UND die
// bereits erreicht sind — "Kapitel XX" darunter zeigt das jeweils letzte,
// für DIESEN Ort relevante erreichte Kapitel (daher pro Ort meist eine
// andere Zahl, nicht ein gemeinsamer globaler Zähler).
function zeichneKreisVergleich(gridAlpha, aktuellesKapitelMax) {
  if (gridAlpha <= 0 || !kreisVergleichOrte || kreisVergleichOrte.length === 0) return;

  let cols = 4;
  let rows = Math.ceil(kreisVergleichOrte.length / cols);

  noStroke();
  textFont("'Source Sans 3', sans-serif");
  textAlign(CENTER, CENTER);

  kreisVergleichOrte.forEach((ort, i) => {
    let col = i % cols;
    let row = Math.floor(i / cols);
    let cx = width * (col + 0.5) / cols;
    let cy = height * (row + 0.5) / rows;

    let bandCounts = {
      gold_dunkel: { neg: 0, pos: 0, neutral: 0, unrated: 0 },
      gold_mittel: { neg: 0, pos: 0, neutral: 0, unrated: 0 },
      gold_hell: { neg: 0, pos: 0, neutral: 0, unrated: 0 },
    };
    let letztesRelevantesKapitel = null;
    ort.kapitel.forEach(k => {
      if (parseInt(k.nr, 10) > aktuellesKapitelMax) return;
      letztesRelevantesKapitel = k.nr;
      ['gold_dunkel', 'gold_mittel', 'gold_hell'].forEach(cat => {
        ['neg', 'pos', 'neutral', 'unrated'].forEach(v => {
          bandCounts[cat][v] += k.bandCounts[cat][v];
        });
      });
    });

    // p5s text() bleibt hier während des Scrollens (viele Frames/Sekunde,
    // wechselnde Werte) manchmal unsichtbar, obwohl der Canvas-Context
    // nachweislich korrekt gesetzt ist (siehe zeichneSpineHorizontal) —
    // direkt über den Canvas-Context gezeichnet.
    textStyle(BOLD);
    textSize(13);
    fill(26, 26, 26, 255 * gridAlpha);
    drawingContext.fillText(ort.name, cx, cy - 130);

    zeichneKreiseFuerRun(cx, cy, bandCounts, gridAlpha);

    textStyle(NORMAL);
    textSize(11);
    fill(90, 90, 90, 255 * gridAlpha);
    drawingContext.fillText(letztesRelevantesKapitel ? `Kapitel ${letztesRelevantesKapitel}` : 'Kapitel –', cx, cy + 130);
  });

  textAlign(LEFT, CENTER); // zurücksetzen — andere Zeichenfunktionen erwarten diese Voreinstellung
  textStyle(NORMAL);
}

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

// Redaktion La Vie Française: einziger Ort, der durch fast alle Kapitel
// hindurch wiederkehrt (siehe kreisVergleichOrte/kreisvergleich-orte.json,
// zeichneKreisVergleich) — bekommt in der Übersichtskarte (alle Kapitel)
// deshalb einen eigenen, von den einzelnen Kapitel-Routen UNABHÄNGIGEN
// Knoten: eine senkrechte Linie von seiner echten Koordinate nach unten zu
// einem eigenen Kreisdiagramm. Das Kreisdiagramm wächst analog zu den
// Kapitelrouten (zeichneUebersichtsrouten oben, siehe Aufruf dort) — nutzt
// dieselbe i/n..(i+1)/n-Slice des Akts pro Kapitel, summiert dabei aber
// LIVE über zaehleAnnotationenLiveNachOrtBasis auf (statt der in
// kreisvergleich-orte.json fest vorberechneten Kapitel-Summen), damit es
// innerhalb der Slice jedes Kapitels genauso fein mitwächst wie dessen
// Route. Kapitel 1 ist zu diesem Zeitpunkt bereits vollständig durchlaufen
// (eigener Scroll-Akt davor) und zählt daher von Anfang an voll, ohne
// lokalerFortschritt-Gate.
const REDAKTION_ORT = 'Redaktion La Vie Française';
const REDAKTION_LINIE_LAENGE = 130; // px, senkrechte Linie zum Kreis darunter — ggf. nach Sichtprüfung anpassen

function zeichneRedaktionKnoten(bbox, kapitelListe, n, fortschritt, alpha) {
  let effAlpha = zoomedKapitel ? alpha * (1 - kapitelZoomAmount) : alpha;
  if (effAlpha <= 0) return;

  let redaktionRun = stationenData.ortRuns && stationenData.ortRuns.find(r => r.ort === REDAKTION_ORT);
  if (!redaktionRun) return;

  let filter = wohnungFilterFuerOrt(REDAKTION_ORT);
  let bandCounts = zaehleAnnotationenLiveNachOrtBasis(filter, stationenData.annotationen.length - 1, stationenData);

  kapitelListe.forEach(([kapitelNr, punkte], i) => {
    let daten = datenFuerKapitel(kapitelNr);
    if (!daten || !daten.annotationen || !daten.annotationen.length) return;
    let lokalerFortschritt = constrain(map(fortschritt, i / n, (i + 1) / n, 0, 1), 0, 1);
    if (lokalerFortschritt <= 0) return;
    let annIndex = Math.min(daten.annotationen.length - 1, Math.floor(lokalerFortschritt * daten.annotationen.length));
    let kapitelBandCounts = zaehleAnnotationenLiveNachOrtBasis(filter, annIndex, daten);
    ['gold_dunkel', 'gold_mittel', 'gold_hell'].forEach(cat => {
      ['neg', 'pos', 'neutral', 'unrated'].forEach(v => {
        bandCounts[cat][v] += kapitelBandCounts[cat][v];
      });
    });
  });

  let pos = lonLatToScreen(redaktionRun.lon, redaktionRun.lat, bbox, 0, 0);
  let cy = pos.y + REDAKTION_LINIE_LAENGE;

  stroke(ROUTE_COLOR_RGB.r, ROUTE_COLOR_RGB.g, ROUTE_COLOR_RGB.b, effAlpha);
  strokeWeight(1.5);
  line(pos.x, pos.y, pos.x, cy);

  let radius = zeichneKreiseFuerRun(pos.x, cy, bandCounts, effAlpha / 255);

  noStroke();
  fill(33, 43, 46, effAlpha); // #212B2E, wie die Kapitelnummern
  textFont("'Source Sans 3', sans-serif");
  textStyle(BOLD);
  textSize(11);
  textAlign(CENTER, TOP);
  drawingContext.fillText('REDAKTION', pos.x, cy + (radius > 0 ? radius : 4) + 10);
  textStyle(NORMAL);
}

// Übersichtsrouten (Kapitel 02–18) auf der grossen, rausgezoomten Karte —
// echte Strassenrouten aus data-prep/05 bereinigen/baue-uebersichtsrouten.py,
// gedämpft in Goldton (Kategorie-Farbe gold_dunkel). Laufen in Kapitel-
// reihenfolge ab statt gemeinsam zu wachsen: der gesamte fortschritt (0..1)
// wird in gleich grosse Abschnitte pro Kapitel aufgeteilt — Kapitel 02
// zeichnet sich zuerst komplett, dann 03, usw. Ein Kapitel, dessen Abschnitt
// noch nicht erreicht ist, bleibt (Route + Startpunkt/Nummer) unsichtbar.
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
  let zoomedLokalerFortschritt = constrain(fortschritt, 0, 1);
  let aktuelleAnnotationZoom = null; // für die Annotationsbox in draw() (siehe Rückgabewert unten)

  // Im Kapitel-Zoom (Klick auf «03» etc.) bleibt nur die Route des gezoomten
  // Kapitels (+ Kapitel 1, die separat über zeichneRoute läuft) eingeblendet
  // — alle anderen Übersichtsrouten blenden mit kapitelZoomAmount aus.
  kapitelListe.forEach(([kapitelNr, punkte], i) => {
    let lokalerFortschritt = constrain(map(fortschritt, i / n, (i + 1) / n, 0, 1), 0, 1);
    if (lokalerFortschritt <= 0) return;

    // Die grobe Übersichtslinie (kapitel-routen-uebersicht.json) weicht vom
    // genaueren, aus den Annotationen gebauten routenPunkte-Verlauf ab
    // (siehe datenFuerKapitel) — sobald genau dieses Kapitel gezoomt ist,
    // wird stattdessen die genauere Route gezeichnet (siehe unten), diese
    // grobe Linie also übersprungen, um keine widersprüchliche zweite Route
    // über dem korrigierten Kartenausschnitt zu zeigen.
    if (kapitelNr === zoomedKapitel && kapitelZoomAmount > 0.001) return;

    let routenAlpha = (zoomedKapitel && kapitelNr !== zoomedKapitel)
      ? alpha * (1 - kapitelZoomAmount)
      : alpha;
    if (routenAlpha <= 0) return;
    stroke(ROUTE_COLOR_RGB.r, ROUTE_COLOR_RGB.g, ROUTE_COLOR_RGB.b, routenAlpha);
    let anzahl = Math.max(1, Math.round(lokalerFortschritt * punkte.length));
    beginShape();
    for (let j = 0; j < anzahl; j++) {
      let p = lonLatToScreen(punkte[j][0], punkte[j][1], bbox, 0, 0); // zentrierte Übersichtskarte, kein mapOffsetX
      vertex(p.x, p.y);
    }
    endShape();
  });

  // Genauere Route des gezoomten Kapitels (aus datenFuerKapitel(), siehe
  // baue-kapitel-stationen.py/baue_kapitel03.py) — ersetzt die grobe
  // Übersichtslinie für genau dieses Kapitel, sobald es gezoomt ist. Nutzt
  // denselben fixen mapOffsetX/mapOffsetY wie der Kartenausschnitt (k.bild)
  // selbst, nicht den ch1-spezifischen kartenOffsetX-Blend.
  // Erscheint bewusst erst, NACHDEM der Kapitel-Einstiegstext (siehe
  // kapitelEinstiegsStartMillis/KAPITEL_EINSTIEG_SICHTBAR_BIS_MS weiter
  // unten in draw()) fertig ausgeblendet ist — exakt dasselbe Nacheinander
  // wie bei Kapitel 1 (dort per Scroll-Meilenstein: der Begleittext blendet
  // bis routeStart aus, erst ab dort wächst routeAmount los). Ohne dieses
  // Gate erschienen Route/Kreise/Annotationsbox gleichzeitig mit dem noch
  // sichtbaren Einstiegstext, statt sauber danach.
  let kapitelEinstiegAbgeschlossen = kapitelEinstiegsStartMillis !== null
    && (millis() - kapitelEinstiegsStartMillis) >= KAPITEL_EINSTIEG_SICHTBAR_BIS_MS;
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
  let startDupGruppen = {};
  kapitelListe.forEach(([kapitelNr, punkte]) => {
    let key = punkte[0][0] + ',' + punkte[0][1];
    (startDupGruppen[key] = startDupGruppen[key] || []).push(kapitelNr);
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
    let dupGruppe = startDupGruppen[punkte[0][0] + ',' + punkte[0][1]];
    if (dupGruppe.length > 1) {
      let dupWinkel = (dupGruppe.indexOf(kapitelNr) / dupGruppe.length) * TWO_PI;
      const dupVersatz = 13; // px
      start = {
        x: start.x + cos(dupWinkel) * dupVersatz,
        y: start.y + sin(dupWinkel) * dupVersatz,
      };
    }

    // Klickbar, sobald entweder ein eigener Kartenausschnitt (kapitelKarten)
    // ODER zumindest ein Spine-Panel (KAPITEL_MIT_SPINE_PANEL) vorhanden ist
    // — Kapitel ohne eigenen Ausschnitt (aktuell 02, 14, 15) zeigen beim
    // Zoom dann nur das Spine-Panel, die Karte bleibt auf der Übersicht.
    let klickbar = (!!kapitelKarten[kapitelNr] || KAPITEL_MIT_SPINE_PANEL.has(kapitelNr)) && !zoomedKapitel;
    let hover = klickbar && dist(mouseX, mouseY, start.x, start.y) < FOTO_MARKER_TREFFER_RADIUS;
    if (hover) kapitelHover = kapitelNr;

    // fill(hexString, alpha) ist keine verlässliche p5-Signatur (bricht die
    // Farb-Auflösung ab) — deshalb RGB statt Hex+Alpha, wie überall sonst
    // im Sketch (z.B. ROUTE_COLOR_RGB).
    if (hover) fill(FWERT_COLOR_RGB.r, FWERT_COLOR_RGB.g, FWERT_COLOR_RGB.b, labelAlpha); // #C2511C
    else fill(33, 43, 46, labelAlpha); // #212B2E
    ellipse(start.x, start.y, hover ? 11 : 8, hover ? 11 : 8);
    // p5s text() bleibt hier während des Scrollens (viele Frames/Sekunde,
    // wechselnde Werte) manchmal unsichtbar, obwohl der Canvas-Context
    // nachweislich korrekt gesetzt ist (siehe zeichneSpineHorizontal, gleicher
    // Bug/Workaround) — direkt über den Canvas-Context gezeichnet, fillStyle
    // kommt schon vom fill()-Aufruf oben.
    drawingContext.fillText(kapitelNr, start.x + 8, start.y);
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

  zeichneRedaktionKnoten(bbox, kapitelListe, n, fortschritt, alpha);

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

// Öffnet den Kapitel-Zoom direkt an Ort und Stelle (kein Scroll nötig) —
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
  zoomedKapitel = nr;
  setzeKapitelAnsichtZurueck();
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
}

// Gesamtdauer eines Graph-Play-Durchlaufs: für Kapitel 1 (das einzige mit
// Sonifikationsdaten, kapitel01-sonifikation.json) dieselbe
// SONIFIKATION_GESAMTDAUER_SEK wie das Audiostück (sonifikation.js), damit
// Ton und Wachstumsanimation der Spine zusammen laufen. 02–18 wachsen mit
// derselben WachstumsGESCHWINDIGKEIT (ms pro Spine-Eintrag) wie Kapitel 1,
// statt einer für alle Kapitel gleichen festen Gesamtdauer — sonst wirkten
// Kapitel mit weniger Einträgen als Kapitel 1 (18, mehr als jedes andere)
// hastiger durchgespult. Für Kapitel mit nur einem Eintrag (z.B. Kapitel 2)
// sorgt der n===1-Sonderfall in zeichneSpineHorizontal dafür, dass der
// einzige Kreis über diese Dauer tatsächlich sichtbar wächst, statt sofort
// auf vollem Stand zu stehen.
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
// aktualisiereGrafikFortschritt() nahtlos weiterzählt). Für Kapitel 1
// zusätzlich mit Ton: spieleKapitel1SonifikationAudio()/
// beendeSonifikationAudio() (sonifikation.js) starten/stoppen synchron zur
// Spine — kein Resume für den Ton (Strudel kann nicht an einer beliebigen
// Stelle einsteigen), Pause->Play beginnt den Ton daher jeweils neu, auch
// wenn die Spine an ihrer alten Stelle weiterwächst.
function toggleGrafikPlay() {
  if (grafikFortschritt >= 1) grafikFortschritt = 0; // am Ende: von vorn
  grafikSpielt = !grafikSpielt;
  if (grafikSpielt) {
    grafikStartZeit = millis() - grafikFortschritt * aktuelleGrafikAnimationDauer();
    if (!zoomedKapitel) spieleKapitel1SonifikationAudio();
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
  let linieY = height / 2;

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
    let radius = zeichneKreiseFuerRun(k.x, linieY, k.bc, 1, 0);
    zeichneFwertPunkte(k.x, linieY, radius, k.fwertAnnotationen, 1, 0);
    radiusNachIndex.set(k.i, radius);
  });

  textFont("'Source Sans 3', sans-serif");
  textStyle(BOLD);
  textSize(11);
  textAlign(CENTER, TOP);

  // Bei eng benachbarten Punkten (fester SPINE_PUNKT_ABSTAND, siehe oben)
  // sind Labels oft breiter als der Punktabstand. Frühere Fassung sortierte
  // Kollisionen in feste "Zeilen"-Reihen ein (Zeile 0, 1, 2, … je um
  // SPINE_LABEL_ZEILEN_HOEHE versetzt) — das ignorierte aber, dass die
  // Wunschposition jedes Labels (linienStartY) durch den je Punkt eigenen
  // Kreisradius unterschiedlich tief liegt, wodurch Labels in NOMINELL
  // verschiedenen Zeilen trotzdem überlappen konnten. Jetzt wie die
  // Kartenlabels in zeichneKreisLabels: jedes Label startet an seiner
  // eigenen, kreisgrössenabhängigen Wunschposition und rutscht erst bei
  // einer echten Bounding-Box-Überlappung mit einem bereits platzierten
  // Label weiter nach unten (labelHoehe+labelPadding pro Schritt — mehr
  // Luft als die frühere feste Zeilenhöhe). Ortspunkt/Linie/Label werden
  // bewusst ERST HIER, NACH allen Kreisen (unabhängig von deren
  // Grösse-Reihenfolge oben), gezeichnet, damit sie nie unter einem
  // Nachbarkreis verschwinden.
  let labelHoehe = 16, labelPadding = 6;
  let platzierteLabel = [];
  let labelDaten = [];

  eintraege.forEach((e, i) => {
    let alphaSkala = constrain(position - (i - 1), 0, 1);
    if (alphaSkala <= 0) return;
    let x = startX + i * abstand;
    let radius = radiusNachIndex.get(i) || 0;
    let linienStartY = linieY + (radius > 0 ? radius : 4);
    labelDaten.push({ x, alphaSkala, text: e.text, textBreite: textWidth(e.text), linienStartY });
  });

  labelDaten
    .sort((a, b) => a.linienStartY - b.linienStartY)
    .forEach(d => {
      let y = d.linienStartY + SPINE_LABEL_LINIE_LAENGE;
      let bereich = [d.x - d.textBreite / 2 - 4, d.x + d.textBreite / 2 + 4];
      let ueberlappt = true;
      while (ueberlappt) {
        ueberlappt = platzierteLabel.some(p =>
          y < p.y + labelHoehe + labelPadding && y + labelHoehe + labelPadding > p.y &&
          bereich[0] < p.bereich[1] && bereich[1] > p.bereich[0]
        );
        if (ueberlappt) y += labelHoehe + labelPadding;
      }
      platzierteLabel.push({ y, bereich });
      d.labelY = y;
    });

  labelDaten.forEach(d => {
    // Ortspunkt — p5s ellipse() bleibt bei laufender Animation manchmal
    // unsichtbar, siehe zeichneHalbkreis, daher direkt über den Context.
    drawingContext.fillStyle = `rgba(0, 0, 0, ${d.alphaSkala})`;
    drawingContext.beginPath();
    drawingContext.arc(d.x, linieY, 2.5, 0, TWO_PI);
    drawingContext.fill();

    // Ortspunkt: Linie vertikal nach unten (ab Kreisrand, falls vorhanden),
    // Beschriftung horizontal darunter.
    stroke(0, 110 * d.alphaSkala);
    strokeWeight(1);
    line(d.x, d.linienStartY, d.x, d.labelY);
    noStroke();
    // p5s text() bleibt hier während einer laufenden Play-Animation (viele
    // Frames/Sekunde, wechselnde Werte) manchmal unsichtbar, obwohl Font/
    // Farbe/Alpha/Ausrichtung im Canvas-Context nachweislich korrekt gesetzt
    // sind (mit drawingContext.fillText() an derselben Stelle sofort
    // sichtbar) — direkt über den Canvas-Context gezeichnet, um diesen Bug
    // zu umgehen; textAlign/textBaseline/font/fillStyle sind über die
    // p5-Aufrufe oben bereits auf dem Context gesetzt.
    drawingContext.fillStyle = `rgba(26, 26, 26, ${d.alphaSkala})`;
    drawingContext.fillText(d.text, d.x, d.labelY + SPINE_LABEL_TEXT_ABSTAND);
  });

  textStyle(NORMAL);
}

