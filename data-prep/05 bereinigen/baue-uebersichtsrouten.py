"""
baue-uebersichtsrouten.py
=====================
Die Gefühlte Stadt — Bel-Ami
Baut echte Strassenrouten (OSMnx) für die grosse Übersichtskarte (alle Kapitel).

Warum ein eigenes Skript statt befehl-04-routen.py direkt zu nutzen:
befehl-04-routen.py liest Koordinaten aus "03 output/kapitel-XX-final.json" —
dort sind bei den meisten Kapiteln viele "move"-Annotationen noch nicht
geocodiert (koordinaten.lat/lng = null). Die GeoJSONs in
"04 geojson.geojson/kapitel-XX.geojson" haben dagegen für ALLE Kapitel
vollständige Geometrie (auch für alle move-Features) — dieses Skript nutzt
deshalb die GeoJSONs als Koordinatenquelle, nicht die final.json-Dateien.

Input:  ../04 geojson.geojson/kapitel-XX.geojson  (Kapitel 02–18)
Output: uebersichtsrouten.json — { "02": [[lon,lat],...], "03": [...], ... }
        (eine flache Liste echter Strassenpunkte pro Kapitel, analog zu
        kapitel01-stationen.json's "routenPunkte", nur ohne Stationen/
        Annotationen — reicht für die Linien auf der Übersichtskarte)

Voraussetzung: pip install osmnx networkx (bereits vorhanden, siehe
befehl-04-routen.py)
"""

import json
import os

import networkx as nx
import osmnx as ox

SKRIPT_ORDNER = os.path.dirname(os.path.abspath(__file__))          # .../data-prep/05 bereinigen
DATA_PREP_ORDNER = os.path.dirname(SKRIPT_ORDNER)                    # .../data-prep
GEOJSON_DIR = os.path.join(DATA_PREP_ORDNER, "04 geojson.geojson")
OUTPUT_PFAD = os.path.join(SKRIPT_ORDNER, "uebersichtsrouten.json")

ox.settings.use_cache = True
ox.settings.cache_folder = os.path.join(DATA_PREP_ORDNER, "cache")

KAPITEL_NUMMERN = [f"{n:02d}" for n in range(2, 19)]  # 02 .. 18 (01 existiert schon separat)

GRAPH = None


def lade_strassennetz():
    global GRAPH
    if GRAPH is not None:
        return GRAPH
    print("Lade Pariser Strassennetz via OSMnx (einmalig, kann etwas dauern)...")
    GRAPH = ox.graph_from_place("Paris, France", network_type="walk", simplify=True)
    print(f"  Strassennetz geladen: {len(GRAPH.nodes)} Knoten, {len(GRAPH.edges)} Kanten")
    return GRAPH


def berechne_route(graph, start_lon, start_lat, ziel_lon, ziel_lat):
    try:
        start_knoten = ox.nearest_nodes(graph, start_lon, start_lat)
        ziel_knoten = ox.nearest_nodes(graph, ziel_lon, ziel_lat)
        if start_knoten == ziel_knoten:
            return []
        pfad = nx.shortest_path(graph, start_knoten, ziel_knoten, weight="length")
        return [[graph.nodes[k]["x"], graph.nodes[k]["y"]] for k in pfad]
    except (nx.NetworkXNoPath, nx.NodeNotFound) as e:
        print(f"    ⚠ Route nicht berechenbar: {e}")
        return None


def lade_move_punkte(kapitel_nr):
    pfad = os.path.join(GEOJSON_DIR, f"kapitel-{kapitel_nr}.geojson")
    with open(pfad, encoding="utf-8") as f:
        gj = json.load(f)

    move_feats = [
        f for f in gj["features"]
        if "move" in (f.get("properties", {}).get("tags") or [])
        and f.get("geometry", {}).get("coordinates")
        and None not in f["geometry"]["coordinates"]
    ]
    move_feats.sort(key=lambda f: f["properties"].get("id", 0))
    return [f["geometry"]["coordinates"] for f in move_feats]  # [[lon,lat], ...]


def baue_route_fuer_kapitel(graph, kapitel_nr):
    punkte = lade_move_punkte(kapitel_nr)
    if len(punkte) < 2:
        print(f"  Kapitel {kapitel_nr}: weniger als 2 move-Punkte mit Koordinate — überspringe.")
        return []

    print(f"  Kapitel {kapitel_nr}: {len(punkte)} move-Punkte, berechne {len(punkte) - 1} Etappen...")

    routen_punkte = []
    letzter_lon, letzter_lat = None, None
    erfolge = 0
    for i in range(len(punkte) - 1):
        (lon0, lat0), (lon1, lat1) = punkte[i], punkte[i + 1]
        etappe = berechne_route(graph, lon0, lat0, lon1, lat1)
        if etappe is None:
            continue
        erfolge += 1
        for p in etappe:
            if p[0] == letzter_lon and p[1] == letzter_lat:
                continue
            routen_punkte.append(p)
            letzter_lon, letzter_lat = p[0], p[1]

    print(f"    ✓ {erfolge}/{len(punkte) - 1} Etappen erfolgreich, {len(routen_punkte)} Routenpunkte gesamt")
    return routen_punkte


def main():
    graph = lade_strassennetz()
    ergebnis = {}
    for nr in KAPITEL_NUMMERN:
        print(f"\nKapitel {nr}:")
        ergebnis[nr] = baue_route_fuer_kapitel(graph, nr)

    with open(OUTPUT_PFAD, "w", encoding="utf-8") as f:
        json.dump(ergebnis, f, ensure_ascii=False, indent=2)

    print(f"\nFertig. Gespeichert: {OUTPUT_PFAD}")
    for nr in KAPITEL_NUMMERN:
        print(f"  Kapitel {nr}: {len(ergebnis[nr])} Punkte")


if __name__ == "__main__":
    main()
