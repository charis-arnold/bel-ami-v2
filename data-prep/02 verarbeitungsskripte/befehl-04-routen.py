"""
befehl-04-routen.py
=====================
Die Gefühlte Stadt — Bel-Ami
Befehl 4: Echte Strassenrouten via OSMnx

Input:  04 output/kapitel-XX-final.json
Output: 04 output/kapitel-XX-final.json (ergänzt um "route" pro move-Strecke)

Berechnet für jede Etappe zwischen zwei aufeinanderfolgenden move-Annotationen
den kürzesten Weg im echten Pariser Strassennetz (heutiges OSM-Netz) und speichert
die Route als Liste von [lng, lat]-Koordinaten direkt in der ersten Annotation
der jeweiligen Etappe (Feld "route").

Hinweis: Verwendet das AKTUELLE Strassennetz von Paris, nicht den Stand von 1878.
Für die grossen Boulevards (Haussmann-Ära) ist das in der Regel unproblematisch.

Voraussetzungen:
    pip install osmnx networkx --break-system-packages

Verwendung:
    python befehl-04-routen.py              → alle vorhandenen *-final.json
    python befehl-04-routen.py 01            → nur Kapitel 01
    python befehl-04-routen.py 02 03 04      → Kapitel 02 bis 04
"""

import json
import math
import os
import sys

import networkx as nx
import osmnx as ox
import pandas as pd

# ── Pfade ──────────────────────────────────────────────────────────────────────
# ⚠ FIX: Pfade werden relativ zum Speicherort DIESES Skripts aufgelöst.
# Dieses Skript liegt in "data-prep/02 verarbeitungsskripte/". Eine Ebene
# höher liegt "data-prep" selbst — dort liegt "03 output". Der OSMnx-Cache
# bleibt ebenfalls innerhalb von data-prep (reines Verarbeitungs-Nebenprodukt,
# gehört nicht an den Root).

SKRIPT_ORDNER  = os.path.dirname(os.path.abspath(__file__))   # .../data-prep/02 verarbeitungsskripte
DATA_PREP_ORDNER = os.path.dirname(SKRIPT_ORDNER)              # .../data-prep

INPUT_DIR  = os.path.join(DATA_PREP_ORDNER, "03 output")
OUTPUT_DIR = os.path.join(DATA_PREP_ORDNER, "03 output")

# Strassennetz wird einmal pro Lauf geladen und gecacht
ox.settings.use_cache = True
ox.settings.cache_folder = os.path.join(DATA_PREP_ORDNER, "cache")

GRAPH = None  # global, wird beim ersten Bedarf geladen

# ── Hilfsfunktionen ────────────────────────────────────────────────────────────

def parse_kapitel_argumente(argv: list) -> list:
    """Wandelt Kommandozeilen-Argumente in Dateinamen um. Akzeptiert 1, 01, 7, 07."""
    if len(argv) <= 1:
        return None

    nummern = []
    for arg in argv[1:]:
        try:
            nummern.append(int(arg))
        except ValueError:
            print(f"WARNUNG: Argument '{arg}' ist keine gültige Kapitelnummer — übersprungen.")

    return [f"kapitel-{n:02d}-final.json" for n in nummern]


def lade_strassennetz():
    """Lädt das Pariser Strassennetz (zentraler Bereich, fussgängerfreundlich)."""
    global GRAPH
    if GRAPH is not None:
        return GRAPH

    print("Lade Pariser Strassennetz via OSMnx (kann beim ersten Mal etwas dauern)...")
    # Bounding Box grosszügig um die bekannten Kapitel-1-Koordinaten
    GRAPH = ox.graph_from_place("Paris, France", network_type="walk", simplify=True)
    print(f"  Strassennetz geladen: {len(GRAPH.nodes)} Knoten, {len(GRAPH.edges)} Kanten")
    return GRAPH


def berechne_route(graph, start_lat, start_lng, ziel_lat, ziel_lng):
    """Berechnet kürzesten Weg im Strassennetz, gibt Liste von [lng, lat] zurück."""
    try:
        start_knoten = ox.nearest_nodes(graph, start_lng, start_lat)
        ziel_knoten  = ox.nearest_nodes(graph, ziel_lng, ziel_lat)

        pfad = nx.shortest_path(graph, start_knoten, ziel_knoten, weight="length")

        route = [[graph.nodes[k]["x"], graph.nodes[k]["y"]] for k in pfad]
        return route
    except (nx.NetworkXNoPath, nx.NodeNotFound) as e:
        print(f"    ⚠ Route nicht berechenbar: {e}")
        return None


def finde_move_annotationen(annotationen: list) -> list:
    """Findet alle Annotationen mit Tag 'move' und gültigen Koordinaten, sortiert nach id."""
    move_anns = [
        a for a in annotationen
        if "move" in a.get("tags", [])
        and a.get("koordinaten", {}).get("lat")
        and a.get("koordinaten", {}).get("lng")
    ]
    return sorted(move_anns, key=lambda a: a.get("id", 0))


# POI-Labels (Strassen/Plätze/Bahnhöfe/Kirchen/Parks/Denkmäler) im Bounding
# Box der Kapitel-Route — siehe Aufruf in berechne_routen_fuer_kapitel().
POI_TAGS = {
    "highway": ["primary", "secondary", "tertiary"],
    "place": ["square"],
    "railway": ["station"],
    "amenity": ["place_of_worship"],
    "leisure": ["park"],
    "historic": ["monument"],
}

WICHTIGKEIT_RANG = {
    "primary": 3, "secondary": 2, "tertiary": 1,
}

# Kontingent pro Typ statt eines einzigen globalen Top-N-Rankings: in einer
# dichten Innenstadt-Bbox (siehe Kapitel-1-Testlauf: 284 Strassen, aber auch
# 29 Bahnhöfe + 25 Kirchen) würden Bahnhof/Kirche (feste wichtigkeit=4) jede
# Strasse (wichtigkeit max. 3) aus einem globalen Top 15 verdrängen — mit
# eigenem Kontingent pro Typ ist jede Kategorie garantiert vertreten.
TYP_QUOTEN = {
    "strasse": 6, "bahnhof": 3, "kirche": 3, "platz": 2, "park": 1, "denkmal": 1,
}


def berechne_winkel(geometry):
    """Winkel (Grad, mathematische Konvention: 0° = Ost/rechts, wächst gegen
    den Uhrzeigersinn) der Hauptachse einer Linien-Geometrie, aus erstem und
    letztem Punkt (bei MultiLineString: des längsten Teilstücks). None für
    alles ohne Linien-Geometrie (Punkte/Polygone — Bahnhöfe, Kirchen, Parks,
    Denkmäler haben keine sinnvolle "Laufrichtung"). Nur für Strassen
    gedacht, siehe Aufrufer/Frontend (zeichnePoiLabels in sketch.js)."""
    if geometry.geom_type == "LineString":
        koordinaten = list(geometry.coords)
    elif geometry.geom_type == "MultiLineString":
        laengstes_teilstueck = max(geometry.geoms, key=lambda g: g.length)
        koordinaten = list(laengstes_teilstueck.coords)
    else:
        return None
    if len(koordinaten) < 2:
        return None
    (x0, y0), (x1, y1) = koordinaten[0], koordinaten[-1]
    return math.degrees(math.atan2(y1 - y0, x1 - x0))


def hole_poi_labels(north, south, east, west, typ_quoten=None):
    """Holt benannte Straßen/Plätze/Bahnhöfe/Kirchen/Parks/Denkmäler im Bounding Box,
    mit eigenem Kontingent pro Typ (typ_quoten, Default TYP_QUOTEN)."""
    if typ_quoten is None:
        typ_quoten = TYP_QUOTEN

    gdf = ox.features_from_bbox(bbox=(west, south, east, north), tags=POI_TAGS)
    gdf = gdf[gdf["name"].notna()].copy()

    gdf["wichtigkeit"] = gdf.get("highway", pd.Series(dtype=str)).map(WICHTIGKEIT_RANG).fillna(0)
    gdf.loc[gdf.get("place") == "square", "wichtigkeit"] = 3
    gdf.loc[gdf.get("railway") == "station", "wichtigkeit"] = 4
    gdf.loc[gdf.get("amenity") == "place_of_worship", "wichtigkeit"] = 4
    gdf.loc[gdf.get("leisure") == "park", "wichtigkeit"] = 2
    gdf.loc[gdf.get("historic") == "monument", "wichtigkeit"] = 3

    def typ_bestimmen(row):
        if row.get("railway") == "station": return "bahnhof"
        if row.get("amenity") == "place_of_worship": return "kirche"
        if row.get("place") == "square": return "platz"
        if row.get("leisure") == "park": return "park"
        if row.get("historic") == "monument": return "denkmal"
        return "strasse"

    gdf["typ"] = gdf.apply(typ_bestimmen, axis=1)
    gdf = gdf.sort_values("wichtigkeit", ascending=False).drop_duplicates(subset="name")
    gdf["winkel"] = gdf.geometry.apply(berechne_winkel)
    gdf["lon"] = gdf.geometry.centroid.x
    gdf["lat"] = gdf.geometry.centroid.y

    ausgewaehlt = pd.concat([
        gruppe.head(typ_quoten.get(typ, 0))
        for typ, gruppe in gdf.groupby("typ")
    ]).sort_values("wichtigkeit", ascending=False)

    records = ausgewaehlt[["name", "typ", "lat", "lon", "wichtigkeit", "winkel"]].to_dict("records")
    # gdf["winkel"] wurde beim Erzeugen (None + float gemischt) intern zu
    # float64 mit NaN statt None hochgestuft (Standard-pandas-Verhalten) —
    # json.dump würde NaN als ungültiges "NaN"-Literal schreiben, das
    # JS' JSON.parse (und damit p5s loadJSON) zum Absturz bringt. Deshalb
    # hier explizit zurück auf None (-> JSON null).
    for r in records:
        if isinstance(r["winkel"], float) and math.isnan(r["winkel"]):
            r["winkel"] = None
    return records


def berechne_routen_fuer_kapitel(daten: dict) -> dict:
    """Berechnet für jede Etappe zwischen move-Annotationen die echte Strassenroute."""
    annotationen = daten["annotationen"]
    move_anns = finde_move_annotationen(annotationen)

    if len(move_anns) < 2:
        print("  Weniger als 2 move-Annotationen mit Koordinaten — keine Routen berechenbar.")
        return daten

    graph = lade_strassennetz()

    print(f"  {len(move_anns)} move-Etappen gefunden, berechne {len(move_anns) - 1} Routen...")

    erfolgreiche_routen = 0
    for i in range(len(move_anns) - 1):
        start = move_anns[i]
        ziel  = move_anns[i + 1]

        sk = start["koordinaten"]
        zk = ziel["koordinaten"]

        print(f"    {sk.get('ort_bezeichnung','?')} → {zk.get('ort_bezeichnung','?')}")

        route = berechne_route(graph, sk["lat"], sk["lng"], zk["lat"], zk["lng"])

        if route:
            # Route wird in der Start-Annotation der Etappe gespeichert
            start["route"] = route
            erfolgreiche_routen += 1

    print(f"  ✓ {erfolgreiche_routen} von {len(move_anns) - 1} Routen erfolgreich berechnet")

    # POI-Labels im Bounding Box der move-Koordinaten (+ Puffer, gleiches
    # Prinzip wie die Kartenausschnitt-Bboxen in rendere-kapitel-karten.py) —
    # north/south/east/west existieren in dieser Datei sonst nirgends.
    lats = [a["koordinaten"]["lat"] for a in move_anns]
    lngs = [a["koordinaten"]["lng"] for a in move_anns]
    puffer = 0.003
    north, south = max(lats) + puffer, min(lats) - puffer
    east, west = max(lngs) + puffer, min(lngs) - puffer
    daten["poi_labels"] = hole_poi_labels(north, south, east, west)

    daten["annotationen"] = annotationen
    return daten

# ── Hauptprogramm ──────────────────────────────────────────────────────────────

def main():

    alle_dateien = sorted([
        f for f in os.listdir(INPUT_DIR)
        if f.endswith("-final.json")
    ])

    if not alle_dateien:
        print(f"FEHLER: Keine *-final.json Dateien in '{INPUT_DIR}' gefunden.")
        print("Zuerst Befehl 3 ausführen: python befehl-03-geocodieren.py")
        sys.exit(1)

    ziel_dateien = parse_kapitel_argumente(sys.argv)

    if ziel_dateien is not None:
        dateien = [d for d in ziel_dateien if d in alle_dateien]
        nicht_gefunden = [d for d in ziel_dateien if d not in alle_dateien]
        for d in nicht_gefunden:
            print(f"WARNUNG: '{d}' nicht gefunden — übersprungen.")
        if not dateien:
            print("FEHLER: Keine der angegebenen Kapitel-Dateien gefunden.")
            sys.exit(1)
    else:
        dateien = alle_dateien

    kapitel_nummern = [int(d.split("-")[1]) for d in dateien]

    print(f"\nDie Gefühlte Stadt — Befehl 4: Echte Strassenrouten (OSMnx)")
    print(f"{'─' * 50}")
    print(f"Kapitel:  {kapitel_nummern}")
    print(f"Quelle:   OpenStreetMap (aktuelles Strassennetz)")
    print(f"{'─' * 50}\n")

    for datei in dateien:
        pfad       = os.path.join(INPUT_DIR, datei)
        kapitel_nr = int(datei.split("-")[1])

        print(f"Verarbeite: {datei}")
        with open(pfad, encoding="utf-8") as f:
            daten = json.load(f)

        daten = berechne_routen_fuer_kapitel(daten)

        with open(pfad, "w", encoding="utf-8") as f:
            json.dump(daten, f, ensure_ascii=False, indent=2)

        print(f"  → Gespeichert: {pfad}\n")

    print(f"{'─' * 50}")
    print(f"Abgeschlossen.")
    print(f"\nNächster Schritt: python belami-pipeline.py")
    print(f"(GeoJSON-Export berücksichtigt die neuen Routen automatisch)")


if __name__ == "__main__":
    main()
