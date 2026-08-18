"""
schneide-kapitelkarten.py
=====================
Die Gefühlte Stadt — Bel-Ami

Schneidet die Kartenausschnitte aller Kapitel aus EINEM georeferenzierten
Basisbild zu, statt sie einzeln über OSMnx/Overpass zu rendern (siehe
rendere-kapitel-karten.py, das damit nur noch für Kapitel gebraucht wird,
deren Route über das Basisbild hinausragt).

Basisbild:  data-prep/export/cas scrollytelling - paris kapitelkarte.png
Georeferenz: aus QGIS, EPSG:3857 (Web Mercator) — X/Y min/max siehe BASIS_3857.
Gegenprobe: 22950 x 11730 m ergibt Seitenverhältnis 1.9565, das Bild
(10629 x 5433 px) 1.9564.

WICHTIG: gerechnet wird in 3857-Metern, nicht in Grad. Dort sind die Pixel
quadratisch und das Seitenverhältnis gilt unmittelbar; in WGS84 käme der
cos(Breite)-Faktor dazu. Die Bbox-Dateien für sketch.js werden erst ganz zum
Schluss aus dem ganzzahligen Pixelrechteck nach WGS84 zurückgerechnet — Bild
und Bbox können so nicht auseinanderlaufen. (sketch.js bildet Breitengrade
linear auf y ab; über die 7,7 km Höhe des Bildes weicht das von Mercator um
weniger als drei Pixel ab.)

Ausschnittsregel (dieselbe wie pruefe_routenanteil in
rendere-kapitel-karten.py): sketch.js zeichnet den Ausschnitt mit coverCrop()
und rechnet die Route über cropToBbox() darauf um. Ist das Bild breiter als
die effektive Leinwand (width - mapOffsetX, mapOffsetX = -250), zeigt
coverCrop nur den mittleren Anteil canvas_SV/bild_SV der Breite. Die Route
muss also mit Rand in der Mitte sitzen:

    Bild-SV               2.45   (immer breiter als die Leinwand, damit nur
                                  links/rechts beschnitten wird, nie oben/unten)
    Route in der Breite   <= 55 %  (sichtbar sind bei Canvas-SV 1.6: 65 %)
    Route in der Höhe     <= 70 %  (volle Höhe sichtbar)
"""
import json, math, os, sys
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
SKRIPT = os.path.dirname(os.path.abspath(__file__))
DATA_PREP = os.path.dirname(SKRIPT)
ROOT = os.path.dirname(DATA_PREP)
KARTEN = os.path.join(ROOT, "kapitel karten")
BASIS = os.path.join(DATA_PREP, "export", "cas scrollytelling - paris kapitelkarte.png")

# EPSG:3857, wie aus QGIS exportiert
BASIS_3857 = {"xmin": 247907.651, "ymin": 6244994.107, "xmax": 270857.651, "ymax": 6256724.107}

ZIEL_SV = 2.45
ROUTE_BREITE_MAX = 0.55
ROUTE_HOEHE_MAX = 0.70
MIN_HOEHE_M = 1300          # Kapitel 2 spielt an einem einzigen Ort
SICHTBAR = 1.6 / ZIEL_SV    # Anteil der Bildbreite, den coverCrop im schmalsten Fall zeigt

R = 6378137.0
def lon2x(lon): return math.radians(lon) * R
def lat2y(lat): return R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
def x2lon(x): return math.degrees(x / R)
def y2lat(y): return math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)

# Feinjustierung, wenn die berechnete Zentrierung mit der Oberfläche kollidiert:
# links die Annotationsbox (style.css .annotation-box, left: 5%), rechts die
# Spine-Fläche (.spine-panel, 220 px, right: 0). "anker" wird auf "position"
# der SICHTBAREN Breite gelegt, "breite_m" bestimmt den Massstab.
FEINJUSTIERUNG = {
    # Georges' Wohnung stand bei 33 % und damit unter der Annotationsbox.
    # Reines Verschieben genügt nicht — dann rutscht die Redaktion am anderen
    # Ende unter die Spine. Deshalb zusätzlich verbreitert.
    "03": {"anker": "Georges Duroys Wohnung (Rue Boursault)", "position": 0.46, "breite_m": 12000},
    # Kapitel 8: die Rue Constantinople stand bei 24 % und damit hinter der
    # Annotationsbox. Weiter als 42 % geht nicht — die Strecke Rue
    # Constantinople–Gare de Lyon ist 6 km echte Geografie, und bei voller
    # Bildbreite (mehr gibt das Basisbild nicht her) landet Cannes sonst
    # hinter der Spine-Fläche.
    "08": {"anker": "Rue Constantinople 127", "position": 0.42, "breite_m": 22940},
    # Kapitel 9: Rue Constantinople und die Rouen-Reise standen bei 16 bzw.
    # 18 % und damit hinter der Annotationsbox. Verbreitert und nach rechts
    # gerückt, bis beides frei steht und die Redaktion vor der Spine bleibt.
    "09": {"anker": "Rue Constantinople 127", "position": 0.35, "breite_m": 9500},
    # Kapitel 13: die Kuchenbäckerei stand bei 27 % und damit unter der
    # Annotationsbox. Hier reicht reines Verschieben — die Route endete
    # rechts erst bei 73 %, der Massstab bleibt deshalb unverändert.
    "13": {"anker": "Kuchenbäckerei am Boulevard Malesherbes", "position": 0.38, "breite_m": 12554},
    # Kapitel 17: die Route ist mit 9,3 x 5,7 km deutlich quadratischer als
    # ZIEL_SV, und ihr Westende (der Sammelpunkt im Bois) liegt nur 1,4 km vor
    # der Bildkante — bei 2.45 passt sie in keinen zentrierten Ausschnitt.
    # Bei 1.81 bleibt sie sowohl im schmalen Fenster (Canvas-SV 1.6,
    # horizontaler Beschnitt) als auch im breiten (2.1, vertikaler) sichtbar.
    "17": {"breite_m": 12200, "sv": 1.81},
}


def route_ausdehnung_3857(nr):
    with open(os.path.join(ROOT, f"kapitel{nr}-stationen.json"), encoding="utf-8") as f:
        d = json.load(f)
    p = [x for x in (d.get("routenPfadDetail") or d["routenPunkte"])
         if isinstance(x, (list, tuple)) and len(x) == 2]
    p += [[x["lon"], x["lat"]] for x in d["ortRuns"]]
    xs = [lon2x(x[0]) for x in p]; ys = [lat2y(x[1]) for x in p]
    return min(xs), max(xs), min(ys), max(ys), d


def main():
    # Kapitel 1 fehlt bewusst: es lädt ch1Image (kapitel01-qgis-karte-web.png)
    # mit dem Literal ch1ImgBbox in sketch.js und steht nicht in kapitelKarten.
    kapitel = [f"{int(a):02d}" for a in sys.argv[1:]] or [f"{i:02d}" for i in range(2, 19)]
    basis = Image.open(BASIS)
    BW, BH = basis.size
    B = BASIS_3857
    pxm_x = BW / (B["xmax"] - B["xmin"])
    pxm_y = BH / (B["ymax"] - B["ymin"])
    print(f"Basisbild {BW}x{BH}, {pxm_x:.4f} px/m (x), {pxm_y:.4f} px/m (y)")
    print(f"Ausdehnung: {x2lon(B['xmin']):.5f}..{x2lon(B['xmax']):.5f} lon, "
          f"{y2lat(B['ymin']):.5f}..{y2lat(B['ymax']):.5f} lat\n")
    for nr in kapitel:
        x0r, x1r, y0r, y1r, daten = route_ausdehnung_3857(nr)
        if not (B["xmin"] <= x0r and x1r <= B["xmax"] and B["ymin"] <= y0r and y1r <= B["ymax"]):
            fehlt = []
            if x0r < B["xmin"]: fehlt.append(f"W {(B['xmin']-x0r)/1000:.1f} km")
            if x1r > B["xmax"]: fehlt.append(f"O {(x1r-B['xmax'])/1000:.1f} km")
            if y0r < B["ymin"]: fehlt.append(f"S {(B['ymin']-y0r)/1000:.1f} km")
            if y1r > B["ymax"]: fehlt.append(f"N {(y1r-B['ymax'])/1000:.1f} km")
            print(f"Kapitel {nr}: ÜBERSPRUNGEN — Route ragt hinaus ({', '.join(fehlt)})")
            continue
        dx, dy = x1r - x0r, y1r - y0r
        hoehe = max(dy / ROUTE_HOEHE_MAX, MIN_HOEHE_M)
        breite = max(dx / ROUTE_BREITE_MAX, ZIEL_SV * hoehe)
        cx, cy = (x0r + x1r) / 2, (y0r + y1r) / 2
        sv = ZIEL_SV
        if nr in FEINJUSTIERUNG:
            fj = FEINJUSTIERUNG[nr]
            breite = fj["breite_m"]
            # Einzelne Kapitel dürfen ein flacheres Seitenverhältnis bekommen,
            # wenn ihre Route zu quadratisch für ZIEL_SV ist (siehe Kapitel 17).
            sv = fj.get("sv", ZIEL_SV)
            if "anker" in fj:
                ank = next(r for r in daten["ortRuns"] if r["ort"] == fj["anker"])
                # Anker soll bei fj["position"] der SICHTBAREN Breite liegen
                links = (1 - 1.6 / sv) / 2
                cx = lon2x(ank["lon"]) - (links + fj["position"] * (1.6 / sv) - 0.5) * breite
        # Passt der gewünschte Ausschnitt nicht ins Basisbild, wird er VERKLEINERT
        # und bleibt auf der Route zentriert — nicht verschoben. Verschieben
        # drückt sonst ein Routenende aus dem sichtbaren Fenster (coverCrop
        # zeigt nur die Mitte), und genau das ist bei den Kapiteln 7 und 8
        # passiert, deren Ersatzpunkte nahe an den Bildkanten liegen.
        max_breite = 2 * min(cx - B["xmin"], B["xmax"] - cx)
        max_hoehe = 2 * min(cy - B["ymin"], B["ymax"] - cy)
        breite = min(breite, max_breite, max_hoehe * sv)
        hoehe = breite / sv
        wx, ex = cx - breite / 2, cx + breite / 2
        sy, ny = cy - hoehe / 2, cy + hoehe / 2
        px0 = max(0, round((wx - B["xmin"]) * pxm_x)); px1 = min(BW, round((ex - B["xmin"]) * pxm_x))
        py0 = max(0, round((B["ymax"] - ny) * pxm_y)); py1 = min(BH, round((B["ymax"] - sy) * pxm_y))
        bbox = {"west": x2lon(B["xmin"] + px0 / pxm_x), "east": x2lon(B["xmin"] + px1 / pxm_x),
                "south": y2lat(B["ymax"] - py1 / pxm_y), "north": y2lat(B["ymax"] - py0 / pxm_y)}
        basis.crop((px0, py0, px1, py1)).save(os.path.join(KARTEN, f"kapitel{nr}-karte.png"))
        with open(os.path.join(KARTEN, f"kapitel{nr}-bbox.json"), "w", encoding="utf-8") as f:
            json.dump({k: round(v, 9) for k, v in bbox.items()}, f)
        ab = dx / ((px1 - px0) / pxm_x); ah = dy / ((py1 - py0) / pxm_y)
        print(f"Kapitel {nr}: {px1-px0}x{py1-py0} px, SV {(px1-px0)/(py1-py0):.2f}, "
              f"Route {ab*100:.0f}% breit / {ah*100:.0f}% hoch")


if __name__ == "__main__":
    main()
