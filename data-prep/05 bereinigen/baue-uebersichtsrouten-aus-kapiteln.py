"""
baue-uebersichtsrouten-aus-kapiteln.py
======================================
Die Gefühlte Stadt — Bel-Ami
Baut die Routenlinien der Überblickseite ("Alle Routen") aus den fertigen
Kapiteldaten.

Warum dieses Skript baue-uebersichtsrouten.py ersetzt:
Jenes Skript baute eigene OSMnx-Routen aus "04 geojson.geojson/kapitel-XX.geojson",
also aus den ROHEN, automatisch geocodierten Annotationen. Seit die Kapitel
handkuriert sind (siehe baue-sammelpunkte-handkuriert.py) beschreiben diese
GeoJSONs nicht mehr denselben Weg wie die Kapitel selbst: Sammelpunkte wurden
zusammengelegt, Erinnerungen/Wünsche zu dem Ort gezogen, an dem sie gedacht
werden, ferne Orte an ihren Abfahrts-Gare gebunden. Die Übersichtslinien
liefen dadurch teils Kilometer neben der Kapitelroute (Kapitel 17: 16.5 km
Abweichung am Start).

Die Kapitel-JSONs enthalten die echte, kuratierte Route bereits fertig in
"routenPfadDetail" — genau die Linie, die die Kapitelansicht zeichnet (siehe
zeichneUebersichtsrouten/draw in sketch.js). Dieses Skript kopiert sie
unverändert heraus, statt sie ein zweites Mal zu berechnen. Übersichts- und
Kapitelroute sind dadurch per Konstruktion identisch und können nicht mehr
auseinanderlaufen; OSMnx/Overpass wird nicht gebraucht.

Input:  ../../kapitelXX-stationen.json  (Kapitel 02–18)
Output: ../../kapitel-routen-uebersicht.json
        { "02": [[lon,lat], ...], "03": [...], ... }
"""

import json
import os

SKRIPT_ORDNER = os.path.dirname(os.path.abspath(__file__))
APP_ORDNER = os.path.dirname(os.path.dirname(SKRIPT_ORDNER))
AUSGABE = os.path.join(APP_ORDNER, "kapitel-routen-uebersicht.json")

KAPITEL_NUMMERN = [f"{n:02d}" for n in range(2, 19)]  # 01 hat seine eigene Route


def lade_route(nr):
    """routenPfadDetail eines Kapitels — die Linie, die auch die
    Kapitelansicht zeichnet. Fällt auf routenPunkte zurück, falls ein
    Kapitel (noch) keinen Detailpfad hat."""
    pfad = os.path.join(APP_ORDNER, f"kapitel{nr}-stationen.json")
    with open(pfad, encoding="utf-8") as f:
        daten = json.load(f)
    punkte = daten.get("routenPfadDetail") or daten.get("routenPunkte") or []
    # Auf [lon, lat] normalisieren (beide Schreibweisen kommen in den
    # Kapiteldaten vor, je nachdem welches Skript sie gebaut hat).
    return [[p[0], p[1]] if isinstance(p, (list, tuple)) else [p["lon"], p["lat"]]
            for p in punkte]


def main():
    routen = {}
    print("Übersichtsrouten aus den Kapiteldaten bauen")
    print("─" * 60)
    for nr in KAPITEL_NUMMERN:
        punkte = lade_route(nr)
        if not punkte:
            print(f"  Kapitel {nr}: KEINE Route gefunden — übersprungen")
            continue
        routen[nr] = punkte
        hinweis = "  (Einzelort, keine Linie)" if len(punkte) < 2 else ""
        print(f"  Kapitel {nr}: {len(punkte):5d} Punkte{hinweis}")

    with open(AUSGABE, "w", encoding="utf-8") as f:
        json.dump(routen, f, ensure_ascii=False, separators=(",", ":"))

    gesamt = sum(len(p) for p in routen.values())
    print("─" * 60)
    print(f"{len(routen)} Kapitel, {gesamt} Punkte -> {AUSGABE}")


if __name__ == "__main__":
    main()
