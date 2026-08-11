"""
baue-kapitel-stationen.py
=====================
Die Gefühlte Stadt — Bel-Ami
Baut automatische Erstentwurf-Dateien kapitelXX-stationen.json für Kapitel
04 bis 18 im selben Grundschema wie das (von Hand verfeinerte)
kapitel01-stationen.json.

WICHTIG: Dies ist bewusst ein GROBER, automatischer Erstentwurf — keine
Gedanken-Spalten-Trennung, keine Innen/Aussen-Splits, keine
Wohnung-Sammelpunkt-Tricks wie bei Kapitel 1. Diese Verfeinerungen kommen
(wie bei Kapitel 1) in späteren Sitzungen Schritt für Schritt.

Input:  ../03 output/kapitel-XX-final.json  (XX = 04..18)
Output: <projekt-root>/kapitelXX-stationen.json

Zwei Felder fehlen in kapitel-XX-final.json komplett und werden hier selbst
deterministisch berechnet (siehe kategorie_fuer_annotation() und die
Koordinaten-Logik weiter unten):

1. category (gold_dunkel/gold_mittel/gold_hell) — Prioritätsregel nach tags/
   valenz, siehe kategorie_fuer_annotation().
2. Koordinaten für Annotationen ohne eigene lat/lng — diese werden einem
   gemeinsamen Sammelpunkt-ortRun "Unbestimmt (Kapitel XX)" pro Kapitel
   zugeordnet (Platzhalter-Koordinate: Mittelpunkt der im Kapitel bekannten
   Koordinaten, sonst letzte bekannte Koordinate des Vorkapitels, sonst die
   grobe Paris-Bbox-Mitte aus sketch.js' imgBbox).

revealIndex ist hier bewusst einfach: fortlaufende Array-Position der
Annotation (0-basiert, streng aufsteigend, 1 Annotation = 1 Wert) — KEINE
Zusammenlegung mehrerer Annotationen auf denselben Wert wie bei Kapitel 1
(dort ein nachträglich behobener Bug, hier von Anfang an vermieden).

routenPunkte hat deshalb exakt len(annotationen) Einträge (== max(revealIndex)
+ 1): ein Punkt pro Annotation/revealIndex. Für Annotationen MIT eigener
Koordinate wird zwischen aufeinanderfolgenden "Anker"-Koordinaten ein echter
Fussweg via OSMnx berechnet (gleiche Methode wie befehl-04-routen.py /
baue-uebersichtsrouten.py) und dieser Fussweg dann per Bogenlängen-Resampling
auf exakt so viele Punkte gebracht, wie zwischen den beiden Ankern an
Annotationen liegen (inkl. der Anker selbst). Annotationen VOR dem ersten
bzw. NACH dem letzten Anker halten die jeweils nächste bekannte Koordinate
(kein Rückgriff auf den Sammelpunkt — das ist eine bewusste Vereinfachung:
der Sammelpunkt ist nur für die ortRun/Kreis-Zuordnung gedacht, nicht für den
Bewegungspfad). Kapitel ganz ohne Koordinaten (kommt bei 04–18 nicht vor,
wird hier aber sicherheitshalber abgefangen) bekommen eine Platzhalter-Route:
eine einzige Koordinate, wiederholt.
"""

import json
import math
import os

import networkx as nx
import osmnx as ox

# ── Pfade ──────────────────────────────────────────────────────────────────
SKRIPT_ORDNER = os.path.dirname(os.path.abspath(__file__))       # .../data-prep/05 bereinigen
DATA_PREP_ORDNER = os.path.dirname(SKRIPT_ORDNER)                  # .../data-prep
PROJEKT_ROOT = os.path.dirname(DATA_PREP_ORDNER)                   # Projekt-Root (dort liegen kapitelXX-stationen.json)

INPUT_DIR = os.path.join(DATA_PREP_ORDNER, "03 output")
OUTPUT_DIR = PROJEKT_ROOT

ox.settings.use_cache = True
ox.settings.cache_folder = os.path.join(DATA_PREP_ORDNER, "cache")

KAPITEL_NUMMERN = [2] + list(range(4, 19))  # 02, 04..18 — NIEMALS 1 oder 3 hier eintragen:
# beide haben ihr eigenes, von Hand verfeinertes Format/Skript (kapitel01 = diese ganze
# Sitzung, kapitel03 = data-prep/05 bereinigen/baue_kapitel03.py). Ein versehentlicher
# Lauf mit 3 in dieser Liste hat kapitel03-stationen.json einmal bereits überschrieben
# und musste aus dem Session-Transkript rekonstruiert werden.

# Grobe Paris-Bbox, identisch mit imgBbox in sketch.js — nur als letzter
# Fallback, falls ein Kapitel (und auch das Vorkapitel) gar keine Koordinate
# liefert.
IMG_BBOX = {"west": 2.218325, "east": 2.466990, "south": 48.811234, "north": 48.893009}
BBOX_MITTE = ((IMG_BBOX["west"] + IMG_BBOX["east"]) / 2, (IMG_BBOX["south"] + IMG_BBOX["north"]) / 2)  # (lon, lat)

# Der Annotations-Pipeline (befehl-01/02, vor dieser Sitzung gelaufen) gibt
# jeder vagen "Paris (allgemein)"/"unspezifisch"-Erwähnung denselben
# generischen Platzhalter-Geocode (Île de la Cité/Notre-Dame) statt gar
# keine Koordinate — dadurch wurden solche Annotationen bislang wie echte
# Wegpunkte behandelt und liessen die Fussgängerroute quer durch Paris
# springen (gefunden in Kapitel 4 u.a., systemisch in fast allen Kapiteln
# vorhanden). Diese Koordinate wird deshalb wie "keine Koordinate"
# behandelt — die betroffene Annotation landet stattdessen im Sammelpunkt.
GENERISCHE_PARIS_KOORDINATE = (2.3522, 48.8566)  # (lng, lat)


def ist_generischer_platzhalter(koordinaten):
    lat, lng = koordinaten.get("lat"), koordinaten.get("lng")
    if lat is None or lng is None:
        return False
    return abs(lng - GENERISCHE_PARIS_KOORDINATE[0]) < 1e-6 and abs(lat - GENERISCHE_PARIS_KOORDINATE[1]) < 1e-6


GRAPH = None
GRAPH_BBOX = None  # (min_lon, max_lon, min_lat, max_lat) des geladenen Netzes, + Marge

# Marge um die tatsächliche Knoten-Bbox des geladenen Netzes, in Grad
# (~0.02° ≈ 2.2 km) — grosszügig genug für Punkte direkt an der Stadtgrenze,
# aber klein genug, um Vorstadt-/Ausflugsziele (Chatou, Sartrouville,
# Saint-Germain-en-Laye) und erst recht weit entfernte Handlungsorte
# (Rouen, Cannes) zuverlässig auszuschliessen.
GRAPH_BBOX_MARGE = 0.02


def lade_strassennetz():
    """Lädt (einmalig pro Skriptlauf) das Pariser Fussgänger-Strassennetz —
    identischer Aufruf wie in befehl-04-routen.py / baue-uebersichtsrouten.py,
    nutzt daher denselben Cache."""
    global GRAPH, GRAPH_BBOX
    if GRAPH is not None:
        return GRAPH
    print("Lade Pariser Strassennetz via OSMnx (einmalig, nutzt Cache falls vorhanden)...")
    GRAPH = ox.graph_from_place("Paris, France", network_type="walk", simplify=True)
    print(f"  Strassennetz geladen: {len(GRAPH.nodes)} Knoten, {len(GRAPH.edges)} Kanten")
    xs = [d["x"] for _, d in GRAPH.nodes(data=True)]
    ys = [d["y"] for _, d in GRAPH.nodes(data=True)]
    GRAPH_BBOX = (min(xs) - GRAPH_BBOX_MARGE, max(xs) + GRAPH_BBOX_MARGE,
                  min(ys) - GRAPH_BBOX_MARGE, max(ys) + GRAPH_BBOX_MARGE)
    print(f"  Netz-Bbox (+Marge): lon {GRAPH_BBOX[0]:.4f}..{GRAPH_BBOX[1]:.4f}, lat {GRAPH_BBOX[2]:.4f}..{GRAPH_BBOX[3]:.4f}")
    return GRAPH


def im_pariser_netz(lon, lat):
    """Prüft, ob eine Koordinate innerhalb der (mit Marge versehenen) Bbox
    des geladenen Pariser Fussgängernetzes liegt. Das Netz deckt nur die
    Stadt Paris ab — Handlungsorte ausserhalb (Chatou, Rouen, Cannes,
    Côte d'Azur, ...) liegen weit ausserhalb und würden von
    ox.nearest_nodes() sonst STUMM auf den nächstgelegenen Pariser Knoten
    "gesnappt" (kein Fehler, aber ein völlig sinnloser Fussweg über hunderte
    Kilometer). Für solche Etappen wird bewusst KEIN OSMnx-Fussweg berechnet,
    sondern eine Luftlinie verwendet (siehe berechne_etappe) — ein reales
    Fussgänger-Strassennetz für die Zugreisen nach Rouen/Cannes wäre ohnehin
    fachlich unsinnig und würde ein sehr viel grösseres, nicht gecachtes
    Regionalnetz erfordern (ausserhalb des Umfangs dieses Erstentwurfs).
    """
    if GRAPH_BBOX is None:
        return False
    min_lon, max_lon, min_lat, max_lat = GRAPH_BBOX
    return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat


def berechne_fussweg(graph, lon0, lat0, lon1, lat1):
    """Kürzester Fussweg im echten Strassennetz, [[lon,lat], ...]. None bei Fehler."""
    try:
        start = ox.nearest_nodes(graph, lon0, lat0)
        ziel = ox.nearest_nodes(graph, lon1, lat1)
        if start == ziel:
            return [[lon0, lat0], [lon1, lat1]]
        pfad = nx.shortest_path(graph, start, ziel, weight="length")
        return [[graph.nodes[k]["x"], graph.nodes[k]["y"]] for k in pfad]
    except (nx.NetworkXNoPath, nx.NodeNotFound) as e:
        print(f"    WARNUNG: Fussweg nicht berechenbar ({e}) — nutze Luftlinie als Fallback.")
        return None


def berechne_etappe(graph, lon0, lat0, lon1, lat1):
    """Liefert die Punktliste für eine Etappe zwischen zwei Ankern: echter
    OSMnx-Fussweg, wenn BEIDE Punkte im abgedeckten Pariser Netz liegen,
    sonst eine simple Luftlinie (siehe im_pariser_netz). Gibt (punkte,
    war_echter_fussweg) zurück."""
    if lon0 == lon1 and lat0 == lat1:
        return [[lon0, lat0], [lon1, lat1]], False
    if im_pariser_netz(lon0, lat0) and im_pariser_netz(lon1, lat1):
        pfad_pts = berechne_fussweg(graph, lon0, lat0, lon1, lat1)
        if pfad_pts:
            return pfad_pts, True
    return [[lon0, lat0], [lon1, lat1]], False


def resample_by_arclength(points, n):
    """Bringt eine Liste [lon,lat]-Punkte per Bogenlängen-Interpolation auf
    exakt n Punkte (erster/letzter bleiben erhalten). Distanzen werden lokal
    äquirechteckig approximiert (reicht für innerstädtische Distanzen)."""
    if n <= 0:
        return []
    if len(points) == 1 or n == 1:
        return [points[0]] * n if n > 1 else [points[0]]

    lat_mittel = sum(p[1] for p in points) / len(points)
    kx = 111320 * math.cos(math.radians(lat_mittel))
    ky = 110540

    def dist(p, q):
        dx = (q[0] - p[0]) * kx
        dy = (q[1] - p[1]) * ky
        return math.hypot(dx, dy)

    kumuliert = [0.0]
    for i in range(1, len(points)):
        kumuliert.append(kumuliert[-1] + dist(points[i - 1], points[i]))
    gesamt = kumuliert[-1]

    if gesamt == 0:
        return [points[0]] * n

    ergebnis = []
    for i in range(n):
        ziel_dist = gesamt * i / (n - 1)
        j = 0
        while j < len(kumuliert) - 2 and kumuliert[j + 1] < ziel_dist:
            j += 1
        seg_laenge = kumuliert[j + 1] - kumuliert[j]
        t = 0.0 if seg_laenge == 0 else (ziel_dist - kumuliert[j]) / seg_laenge
        t = max(0.0, min(1.0, t))
        lon = points[j][0] + t * (points[j + 1][0] - points[j][0])
        lat = points[j][1] + t * (points[j + 1][1] - points[j][1])
        ergebnis.append([lon, lat])
    return ergebnis


# ── category-Berechnung ─────────────────────────────────────────────────────
# Deterministische Prioritätsregel (siehe CATEGORY_LABELS in datenbereinigung.js
# für die Bedeutung: gold_dunkel="Raum & Umwelt", gold_mittel="Stimmung &
# Emotion", gold_hell="Soziales"):
#   1. "social" in tags            -> gold_hell
#   2. "mood" in tags ODER valenz != null -> gold_mittel
#   3. "space"/"location" in tags  -> gold_dunkel
#   4. sonst (move/time/Figurenname etc.) -> gold_dunkel (Default, konsistent
#      mit Kapitel 1s Praxis: reine Bewegungs-/Zeit-Annotationen sind dort
#      ebenfalls meist gold_dunkel)
def kategorie_fuer_annotation(a):
    tags = a.get("tags") or []
    if "social" in tags:
        return "gold_hell"
    if "mood" in tags or a.get("valenz") is not None:
        return "gold_mittel"
    if "space" in tags or "location" in tags:
        return "gold_dunkel"
    return "gold_dunkel"


def valenz_bucket(v):
    if v == 1:
        return "pos"
    if v == -1:
        return "neg"
    if v == 0:
        return "neutral"
    return "unrated"


def leere_bandcounts():
    return {
        "gold_dunkel": {"neg": 0, "pos": 0, "neutral": 0, "unrated": 0},
        "gold_mittel": {"neg": 0, "pos": 0, "neutral": 0, "unrated": 0},
        "gold_hell": {"neg": 0, "pos": 0, "neutral": 0, "unrated": 0},
    }


def verarbeite_kapitel(nr, letzte_koordinate_vorkapitel):
    """Baut das stationenData-Objekt für ein Kapitel. Gibt (daten,
    letzte_koordinate_dieses_kapitels) zurück — letzteres wird als Fallback
    an das nächste Kapitel weitergegeben, falls DAS gar keine Koordinaten hat."""
    pfad = os.path.join(INPUT_DIR, f"kapitel-{nr:02d}-final.json")
    with open(pfad, encoding="utf-8") as f:
        quelle = json.load(f)

    anns_roh = sorted(quelle["annotationen"], key=lambda a: a["id"])
    n = len(anns_roh)
    sammelpunkt_name = f"Unbestimmt (Kapitel {nr:02d})"

    # ── Annotationen ─────────────────────────────────────────────────────
    annotationen = []
    for idx, a in enumerate(anns_roh):
        k = a.get("koordinaten") or {}
        hat_koord = k.get("lat") is not None and k.get("lng") is not None and not ist_generischer_platzhalter(k)
        ort_bez = k.get("ort_bezeichnung")
        ort_basis = ort_bez if (hat_koord and ort_bez) else sammelpunkt_name

        re = a.get("raum_emotion")
        f_wert = re.get("richtung") if re else None

        cat = kategorie_fuer_annotation(a)

        annotationen.append({
            "id": a["id"],
            "text": a.get("text", ""),
            "tags": a.get("tags") or [],
            "valenz": a.get("valenz"),
            "intensitaet": a.get("intensitaet"),
            "category": cat,
            "ortBasis": ort_basis,
            "ort": ort_basis,
            "revealIndex": idx,
            "station": None,
            "perspektive": a.get("perspektive"),
            "hasFwert": bool(f_wert),
            "fWertType": f_wert,
            "f_wert": f_wert,
        })

    # ── ortRuns (Gruppierung nach ortBasis) ─────────────────────────────
    gruppen = {}
    for idx, a in enumerate(annotationen):
        gruppen.setdefault(a["ortBasis"], []).append(idx)

    koord_indizes = [
        i for i in range(n)
        if anns_roh[i]["koordinaten"].get("lat") is not None
        and not ist_generischer_platzhalter(anns_roh[i]["koordinaten"])
    ]

    if koord_indizes:
        # Platzhalter-Koordinate für den Sammelpunkt: die ERSTE im Kapitel
        # bekannte Koordinate (chronologisch), NICHT der Mittelpunkt der
        # Kapitel-Bbox — einige Kapitel spannen sich über Paris UND weit
        # entfernte Handlungsorte (z.B. Kapitel 8/9: Cannes/Côte d'Azur,
        # Kapitel 6/7/17: Chatou/Rouen-Ausflüge). Ein Bbox-Mittelpunkt würde
        # dort mitten in der Normandie/Provinz landen — sinnloser als der
        # erste bekannte Ort im Kapitel.
        erster_koord_idx = koord_indizes[0]
        sammelpunkt_lon = anns_roh[erster_koord_idx]["koordinaten"]["lng"]
        sammelpunkt_lat = anns_roh[erster_koord_idx]["koordinaten"]["lat"]
    elif letzte_koordinate_vorkapitel is not None:
        sammelpunkt_lon, sammelpunkt_lat = letzte_koordinate_vorkapitel
    else:
        sammelpunkt_lon, sammelpunkt_lat = BBOX_MITTE

    ortRuns = []
    for ort_basis, idxs in gruppen.items():
        idxs_sortiert = sorted(idxs)
        min_reveal = idxs_sortiert[0]
        if ort_basis == sammelpunkt_name:
            lon, lat = sammelpunkt_lon, sammelpunkt_lat
        else:
            lons = [anns_roh[i]["koordinaten"]["lng"] for i in idxs_sortiert]
            lats = [anns_roh[i]["koordinaten"]["lat"] for i in idxs_sortiert]
            lon = sum(lons) / len(lons)
            lat = sum(lats) / len(lats)

        bandCounts = leere_bandcounts()
        for i in idxs_sortiert:
            cat = annotationen[i]["category"]
            bucket = valenz_bucket(annotationen[i]["valenz"])
            bandCounts[cat][bucket] += 1

        ortRuns.append({
            "ort": ort_basis,
            "revealIndex": min_reveal,
            "lon": lon,
            "lat": lat,
            "nodeType": "location",
            "bandCounts": bandCounts,
        })
    ortRuns.sort(key=lambda r: r["revealIndex"])

    # ── routenPunkte (1 Punkt pro Annotation/revealIndex) ───────────────
    anker = [(i, anns_roh[i]["koordinaten"]["lng"], anns_roh[i]["koordinaten"]["lat"]) for i in koord_indizes]
    routenPunkte = [None] * n
    # routenPfadDetail: derselbe Weg, aber OHNE die Kompression auf
    # gap+1 Punkte pro Etappe (siehe resample_by_arclength) — bei eng
    # aufeinanderfolgenden Annotationen (die häufigste Etappenlänge ist 1,
    # also nur Start+Ziel) ginge dabei sonst die komplette Strassenform
    # verloren und der echte OSMnx-Fussweg sähe trotzdem wie eine Luftlinie
    # aus. Wird fürs genaue Zeichnen der Route im Kapitel-Zoom genutzt
    # (sketch.js, zeichneUebersichtsrouten) statt routenPunkte — die
    # 1-Punkt-pro-revealIndex-Eigenschaft von routenPunkte bleibt für
    # spätere revealIndex-Verdrahtung unangetastet.
    routenPfadDetail = []
    letzte_koordinate_dieses_kapitels = None

    if not anker:
        # Kommt bei Kapitel 04-18 nicht vor, aber sicherheitshalber abgefangen:
        # Platzhalter-Route = eine einzige Koordinate wiederholt.
        px, py = letzte_koordinate_vorkapitel or BBOX_MITTE
        routenPunkte = [[px, py]] * n
        routenPfadDetail = [[px, py]]
        letzte_koordinate_dieses_kapitels = (px, py)
        print(f"  Kapitel {nr:02d}: KEINE Koordinaten im ganzen Kapitel — Platzhalter-Route verwendet.")
    else:
        graph = lade_strassennetz()

        erster_idx, erster_lon, erster_lat = anker[0]
        for i in range(0, erster_idx + 1):
            routenPunkte[i] = [erster_lon, erster_lat]
        routenPfadDetail.append([erster_lon, erster_lat])

        erfolgreiche_etappen = 0
        ausserhalb_etappen = 0
        for k in range(len(anker) - 1):
            i0, lon0, lat0 = anker[k]
            i1, lon1, lat1 = anker[k + 1]
            luecke = i1 - i0
            if luecke <= 0:
                continue
            pfad_pts, war_echter_fussweg = berechne_etappe(graph, lon0, lat0, lon1, lat1)
            if war_echter_fussweg:
                erfolgreiche_etappen += 1
            elif not (lon0 == lon1 and lat0 == lat1) and not (im_pariser_netz(lon0, lat0) and im_pariser_netz(lon1, lat1)):
                ausserhalb_etappen += 1
            resampled = resample_by_arclength(pfad_pts, luecke + 1)
            for offset, p in enumerate(resampled):
                routenPunkte[i0 + offset] = p
            # erster Punkt von pfad_pts == letzter Punkt der vorigen Etappe
            # (beides derselbe Anker) — nicht doppelt anhängen.
            routenPfadDetail.extend(pfad_pts[1:])

        letzter_idx, letzter_lon, letzter_lat = anker[-1]
        for i in range(letzter_idx, n):
            routenPunkte[i] = [letzter_lon, letzter_lat]

        letzte_koordinate_dieses_kapitels = (letzter_lon, letzter_lat)
        print(f"  Kapitel {nr:02d}: {len(anker)} Anker-Koordinaten, {erfolgreiche_etappen}/{max(len(anker)-1,0)} "
              f"echte Fusswege berechnet, {ausserhalb_etappen} Etappen ausserhalb Pariser Netz (Luftlinie), "
              f"{len(routenPfadDetail)} Punkte in routenPfadDetail.")

    for i in range(n):
        if routenPunkte[i] is None:
            routenPunkte[i] = routenPunkte[i - 1] if i > 0 else [BBOX_MITTE[0], BBOX_MITTE[1]]

    # ── route (mind. 1 Eintrag, siehe sketch.js endStation-Fallback) ────
    letzter_ort_basis = annotationen[-1]["ortBasis"]
    letzter_ortrun = next(r for r in ortRuns if r["ort"] == letzter_ort_basis)
    route = [{
        "ort": letzter_ort_basis,
        "lon": letzter_ortrun["lon"],
        "lat": letzter_ortrun["lat"],
        "revealIndex": n - 1,
        "routeEndsHere": True,
    }]

    ausgabe = {
        "kapitel": nr,
        "route": route,
        "gedanken": [],
        "markierungen": [],
        "routenPunkte": routenPunkte,
        "routenPfadDetail": routenPfadDetail,
        "annotationen": annotationen,
        "halteorte": [],
        "zwischenPunkte": [],
        "ortRuns": ortRuns,
    }

    return ausgabe, letzte_koordinate_dieses_kapitels


# ── Verifikation ─────────────────────────────────────────────────────────
def verifiziere(nr, daten):
    fehler = []
    anns = daten["annotationen"]
    ortRunNamen = {r["ort"] for r in daten["ortRuns"]}

    waisen = [a["id"] for a in anns if a["ortBasis"] not in ortRunNamen]
    if waisen:
        fehler.append(f"Waisen-ortBasis bei id(s) {waisen}")

    reveal_werte = [a["revealIndex"] for a in anns]
    if len(daten["routenPunkte"]) != max(reveal_werte) + 1:
        fehler.append(f"len(routenPunkte)={len(daten['routenPunkte'])} != max(revealIndex)+1={max(reveal_werte) + 1}")

    if any(reveal_werte[i] >= reveal_werte[i + 1] for i in range(len(reveal_werte) - 1)):
        fehler.append("revealIndex nicht streng monoton aufsteigend")

    ort_zu_min_reveal = {}
    for a in anns:
        ort_zu_min_reveal.setdefault(a["ortBasis"], a["revealIndex"])
        ort_zu_min_reveal[a["ortBasis"]] = min(ort_zu_min_reveal[a["ortBasis"]], a["revealIndex"])
    for r in daten["ortRuns"]:
        min_ann_rv = ort_zu_min_reveal.get(r["ort"])
        if min_ann_rv is not None and r["revealIndex"] > min_ann_rv:
            fehler.append(f"ortRun '{r['ort']}' hat revealIndex {r['revealIndex']} > min. Annotations-revealIndex {min_ann_rv}")

    if not daten["route"]:
        fehler.append("route ist leer (würde sketch.js endStation-Fallback crashen lassen)")

    try:
        json.dumps(daten, ensure_ascii=False)
    except (TypeError, ValueError) as e:
        fehler.append(f"JSON nicht serialisierbar: {e}")

    return fehler


def parse_kapitel_argumente(argv):
    """Optionaler Kapitel-Filter, z.B. `python baue-kapitel-stationen.py 04 05`
    baut nur diese beiden neu (statt immer alle 17). Ohne Argumente: alle."""
    if len(argv) <= 1:
        return KAPITEL_NUMMERN
    gewuenscht = []
    for arg in argv[1:]:
        nr = int(arg)
        if nr not in KAPITEL_NUMMERN:
            print(f"WARNUNG: Kapitel {nr:02d} ist nicht in KAPITEL_NUMMERN — übersprungen.")
            continue
        gewuenscht.append(nr)
    return gewuenscht


def main():
    import sys
    kapitel_liste = parse_kapitel_argumente(sys.argv)
    report = []
    letzte_koordinate = None  # wird von Kapitel zu Kapitel weitergegeben

    for nr in kapitel_liste:
        print(f"\nVerarbeite Kapitel {nr:02d}...")
        daten, letzte_koordinate = verarbeite_kapitel(nr, letzte_koordinate)

        out_pfad = os.path.join(OUTPUT_DIR, f"kapitel{nr:02d}-stationen.json")
        with open(out_pfad, "w", encoding="utf-8") as f:
            json.dump(daten, f, ensure_ascii=False, indent=2)

        fehler = verifiziere(nr, daten)
        n_sammelpunkt = sum(1 for a in daten["annotationen"] if a["ortBasis"] == f"Unbestimmt (Kapitel {nr:02d})")

        report.append({
            "kapitel": nr,
            "n_annotationen": len(daten["annotationen"]),
            "n_ortRuns": len(daten["ortRuns"]),
            "n_sammelpunkt": n_sammelpunkt,
            "fehler": fehler,
            "pfad": out_pfad,
        })

        status = "OK" if not fehler else "FEHLER: " + "; ".join(fehler)
        print(f"  -> {out_pfad}")
        print(f"  Annotationen: {len(daten['annotationen'])}, ortRuns: {len(daten['ortRuns'])}, "
              f"im Sammelpunkt: {n_sammelpunkt}, Verifikation: {status}")

    print("\n" + "=" * 70)
    print("REPORT")
    print("=" * 70)
    for r in report:
        status = "OK" if not r["fehler"] else "FEHLER: " + "; ".join(r["fehler"])
        print(f"Kapitel {r['kapitel']:02d}: {r['n_annotationen']:4d} Annotationen, "
              f"{r['n_ortRuns']:3d} ortRuns, {r['n_sammelpunkt']:4d} im Sammelpunkt -> {status}")


if __name__ == "__main__":
    main()
