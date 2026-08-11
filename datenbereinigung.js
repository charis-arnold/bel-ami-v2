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

// Hauptorte für das (statische) Kapitel-3-Spine-Panel — bewusst ohne die
// drei Lauf-ortRuns (Äussere Boulevards, Strasse vor der Wohnung Forestier,
// Boulevard Richtung Redaktion). Kapitel 3 hat (noch) keine Gedanken-Spalte-
// Auslagerungen wie Kapitel 1, daher hier weiterhin eine feste Liste statt
// der dynamischen Auswahl.
const KAPITEL03_HAUPTORTE = new Set([
  'Wohnung Duroy, Rue Boursault',
  'Parc Monceau',
  'Wohnung Forestier, Paris',
  'Bouillon Duval',
  'Redaktion La Vie Française',
]);

// Hauptorte für Kapitel 2, 4–18 — automatisch aus den Erstentwurf-ortRuns
// jedes Kapitels übernommen (siehe data-prep/05 bereinigen/
// baue-kapitel-stationen.py), NICHT redaktionell kuratiert wie oben bei
// Kapitel 3: enthält bewusst jeden ortRun inklusive des Sammelpunkts
// "Unbestimmt (Kapitel XX)", da diese Kapitel noch keine Feinarbeit wie
// Kapitel 1 (Innen/Aussen-Splits, Zusammenlegungen, Namensbereinigung)
// bekommen haben. Wird schrittweise verfeinert werden, sobald einzelne
// Kapitel wie Kapitel 1 überarbeitet werden.
const KAPITEL02_HAUPTORTE = new Set([
  'Unbestimmt (Kapitel 02)',
  'Grand Magasin du Louvre, Paris',
  'Folies Bergère',
  'Paris (allgemein)',
  'Paris und Umgebung (allgemein)',
]);

const KAPITEL04_HAUPTORTE = new Set([
  'Unbestimmt (Kapitel 04)',
  'Hotel Continental, Paris (Rue de Castiglione)',
  'Hotel Bristol, Place Vendôme / Rue du Faubourg Saint-Honoré, Paris',
  'Boulevard Poissonière (Näherung, Redaktion La Vie Française)',
  'Boulevard Poissonière (Näherung)',
  'Café am Boulevard (Näherung Boulevard Poissonière)',
  'Boulevard des Capucines, Richtung Madeleine',
  'Boulevard des Capucines, nahe Madeleine',
  'Avenue des Champs-Élysées',
  'Paris (allgemein)',
  'Arc de Triomphe de l\'Étoile, Umgebung',
  'Äußere Boulevards, Paris',
  'Folies Bergère',
  'Folies Bergère, Eingang',
  'Folies Bergère / Wohnung Rahels (näherungsweise)',
  'Polizeipräfektur, Paris',
  'Palais Bourbon / Parlament Paris (Näherung)',
  'Grands Boulevards, Paris',
]);

const KAPITEL05_HAUPTORTE = new Set([
  'Unbestimmt (Kapitel 05)',
  'Avenues du Bois de Boulogne, Paris',
  'Rue de Verneuil, Paris (Näherung)',
  'Rue de Verneuil, Paris',
  'Salon, Rue de Verneuil',
  'Salon der Wohnung, Rue Notre-Dame de Lorette (Näherung)',
  'Café Riche, Boulevard des Capucines, Paris',
  'Restaurant-Separé, Boulevard Poissonière (Näherung)',
  'Restaurant-Separé mit Blick auf Boulevard, Boulevard Poissonière (Näherung)',
  'Rue de Rome, Paris',
  'Paris (allgemein, Telegrammnetz)',
  'Rue de Constantinople 127, Paris',
  'Rue de Constantinople 127, Paris — Pförtnerloge',
  'Rue de Constantinople 127, Paris — Zweizimmerwohnung Erdgeschoss',
  'Rue de Constantinople 127, Paris — Salon der Wohnung',
  'Rue de Constantinople 127, Paris — Schlafzimmer der Wohnung',
  'Rue de Constantinople 127, Paris — Wohnung',
  'Folies Bergère',
  'äußere Boulevards (Boulevard Poissonière / äußere Boulevards Richtung Norden)',
  'äußere Boulevards',
  'Luxembourg (Restaurant/Quartier)',
  'Folies-Bergère',
  'Folies-Bergère, Eingang',
  'Folies-Bergère, Wandelgänge',
  'Folies-Bergère, Loge',
  'Folies Bergère, Paris',
  'Folies Bergère, Ausgang, Paris',
  'Vor den Folies Bergère, Paris',
  'Rue Boursault, Boulevard des Batignolles, Paris',
]);

const KAPITEL06_HAUPTORTE = new Set([
  'Unbestimmt (Kapitel 06)',
  'Folies-Bergère, Paris',
  'Les Halles, Paris',
  'Boulevard Malesherbes, Paris',
  'Boulevard Malesherbes, Eingang des Hauses Walter',
  'Boulevard Malesherbes, Haus Walter, Gesellschaftsräume',
  'Boulevard Malesherbes, Haus Walter, Vorzimmer',
  'Boulevard Malesherbes, Haus Walter, Salon',
  'Boulevard Malesherbes, Haus Walter, Boudoir',
  'Paris (allgemein)',
  'Rue de Londres, Paris',
  'Seine bei Asnières-sur-Seine',
  'Pont de la Concorde / Palais Bourbon, Paris',
  'Rue Bourgogne, Paris',
  'Rue Bourgogne, Paris (hohes Haus)',
  'Rue Bourgogne, Paris (Hausflur)',
  'Rue Bourgogne, Paris (Strassenszene)',
  'Avenue du Bois de Boulogne (heute Avenue Foch), Paris',
  'Avenue du Bois de Boulogne, Paris',
  'Bois de Boulogne, Paris',
  'Arc de Triomphe / Avenue du Bois de Boulogne, Paris',
  'Cannes',
]);

const KAPITEL07_HAUPTORTE = new Set([
  'Redaktion der Vie Française, Boulevard des Capucines',
  'Unbestimmt (Kapitel 07)',
  'Redaktionssaal der Vie Française, Boulevard des Capucines',
  'Rue d\'Ecureuil 18, Montmartre',
  'Rue de l\'Ecureuil, Montmartre, Paris',
  'Rue de l\'Ecureuil 18, Montmartre, Paris',
  'Bois du Vésinet',
  'Duroys Zimmer, Rue Notre-Dame de Lorette',
  'Rue Montmartre 176, Paris',
  'Gastine Renette, Paris (bekannter Waffenhändler, Avenue de la Grande-Armée/Champs-Élysées-Gegend)',
  'Rue Constantinople, Paris',
  'Rue Constantinople, Paris — Zimmer',
  'Rue d\'Écureuil 18, Montmartre, Paris',
  'Rue de l\'Écureuil, Montmartre, Paris',
  'Rue de l\'Écureuil 18, Montmartre, Paris',
  'Redaktion der Zeitung (Näherung: Boulevard Poissonière)',
  '176, Rue Montmartre',
  'Boulevard (unspezifisch, Paris)',
  'Boulevardcafés, Paris (Nähe Grands Boulevards)',
]);

const KAPITEL08_HAUPTORTE = new Set([
  'Unbestimmt (Kapitel 08)',
  'Rue de Constantinople, Paris',
  'Bahnhof Paris (Gare de Lyon, Abfahrt nach Cannes)',
  'Cannes',
  'Villa Jolie, Cannes',
  'Hänge zwischen Le Cannet und Golf Juan, Cannes',
  'Cannes, Krankenzimmer Forestier',
  'Cannes, Bucht mit Altstadt, Hafen, la Croisette und Îles de Lérins',
  'Îles de Lérins, Cannes',
  'Massif de l\'Esterel, Côte d\'Azur',
  'Cannes, Blick auf Esterel vom Krankenzimmer',
  'Paris (allgemein)',
  'Cannes, schattige Wege zwischen Gärten',
  'Straße von Antibes, Küstenstraße bei Cannes',
  'Küstenstraße bei Cannes/Antibes, Villa des Grafen von Paris',
  'Küstenstraße bei Cannes/Antibes',
  'Île Sainte-Marguerite, Cannes',
  'Golf Juan / Golfe-Juan',
  'Golf Juan, Kriegsgeschwader',
  'Golf Juan',
  'Ausstellungshalle Kunstfayencen, Golf Juan',
  'Paris (als Ziel der Rückkehr)',
  'Paris (allgemein, als antizipierter Rückkehrort)',
  'Friedhof von Cannes',
  'Bahnhof Cannes',
  'Rue de Constantinople, Paris 8e',
  'Cannes, Villa Jolie',
  'Le Cannet bis Golf Juan, Hügellage Cannes',
  'Salon der Villa Jolie, Cannes',
  'Villa Jolie, Cannes, Blick auf Stadt und Meer',
  'Cannes, Villa (unspezifisch)',
  'Cannes, Bucht mit Altstadt und La Croisette',
  'Cannes, Panoramablick',
  'Cannes, Villengarten mit Panoramablick',
  'Cannes, Gartenalleen',
  'Straße von Antibes, Côte d\'Azur',
  'Cannes/Antibes, Küstenstrasse',
  'Golf Juan, Côte d\'Azur',
  'Golf Juan, Bucht',
  'Paris',
]);

const KAPITEL09_HAUPTORTE = new Set([
  'Unbestimmt (Kapitel 09)',
  'Rue de Constantinople, Paris',
  'Cannes',
  'Canteleu bei Rouen',
  'Bahnhof Saint-Lazare, Paris',
  'Eisenbahnzug ab Bahnhof Saint-Lazare',
  'Bahnhof Batignolles / Strecke zwischen Forts und Seine, Paris',
  'Brücke bei Asnières, Seine',
  'Seine bei Asnières',
  'Chatou, Seine-Ufer',
  'Chatou, Umgebung von Paris',
  'Chatou, Restaurant am Wasser',
  'Chatou',
  'Wald von Saint-Germain-en-Laye',
  'Poissy, Frankreich',
  'Rouen',
  'Mantes-la-Jolie (Bahnhof)',
  'Rouen (Ziel der Zugfahrt)',
  'Hafen von Rouen, Seineufer',
  'Seine-Tal bei Rouen',
  'Kathedrale Notre-Dame de Rouen',
  'Vorstadt Saint-Sever, Rouen',
  'Croisset, Seine-Ufer',
  'Seine-Ufer bei Croisset, Insel unter Weiden',
  'Panoramablick auf Rouen und die Seine vom Hang bei Canteleu',
]);

const KAPITEL10_HAUPTORTE = new Set([
  'Paris',
  'Unbestimmt (Kapitel 10)',
  'Rue Notre-Dame de Lorette, Wohnung Forestier/Du Roy',
  'Rue Notre-Dame de Lorette (Ende)',
  'Blumenladen, Rue Notre-Dame de Lorette',
  'Wohnung Du Roy, Rue Notre-Dame de Lorette (Treppenhaus)',
  'Wohnung Du Roy, Rue Notre-Dame de Lorette',
  'Esszimmer, Wohnung Du Roy',
  'Salon, Wohnung Du Roy',
  'Rue Fontaine, Paris',
  'Champs-Élysées / Bois de Boulogne, Paris',
  'Champs-Élysées Richtung Bois de Boulogne, Paris',
  'Bois de Boulogne, Paris',
  'Bois de Boulogne, Seen',
  'Bois de Boulogne',
  'Sèvres',
  'See im Bois de Boulogne, Paris',
  'Stadtbefestigungen Paris (fortifications)',
  'Stadtbefestigungen Paris, Blick auf die Stadt',
  'Stadteingang Paris (Stadtbefestigungen)',
  'Arc de Triomphe, Place de l\'Étoile',
  'Arc de Triomphe / Avenue des Champs-Élysées',
  'Avenue des Champs-Élysées',
  'Café Tortoni, Boulevard des Italiens, Paris',
]);

const KAPITEL11_HAUPTORTE = new Set([
  'Redaktion (Boulevard Poissonière, Näherung)',
  'Unbestimmt (Kapitel 11)',
  'Église de la Madeleine, Paris',
  'Rue de Verneuil, Paris',
  'Rue de Verneuil, Wohnung Cloildes',
  'Rue de Verneuil, Salon',
  'Rue de Constantinople, Paris',
  'Folies Bergère',
  'Folies Bergère — Obergeschoss',
  'Folies Bergère — Fechtsaal',
  '6. Arrondissement, Paris',
  'Boulevard Malesherbes, Paris',
  'Salon im Hause Walter, Boulevard Malesherbes',
  'Église de la Trinité, Paris',
  'Paris (allgemein)',
]);

const KAPITEL12_HAUPTORTE = new Set([
  'Place de la Trinité, Paris',
  'Paris (allgemein)',
  'Springbrunnen am Platz vor der Trinité-Kirche',
  'Anlagen am Platz vor der Trinité-Kirche',
  'Platz vor der Trinité-Kirche',
  'Trinité-Kirche, Paris',
  'Unbestimmt (Kapitel 12)',
  'Église de la Trinité, Paris',
  'Église de la Trinité, rechtes Seitenschiff',
  'Parc Monceau, Paris',
  'Ruine mit Quelle, Parc Monceau, Paris',
  'Ruine/Säulenkreis, Parc Monceau, Paris',
  'Tor des Parc Monceau zum äusseren Boulevard, Paris',
  'Rue de Constantinople, Paris',
  'Rue de Constantinople, Paris (vor Duroys Wohnung)',
  'Rue de Constantinople, Paris (Duroys Junggesellenwohnung)',
  'Rue de Constantinople, Paris (Eingang zu Duroys Wohnung)',
]);

const KAPITEL13_HAUPTORTE = new Set([
  'Unbestimmt (Kapitel 13)',
  'Paris',
  'Rue Constantinople, Paris',
  'Chambre des députés (Palais Bourbon), Paris',
  'Boulevard Malesherbes, Paris',
  'Kuchenbäckerei am Boulevard Malesherbes, Paris',
  'Boulevard Poissonière (Näherung), Paris',
  'Juwelierladen am Boulevard, Paris',
  'Rue Drouot, Paris',
  'Chaussée d\'Antin, Paris',
  'Rue Drouot, Paris (Umkehr Richtung Chaussée d\'Antin)',
  'Wohnhaus Graf de Vaudrec, Chaussée d\'Antin, Paris',
  'Wohnung Duroy, Rue Notre-Dame de Lorette',
  'Redaktion La Vie Française, Boulevard Poissonière',
]);

const KAPITEL14_HAUPTORTE = new Set([
  'Unbestimmt (Kapitel 14)',
  'Rue des Vosges 17, Paris',
  'Théâtre du Vaudeville, Boulevard des Capucines, Paris',
  'Boulevard des Capucines / Théâtre du Vaudeville, Paris',
]);

const KAPITEL15_HAUPTORTE = new Set([
  'Unbestimmt (Kapitel 15)',
  'Faubourg-Saint-Honoré / Champs-Élysées, Paris',
  'Schloss im Faubourg-Saint-Honoré, Paris',
  'Paris (allgemein)',
]);

const KAPITEL16_HAUPTORTE = new Set([
  'Unbestimmt (Kapitel 16)',
  'Place Notre-Dame-de-Lorette, Paris',
  'Rue Fontaine 17, Paris',
  'Rue Lafayette, Paris',
  'Restaurant Coq-Faisan, Rue Lafayette, Paris',
  'Rue La Rochefoucauld, Paris',
  'Wohnung des Polizeikommissars, Rue La Rochefoucauld, Paris',
  'Rue des Martyrs, Paris',
  'Rue des Martyrs, Wohnung im zweiten Stock',
  'Rue des Martyrs, vor dem Haus',
  'Rue des Martyrs, Hauseingang und Treppe',
]);

const KAPITEL17_HAUPTORTE = new Set([
  'Unbestimmt (Kapitel 17)',
  'Pavillon Henri IV, Saint-Germain-en-Laye',
  'Avenue des Champs-Élysées / Bois de Boulogne',
  'Mont-Valérien / Bougival / Pecq, Seine-Ufer',
  'Maison-Laffitte, Seine',
  'Marly-le-Roi, Wasserleitung von Marly',
  'Le Vésinet, Seen',
  'Sartrouville, Kirchturm',
  'Paris (allgemein)',
  'Place de la Concorde, gegenüber dem Marineministerium (Ministère de la Marine)',
  'Place de la Concorde',
  'Chatou',
  'Place de la Concorde, Marineministerium (Arkaden)',
  'Place de la Concorde, Droschke vor dem Marineministerium',
  'Place de la Concorde, Abfahrt der Droschke',
  'Sèvres',
  'La Roche-Guyon, Seine',
  'Paris (Stadtgrenze/Ausfahrt)',
  'Paris',
  'La Roche-Guyon',
  'Paris (als Rückkehrziel genannt)',
]);

const KAPITEL18_HAUPTORTE = new Set([
  'Rue Constantinople, Paris',
  'Rue Constantinople, Paris — Eingang der Wohnung',
  'Rue Constantinople, Paris — Wohnung',
  'Unbestimmt (Kapitel 18)',
  'Église de la Madeleine, Paris',
  'Paris (allgemein)',
  'Rue Royale / Église de la Madeleine, Paris',
  'Église de la Madeleine, Innenraum',
  'Église de la Madeleine, Chor und Altar',
  'Montmartre, Paris',
  'Église de la Madeleine, Paris (Hochzeitskirche im Kontext)',
  'Kirche, Hochzeitsszene',
  'Madeleine-Kirche, Paris',
  'Palais Bourbon / Abgeordnetenkammer, Paris',
  'Place de la Concorde / Palais Bourbon, Paris',
  'Madeleine-Kirche / Palais Bourbon, Paris',
  'Stufen der Madeleine-Kirche, Paris',
]);

// Zentrale Zuordnung Kapitelnummer (String, zweistellig) -> Hauptorte-Set,
// fürs generische Spine-Panel beim Kapitel-Zoom (siehe sketch.js:
// oeffneKapitelZoom/zeichneSpine). Kapitel 01 fehlt hier bewusst — Kapitel 1
// hat sein eigenes, live wachsendes Spine-Panel (ortRunsFuerSpine), kein
// statisches wie die übrigen Kapitel.
const KAPITEL_HAUPTORTE = {
  '02': KAPITEL02_HAUPTORTE,
  '03': KAPITEL03_HAUPTORTE,
  '04': KAPITEL04_HAUPTORTE,
  '05': KAPITEL05_HAUPTORTE,
  '06': KAPITEL06_HAUPTORTE,
  '07': KAPITEL07_HAUPTORTE,
  '08': KAPITEL08_HAUPTORTE,
  '09': KAPITEL09_HAUPTORTE,
  '10': KAPITEL10_HAUPTORTE,
  '11': KAPITEL11_HAUPTORTE,
  '12': KAPITEL12_HAUPTORTE,
  '13': KAPITEL13_HAUPTORTE,
  '14': KAPITEL14_HAUPTORTE,
  '15': KAPITEL15_HAUPTORTE,
  '16': KAPITEL16_HAUPTORTE,
  '17': KAPITEL17_HAUPTORTE,
  '18': KAPITEL18_HAUPTORTE,
};

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
// passenden Positions-Filter, für alle anderen Orte den ortBasis-String
// selbst (Standardverhalten von zaehleAnnotationenLiveNachOrtBasis).
function wohnungFilterFuerOrt(ort) {
  if (ort === WOHNUNG_SAMMELPUNKT_ANKER) return WOHNUNG_VOR_SPLIT_FILTER;
  if (ort === RUE_NOTRE_DAME_DE_LORETTE_ORT) return RUE_NOTRE_DAME_FILTER;
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
// Gedanken-Spalte zugeordnet ist (Ballokale, Champs-Élysées/Bois de
// Boulogne, Afrika, Bois de Boulogne, Parc Monceau, imaginierter
// Sommergarten) — jeweils genau 1 Annotation, die sonst zweimal gezählt
// würde (Gedanken-Kreis UND Kartenkreis). Diese ortRuns bekommen deshalb
// keinen eigenen wachsenden Kreis auf der Karte/Spine (siehe
// zeichneKreiseOrtRuns).
const GEDANKEN_ORTRUN_UNTERDRUECKT = new Set(
  Object.values(GEDANKEN_FILTER).filter(v => typeof v === 'string')
);

// Liefert die ortRun-Namen, die einen eigenen Spine-Eintrag bekommen: jeden
// Kartenkreis (siehe zeichneKreiseOrtRuns in sketch.js, Ausschluss der
// absorbierten Wohnung-Mini-Erwähnungen) UND zusätzlich die in die
// Gedanken-Spalte ausgelagerten ortRuns — diese bekommen zwar keinen
// eigenen Kartenkreis (siehe GEDANKEN_ORTRUN_UNTERDRUECKT), sollen aber in
// der richtigen chronologischen Reihenfolge auch auf der Spine erscheinen.
function ortRunsFuerSpine(daten) {
  return new Set(
    (daten.ortRuns || [])
      .map(r => r.ort)
      .filter(ort => !WOHNUNG_SAMMELPUNKT_ABSORBIERTE_ORTRUNS.has(ort))
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
  // Georges-Duroys-Wohnung-Marker (ortMarker, Startseite): blendet früh ein
  // und VOR zoomStart wieder aus (markerFadeOutEnd < zoomStart) — der Marker
  // zeigt Rue Boursault, die ausserhalb von Kapitel 1s Kartenausschnitt
  // liegt; bliebe er bis in den Zoom hinein sichtbar, würde er dabei aus dem
  // Bild wandern (siehe letzteAlt-Position, lag noch innerhalb des
  // Ausschnitts, daher fiel das dort nicht auf).
  markerDotStart: 0.0, markerDotEnd: 0.025,
  markerLabelStart: 0.04, markerLabelEnd: 0.06,
  markerFadeOutStart: 0.085, markerFadeOutEnd: 0.11,
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
  rohdaten.route = Array.isArray(rohdaten.route) ? rohdaten.route : Object.values(rohdaten.route);
  rohdaten.gedanken = Array.isArray(rohdaten.gedanken) ? rohdaten.gedanken : Object.values(rohdaten.gedanken || {});
  rohdaten.markierungen = Array.isArray(rohdaten.markierungen) ? rohdaten.markierungen : Object.values(rohdaten.markierungen || {});
  rohdaten.routenPunkte = Array.isArray(rohdaten.routenPunkte) ? rohdaten.routenPunkte : Object.values(rohdaten.routenPunkte || {});
  rohdaten.annotationen = Array.isArray(rohdaten.annotationen) ? rohdaten.annotationen : Object.values(rohdaten.annotationen || {});
  rohdaten.ortRuns = Array.isArray(rohdaten.ortRuns) ? rohdaten.ortRuns : Object.values(rohdaten.ortRuns || {});

  // Annotationen mit "deaktiviert": true fliessen nirgends mehr ein (Route-
  // Timing, Kreiszählungen, Spine, Gedanken) — reversibel: Feld einfach
  // wieder entfernen oder auf false setzen, um die Annotation zurückzuholen.
  rohdaten.annotationen = rohdaten.annotationen.filter(a => !a.deaktiviert);

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
  let orte = Array.isArray(rohdaten) ? rohdaten : Object.values(rohdaten || {});
  return orte.map(ort => ({
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

function zaehleAnnotationenLiveNachOrtBasis(filter, annIndex, daten = stationenData) {
  let ortBasisWerte = filter instanceof Set ? filter : new Set([filter]);
  let sichtbareTreffer = daten.annotationen.filter((a, ai) => {
    if (ai > annIndex) return false;
    let treffer = typeof filter === 'function' ? filter(a, ai)
      : typeof filter === 'number' ? a.id === filter
      : ortBasisWerte.has(a.ortBasis || a.ort || '');
    return treffer && a.category;
  });
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
// bekommen sollen. opts.live (Default true): ob der Kreis live über
// annIndex nachwächst (zeichneSpine ruft dafür
// zaehleAnnotationenLiveNachOrtBasis auf) oder als statischer Endstand
// (r.bandCounts) gezeigt wird — für Kapitel, die noch keine eigene
// Scroll-Choreografie haben, ist "live: false" die richtige Wahl.
// opts.parisAllgemein (Default leer): Set von ortRun-Namen, die zu einem
// gemeinsamen "Paris allgemein"-Eintrag aggregiert werden (siehe Kapitel 1).
function baueSpineDaten(daten, hauptorte, opts = {}) {
  let live = opts.live !== false;
  let parisAllgemein = opts.parisAllgemein || new Set();
  let runs = daten.ortRuns || [];
  let eintraege = [];
  let parisBc = {
    gold_dunkel: { neg: 0, pos: 0, neutral: 0, unrated: 0 },
    gold_mittel: { neg: 0, pos: 0, neutral: 0, unrated: 0 },
    gold_hell: { neg: 0, pos: 0, neutral: 0, unrated: 0 },
  };
  let parisRv = 0;
  let parisHinzugefuegt = false;

  runs.forEach(r => {
    if (parisAllgemein.has(r.ort)) {
      ['gold_dunkel', 'gold_mittel', 'gold_hell'].forEach(cat => {
        ['neg', 'pos', 'neutral', 'unrated'].forEach(v => {
          parisBc[cat][v] += (r.bandCounts[cat]?.[v] || 0);
        });
      });
      if (!parisHinzugefuegt) {
        parisRv = r.revealIndex;
        eintraege.push({
          typ: 'muted', text: 'Paris allgemein',
          rv: parisRv, bandCounts: parisBc,
        });
        parisHinzugefuegt = true;
      }
    } else if (hauptorte.has(r.ort)) {
      eintraege.push({
        typ: r.nodeType === 'location' ? 'location' : 'gedanke',
        text: r.ort, rv: r.revealIndex, bandCounts: r.bandCounts,
        ortBasis: live ? r.ort : undefined,
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
