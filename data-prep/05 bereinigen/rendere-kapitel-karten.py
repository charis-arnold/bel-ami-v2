"""
rendere-kapitel-karten.py
=====================
Die Gefühlte Stadt — Bel-Ami

Rendert Kartenausschnitt-Bilder (kapitelXX-karte.png) + zugehörige
kapitelXX-bbox.json für einzelne Kapitel, im NEUEN Stil:

    Gebäude:  Füllfarbe GEBAEUDE_FARBE (#c6d2d7)
    Strassen: dünne Linien in STRASSEN_FARBE (#eae7e0), explizit gezeichnet
              (nicht nur implizit als Lücke zwischen Gebäuden)
    Hintergrund: weiss

Bildgeometrie (MUSS zum bestehenden System in sketch.js passen, das die
Bilder per Bbox exakt einpasst — siehe coverCrop()/kapitelKarten):
    - Höhe immer exakt 2400px.
    - Breite seitenverhältnis-korrigiert nach der Formel

          breite_px = 2400 * (bbox_breite_grad * cos(radians(bbox_mitte_lat))) / bbox_hoehe_grad

      Diese Formel wurde gegen 14 bereits vorhandene kapitelXX-karte.png /
      kapitelXX-bbox.json Paare verifiziert (max. Abweichung < 1px).

Datenquelle: OSMnx (Overpass-API für Gebäude-Polygone, gecachtes Pariser
Fussgänger-Strassennetz für die Strassenlinien — dieselbe
ox.graph_from_place("Paris, France", network_type="walk", simplify=True)
Anfrage wie in befehl-04-routen.py / baue-kapitel-stationen.py, nutzt daher
denselben Cache in data-prep/cache).

Verwendung:
    python "rendere-kapitel-karten.py"              → alle Kapitel in KAPITEL_BBOXEN
    python "rendere-kapitel-karten.py" 18            → nur Kapitel 18
    python "rendere-kapitel-karten.py" 04 05 06      → mehrere Kapitel
    python "rendere-kapitel-karten.py" 01            → Kapitel 01 (Sonderfall, siehe unten)

WICHTIG: Dieses Skript rendert Kapitel, die explizit in KAPITEL_BBOXEN
eingetragen sind, PLUS Kapitel 01 als Sonderfall (KAPITEL01_BBOX): Kapitel 01
hat kein eigenes "kapitel karten/kapitelXX-{karte.png,bbox.json}"-Paar,
sondern wird nach wie vor direkt im Projekt-Root als kapitel01-karte.png
abgelegt und ohne begleitende bbox.json gerendert — sketch.js lädt das Bild
von dort (ch1Image = loadImage('kapitel01-karte.png')) und trägt die
zugehörige Bbox als Literal (ch1ImgBbox) im Code, lädt sie also NICHT aus
einer JSON-Datei wie die übrigen Kapitel. KAPITEL01_BBOX unten MUSS daher
manuell in Sync mit ch1ImgBbox in sketch.js gehalten werden, falls sich der
Kartenausschnitt je ändert.

Alle Bboxen in KAPITEL_BBOXEN sind so konstruiert, dass sie (a) die
tatsächliche Route (routenPunkte, lokaler Pariser Cluster) vollständig
abdecken UND (b) ein Seitenverhältnis haben, das über dem grössten
realistischen Browser-Canvas-Seitenverhältnis (~2.4, inkl. mapOffsetX-Bias
in sketch.js' coverCrop()) bleibt — sonst schneidet coverCrop() beim
Einpassen aufs Browserfenster in die Route hinein (gefunden und behoben für
Kapitel 4/5, siehe Session-Notizen; hier für alle übrigen Kapitel gleich
mitgemacht). Für Kapitel mit einer weit entfernten echten Handlungsort-
Etappe (z.B. Kapitel 6/8/9: Côte d'Azur/Cannes, Kapitel 7/17: Rouen/
Normandie) wurde NUR der lokale Pariser Cluster der Route für die Bbox
verwendet — die reale Fussgänger-Kartenausschnitt-Ansicht bildet ohnehin
nur die Pariser Etappen ab, ein Fussweg Paris–Cannes ergäbe weder
inhaltlich noch als OSM-Abfrage Sinn.
"""

import json
import math
import os
import sys
import time

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import osmnx as ox

# ── Pfade ────────────────────────────────────────────────────────────────────
SKRIPT_ORDNER = os.path.dirname(os.path.abspath(__file__))        # .../data-prep/05 bereinigen
DATA_PREP_ORDNER = os.path.dirname(SKRIPT_ORDNER)                   # .../data-prep
PROJEKT_ROOT = os.path.dirname(DATA_PREP_ORDNER)                    # Projekt-Root
KARTEN_ORDNER = os.path.join(PROJEKT_ROOT, "kapitel karten")

ox.settings.use_cache = True
ox.settings.cache_folder = os.path.join(DATA_PREP_ORDNER, "cache")
ox.settings.log_console = False

# ── Korrigierte Bounding Boxen ──────────────────────────────────────────────
# Alle Kapitel ausser 01 (eigenes System) und 03 (handverfeinert, kein
# Bau-Skript vorhanden — nur Bbox/Bild hier neu gerendert, Route/Stationen
# bleiben unangetastet). Werte automatisch berechnet: tatsächliche Route
# (routenPunkte, bei weit entfernten Etappen nur der lokale Pariser Cluster
# — siehe Moduldocstring) + 0.003° Puffer auf allen vier Seiten, danach
# West/Ost symmetrisch verbreitert, bis das Bildseitenverhältnis über dem
# grössten realistischen Browser-Canvas-Seitenverhältnis (Ziel 2.45) liegt —
# sonst schneidet coverCrop() in sketch.js (zentrierter, ans Browserfenster
# angepasster Ausschnitt) oben/unten in die Route rein. Symmetrisch statt
# einseitig verbreitert: coverCrop zentriert den Ausschnitt immer auf die
# volle Bildbreite (kein horizontales vAnchor-Äquivalent) — bei einseitiger
# Verbreiterung rutscht die Route aus der Bildmitte und wird am
# gegenüberliegenden Rand abgeschnitten (so beim ersten Versuch für Kapitel
# 4 passiert, dort verschwand die Route rechts hinter dem Spine-Panel).
KAPITEL_BBOXEN = {
    # 03/07/09/10/12: Puffer nochmals vergrössert — die erste Berechnung
    # (0.003° Puffer + Seitenverhältnis-Korrektur allein) reichte zwar, um
    # jegliches Abschneiden der Route zu verhindern, liess sie aber bei
    # einigen Kapiteln so nah an den rechten Bildrand rücken, dass sie unter
    # der rechten Spine-Fläche (220px) verschwand — vor allem, wenn das
    # resultierende Bildseitenverhältnis nahe am Rand des sicheren Bereichs
    # (1.75–2.70) lag und coverCrop() dadurch kaum noch seitlich beschneidet
    # (praktisch die volle Bildbreite zeigt). Puffer iterativ erhöht, bis
    # die Route bei allen getesteten Browser-Seitenverhältnissen mit
    # mindestens 40px Sicherheitsabstand zusätzlich zur Spine-Breite sichtbar
    # bleibt.
    "02": {"west": 2.3092116, "east": 2.3713884, "south": 48.8607066, "north": 48.8774},
    "03": {"west": 2.2853834, "east": 2.3708711, "south": 48.8669873, "north": 48.8878106},
    "06": {"west": 2.2265323, "east": 2.3979451, "south": 48.8532722, "north": 48.8992869},
    # 07 neu berechnet: Rivals Junggesellenwohnung liegt seit der
    # Vereinheitlichung mit Kapitel 11 im 6. Arrondissement und fiel damit
    # aus dem (viel engeren) Ausschnitt der kapitel07-bbox.json heraus.
    # Route + 0.004° Puffer, West/Ost symmetrisch auf 2.45 verbreitert.
    "07": {"west": 2.2473607, "east": 2.4112799, "south": 48.847,     "north": 48.8910095},
    "08": {"west": 2.262373,  "east": 2.426227,  "south": 48.8379,    "north": 48.8819},
    "09": {"west": 2.1922369, "east": 2.3747643, "south": 48.871454,  "north": 48.9159},
    # Kapitel 10 ABSICHTLICH NICHT hier eingetragen: kapitel10-karte.png wird
    # NICHT von diesem Skript (osmnx/Overpass) erzeugt, sondern direkt aus dem
    # aktuellen Ausgangsbild "data-prep/export/final-paris-gross 8.png"
    # zugeschnitten (anderer Stil: Seine, Bahnlinien, Platz-Beschriftungen —
    # die osmnx-Variante hatte das alles nicht und wurde als "alte Karte"
    # verworfen). Bbox {"west": 2.226824118880883, "east": 2.371023047785783,
    # "south": 48.83501057737327, "north": 48.881756922626735} (WGS84),
    # symmetrisch um die routenPunkte-Ausdehnung zentriert, Zielseiten-
    # verhältnis ~2.0295 wie bei 06/07/08/09 — aber durch die Ausgangsbild-
    # Westgrenze (247888.927 m / EPSG:3857) limitiert, siehe kapitel10-bbox.json.
    # Würde dieses Skript hier trotzdem einen Eintrag "10" bekommen und
    # (erneut) für alle Kapitel ohne Argument aufgerufen, überschriebe es
    # kapitel10-karte.png fälschlich wieder mit der osmnx-Variante.
    "11": {"west": 2.2622817, "east": 2.3997568, "south": 48.8467647, "north": 48.8836772},
    "12": {"west": 2.2901899, "east": 2.3517101, "south": 48.8708171, "north": 48.8858021},
    "13": {"west": 2.2848755, "east": 2.3712709, "south": 48.859748,  "north": 48.8829426},
    "14": {"west": 2.3084305, "east": 2.3918531, "south": 48.8523,    "north": 48.8747},
    "15": {"west": 2.297325,  "east": 2.319675,  "south": 48.8708,    "north": 48.8768},
    # 16 neu berechnet: das Palais Walter liegt seit der Handkuratierung im
    # Faubourg Saint-Honoré (siehe baue-sammelpunkte-handkuriert.py) und fiel
    # aus dem alten Ausschnitt heraus. Route + 0.004° Puffer, danach West/Ost
    # symmetrisch auf Seitenverhältnis 2.45 verbreitert.
    "16": {"west": 2.2959866, "east": 2.3664906, "south": 48.8672,    "north": 48.8861262},
    # 17 neu berechnet: die Terrasse von Saint-Germain-en-Laye (der grösste
    # Schauplatz des Kapitels) lag knapp westlich ausserhalb des alten
    # Ausschnitts, im Osten stand dafür 8 km leere Karte. Jetzt eng um den
    # lokalen Cluster (Saint-Germain bis Palais Walter); La Roche-Guyon
    # bleibt wie Cannes in Kapitel 8 bewusst ausserhalb.
    # 17 nochmals korrigiert: die erste Neuberechnung lag zu eng um die Route
    # (97 % der Bboxbreite). coverCrop() zeigt bei einem effektiven Canvas-
    # Seitenverhältnis von ~1.9 (mapOffsetX = -250) nur den mittleren Anteil
    # canvas_SV/bild_SV der Bildbreite — Saint-Germain links und Palais
    # Walter/Concorde rechts fielen dadurch aus dem Bild. Jetzt so breit,
    # dass die Route 70 % der Breite belegt, Bild-SV bleibt bei 2.45.
    "17": {"west": 2.0464991, "east": 2.3727756, "south": 48.8297048, "north": 48.9172965},
    # 18 neu berechnet: nach der Handkuratierung bleiben nur zwei Stationen
    # (Rue Constantinople und Madeleine, 1,2 km auseinander) — Montmartre und
    # Palais Bourbon waren Erwähnungen bzw. Blickachsen. Der alte Ausschnitt
    # war dafür mehr als doppelt so gross wie nötig.
    "18": {"west": 2.2872768, "east": 2.3564732, "south": 48.8657965, "north": 48.8843723},
}

# Kapitel 01, Sonderfall — siehe Moduldocstring. MUSS 1:1 mit ch1ImgBbox in
# sketch.js synchron gehalten werden (dort als Literal geführt, nicht aus
# einer bbox.json geladen wie bei den übrigen Kapiteln) — nach jeder
# Änderung hier auch ch1ImgBbox in sketch.js nachziehen.
#
# Ursprünglich exakt um die Route (routenPunkte) herum zugeschnitten; auf
# Wunsch um +30% Fläche (Faktor sqrt(1.3) ≈ 1.1402 je Seite, zentriert um
# denselben Mittelpunkt) vergrössert, um mehr Stadtgewebe rundherum zu
# zeigen.
KAPITEL01_BBOX = {
    "west": 2.315418161114739, "east": 2.3548101388852607,
    "south": 48.86578728540404, "north": 48.88292121459595,
}

# ── Stil (neu, abweichend vom alten Silhouetten-Stil #343434-auf-weiss) ────
GEBAEUDE_FARBE = "#c6d2d7"
STRASSEN_FARBE = "#eae7e0"
HINTERGRUND_FARBE = "#ffffff"

# Strassen werden als dünne Linien gezeichnet. Um über alle Kapitel (sehr
# unterschiedliche Bbox-Grössen/Massstäbe) eine visuell konsistente Linie zu
# bekommen, wird die Linienbreite aus einer angenommenen "echten" Strassen-
# Strichbreite in Metern zurückgerechnet (statt eines festen Punktwerts).
STRASSEN_BREITE_METER = 3.0

# ── Bildgeometrie ────────────────────────────────────────────────────────────
HOEHE_PX = 2400
DPI = 300
METER_PRO_GRAD_LAT = 111_320  # konstant genug für innerstädtische Distanzen

GRAPH = None  # global, einmalig geladen, für alle Kapitel wiederverwendet


def lade_strassennetz():
    """Lädt (einmalig pro Skriptlauf) das Pariser Fussgänger-Strassennetz —
    identischer Aufruf wie in befehl-04-routen.py / baue-kapitel-stationen.py,
    nutzt daher denselben Cache (kein erneuter Netzwerk-Request nötig)."""
    global GRAPH
    if GRAPH is not None:
        return GRAPH
    print("Lade Pariser Fussgänger-Strassennetz via OSMnx (nutzt Cache falls vorhanden)...")
    t0 = time.time()
    GRAPH = ox.graph_from_place("Paris, France", network_type="walk", simplify=True)
    print(f"  Strassennetz geladen in {time.time() - t0:.1f}s: "
          f"{len(GRAPH.nodes)} Knoten, {len(GRAPH.edges)} Kanten")
    return GRAPH


# ── Sichtbarkeits-Prüfung ───────────────────────────────────────────────────
# sketch.js zeichnet den Kartenausschnitt mit coverCrop() und rechnet die Route
# über cropToBbox() auf GENAU diesen Ausschnitt um. Ist das Bild breiter als
# die (effektive) Leinwand, zeigt coverCrop nur den mittleren Anteil
#     canvas_seitenverhältnis / bild_seitenverhältnis
# der Bildbreite — der Rest fällt links und rechts weg, Route inklusive.
#
# Die effektive Leinwandbreite ist width - mapOffsetX mit mapOffsetX = -250,
# also breiter als das Fenster: bei 1440x900 rund 1.88, bei 2560x1400 rund
# 2.01. Der ungünstigste (schmalste) Fall bestimmt, wie viel sichtbar bleibt.
#
# Die bestehenden Bboxen halten die Route bei 20-60 % der Breite; diese Regel
# stand bisher aber nirgends, sondern nur implizit in den Zahlen. Einmal zu
# eng gerechnet (Kapitel 17, 97 % Breitenanteil) verschwanden die beiden
# Routenenden im Browser, ohne dass hier etwas aufgefallen wäre.
CANVAS_SV_MIN = 1.6      # konservativ: schmalste realistische Leinwand
ROUTENANTEIL_KNAPP = 0.85  # darüber: kein Rand mehr, aber noch sichtbar


def pruefe_routenanteil(nr: str, bbox: dict) -> list:
    """Warnt, wenn die Route im Browser beschnitten würde. Gibt eine Liste von
    Meldungen zurück (leer = in Ordnung)."""
    pfad = os.path.join(PROJEKT_ROOT, f"kapitel{nr}-stationen.json")
    if not os.path.exists(pfad):
        return []
    with open(pfad, encoding="utf-8") as f:
        daten = json.load(f)
    punkte = daten.get("routenPfadDetail") or daten.get("routenPunkte") or []
    punkte = [p for p in punkte if isinstance(p, (list, tuple)) and len(p) == 2]
    if not punkte:
        return []
    dlon = max(p[0] for p in punkte) - min(p[0] for p in punkte)
    dlat = max(p[1] for p in punkte) - min(p[1] for p in punkte)
    breite, hoehe = bbox["east"] - bbox["west"], bbox["north"] - bbox["south"]
    mitte_lat = (bbox["north"] + bbox["south"]) / 2
    bild_sv = breite * math.cos(math.radians(mitte_lat)) / hoehe
    # coverCrop beschneidet immer nur EINE Achse: ist das Bild breiter als die
    # Leinwand, fallen linker und rechter Rand weg (volle Höhe bleibt), sonst
    # oberer und unterer (volle Breite bleibt).
    if bild_sv > CANVAS_SV_MIN:
        sicht_b, sicht_h = CANVAS_SV_MIN / bild_sv, 1.0
    else:
        sicht_b, sicht_h = 1.0, bild_sv / CANVAS_SV_MIN
    meldungen = []
    for achse, anteil, sicht, spanne, km in (
        ("Breite", dlon / breite, sicht_b, breite, breite * 73),
        ("Höhe", dlat / hoehe, sicht_h, hoehe, hoehe * 110.54),
    ):
        if anteil > sicht:
            noetig = (dlon if achse == "Breite" else dlat) / (sicht * ROUTENANTEIL_KNAPP)
            meldungen.append(
                f"BESCHNITTEN: Route füllt {anteil*100:.0f}% der Bbox{achse.lower()}, sichtbar "
                f"sind bei Canvas-SV {CANVAS_SV_MIN} nur {sicht*100:.0f}%. "
                f"Bbox{achse.lower()} mindestens {noetig*km/spanne:.1f} km (jetzt {km:.1f} km)."
            )
        elif anteil > sicht * ROUTENANTEIL_KNAPP:
            meldungen.append(
                f"knapp: Route füllt {anteil*100:.0f}% der Bbox{achse.lower()} bei "
                f"{sicht*100:.0f}% sichtbar — kein Rand mehr."
            )
    return meldungen


def berechne_breite_px(bbox: dict) -> int:
    """Seitenverhältnis-korrigierte Bildbreite, siehe Modul-Docstring."""
    dlon = bbox["east"] - bbox["west"]
    dlat = bbox["north"] - bbox["south"]
    mitte_lat = (bbox["north"] + bbox["south"]) / 2
    breite = HOEHE_PX * (dlon * math.cos(math.radians(mitte_lat))) / dlat
    return round(breite)


def hole_gebaeude(bbox: dict):
    """Gebäude-Polygone innerhalb der Bbox via Overpass (OSMnx). Gibt
    (GeoDataFrame nur mit Polygon/MultiPolygon-Geometrien, Fetch-Dauer in s) zurück."""
    t0 = time.time()
    gdf = ox.features_from_bbox(
        bbox=(bbox["west"], bbox["south"], bbox["east"], bbox["north"]),
        tags={"building": True},
    )
    dauer = time.time() - t0
    gdf = gdf[gdf.geometry.notna()]
    gdf = gdf[gdf.geom_type.isin(["Polygon", "MultiPolygon"])]
    return gdf, dauer


def hole_strassen_im_ausschnitt(graph, bbox: dict):
    """Filtert die Kanten des (global geladenen) Pariser Strassennetzes auf
    die Kanten, deren Geometrie die Bbox schneidet."""
    _, edges = ox.graph_to_gdfs(graph, nodes=True, edges=True)
    ausschnitt = edges.cx[bbox["west"]:bbox["east"], bbox["south"]:bbox["north"]]
    return ausschnitt


def berechne_strassen_linienbreite_pt(bbox: dict) -> float:
    """Rechnet STRASSEN_BREITE_METER in eine matplotlib-Linienbreite (Punkte)
    um, passend zum Massstab dieses Kapitel-Ausschnitts (Meter/Pixel ist für
    alle Kapitel-Bboxen dieselbe Herleitung wie die Breitenformel:
    dlat * METER_PRO_GRAD_LAT / HOEHE_PX)."""
    dlat = bbox["north"] - bbox["south"]
    meter_pro_pixel = dlat * METER_PRO_GRAD_LAT / HOEHE_PX
    breite_px = STRASSEN_BREITE_METER / meter_pro_pixel
    return breite_px * 72.0 / DPI


def rendere_kapitel(nr: str, bbox: dict, graph, ziel_ordner: str = KARTEN_ORDNER,
                     schreibe_bbox_json: bool = True) -> dict:
    print(f"\nKapitel {nr}: Bbox {bbox}")

    breite_px = berechne_breite_px(bbox)
    print(f"  Zielgrösse: {breite_px} x {HOEHE_PX} px")

    # Vor dem teuren Overpass-Abruf prüfen, ob die Route im Browser überhaupt
    # ganz sichtbar wäre (siehe pruefe_routenanteil) — sonst rendert man
    # minutenlang einen Ausschnitt, der die Routenenden abschneidet.
    for meldung in pruefe_routenanteil(nr, bbox):
        print(f"  WARNUNG: {meldung}")

    gebaeude, fetch_dauer = hole_gebaeude(bbox)
    print(f"  Gebäude: {len(gebaeude)} Polygone geladen in {fetch_dauer:.1f}s")

    strassen = hole_strassen_im_ausschnitt(graph, bbox)
    print(f"  Strassen: {len(strassen)} Kanten im Ausschnitt")

    linienbreite_pt = berechne_strassen_linienbreite_pt(bbox)

    fig = plt.figure(figsize=(breite_px / DPI, HOEHE_PX / DPI), dpi=DPI)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor(HINTERGRUND_FARBE)
    fig.patch.set_facecolor(HINTERGRUND_FARBE)

    if len(strassen):
        strassen.plot(ax=ax, color=STRASSEN_FARBE, linewidth=linienbreite_pt,
                       capstyle="round", zorder=1)

    if len(gebaeude):
        gebaeude.plot(ax=ax, facecolor=GEBAEUDE_FARBE, edgecolor="none", zorder=2)

    ax.set_xlim(bbox["west"], bbox["east"])
    ax.set_ylim(bbox["south"], bbox["north"])
    ax.axis("off")
    ax.margins(0)

    ziel_png = os.path.join(ziel_ordner, f"kapitel{nr}-karte.png")
    fig.savefig(ziel_png, dpi=DPI, facecolor=HINTERGRUND_FARBE)
    plt.close(fig)

    ziel_bbox = None
    if schreibe_bbox_json:
        ziel_bbox = os.path.join(ziel_ordner, f"kapitel{nr}-bbox.json")
        with open(ziel_bbox, "w", encoding="utf-8") as f:
            json.dump(bbox, f)

    return {
        "kapitel": nr,
        "breite_px_soll": breite_px,
        "n_gebaeude": len(gebaeude),
        "n_strassen": len(strassen),
        "fetch_dauer_s": round(fetch_dauer, 1),
        "png": ziel_png,
        "bbox_json": ziel_bbox,
    }


def parse_kapitel_argumente(argv):
    if len(argv) <= 1:
        return list(KAPITEL_BBOXEN.keys())
    gewuenscht = []
    for arg in argv[1:]:
        nr = f"{int(arg):02d}"
        if nr != "01" and nr not in KAPITEL_BBOXEN:
            print(f"WARNUNG: Kapitel {nr} ist nicht in KAPITEL_BBOXEN eingetragen — übersprungen.")
            continue
        gewuenscht.append(nr)
    return gewuenscht


def main():
    kapitel_liste = parse_kapitel_argumente(sys.argv)
    if not kapitel_liste:
        print("Keine gültigen Kapitel angegeben.")
        sys.exit(1)

    print("Die Gefühlte Stadt — Kartenausschnitte rendern (neuer Stil)")
    print("─" * 60)
    print(f"Kapitel: {kapitel_liste}")
    print(f"Gebäudefarbe: {GEBAEUDE_FARBE}   Strassenfarbe: {STRASSEN_FARBE}")
    print("─" * 60)

    graph = lade_strassennetz()

    report = []
    for nr in kapitel_liste:
        if nr == "01":
            # Sonderfall: Ausgabe ins Projekt-Root, keine bbox.json (siehe
            # Moduldocstring) — Bbox exakt aus sketch.js' ch1ImgBbox.
            report.append(rendere_kapitel(nr, KAPITEL01_BBOX, graph,
                                           ziel_ordner=PROJEKT_ROOT,
                                           schreibe_bbox_json=False))
        else:
            bbox = KAPITEL_BBOXEN[nr]
            report.append(rendere_kapitel(nr, bbox, graph))

    print("\n" + "=" * 60)
    print("REPORT")
    print("=" * 60)
    for r in report:
        print(f"Kapitel {r['kapitel']}: Ziel-Breite {r['breite_px_soll']}px, "
              f"{r['n_gebaeude']} Gebäude, {r['n_strassen']} Strassen-Kanten, "
              f"Gebäude-Fetch {r['fetch_dauer_s']}s -> {r['png']}")


if __name__ == "__main__":
    main()
