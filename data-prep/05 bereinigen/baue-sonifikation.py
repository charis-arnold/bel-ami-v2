"""
baue-sonifikation.py
=====================
Die Gefühlte Stadt — Bel-Ami — Sonifikation (Strudel, Erstentwurf)

Siehe Sonifikation-Brief-fuer-Claude-Code.md. Berechnet pro Station (das
Feld annotationen[].station in kapitel01-stationen.json, Werte 0–5 — die 6
"Halte" entlang der Kapitel-1-Route) die Aggregate, die das Strudel-Pattern
im Frontend braucht:

    - anzahlAnnotationen: treibt im Erstentwurf das Wachstum direkt (Anzahl
      = "Kreisgrösse", siehe kreisRadius() im bestehenden p5-Sketch — dieselbe
      Metrik, damit Ton und Bild nach demselben Prinzip wachsen).
    - summeIntensitaet: für eine spätere Iteration (Lautstärke-/Filter-
      Modulation zusätzlich zur Dichte), hier nur mitberechnet, NICHT
      Bestandteil des Wachstums im Erstentwurf.
    - fWertAnteile: Anzahl Annotationen je F-Wert-Kategorie an dieser
      Station (ort_loest_emotion_aus / emotion_faerbt_raum /
      koerper_als_sensor / keine) — Grundlage für die drei konstanten
      Instrumenten-Layer (siehe Brief, Saint-Saëns-Stilrichtung).
    - valenzVerteilung: neg/pos/neutral/unrated-Zählung (gleiche Bucket-
      Logik wie sonst im Projekt, siehe valenzBucket() in datenbereinigung.js
      bzw. valenz_bucket() in baue-kapitel-stationen.py) — nicht Teil des
      Erstentwurf-Wachstums, aber naheliegend für eine spätere Tonhöhen-
      /Modalitäts-Zuordnung (siehe Mapping-Tabelle im Brief).
    - ort: repräsentativer Ortsname der Station (häufigster ortBasis-Wert
      unter den Annotationen dieser Station) — nur zur besseren Lesbarkeit
      der Ausgabedatei, keine funktionale Rolle im Sound-Mapping.
    - revealIndexMin/Max: Spanne dieser Station innerhalb von
      stationenData.routenPunkte/annotationen — Grundlage für die
      zeitbasierte Play-Engine (sonifikation.js), um Audio- und
      Karten-Animation exakt synchron zu halten.
    - wegstreckeVorherM: Gehstrecke (Meter, aus routenPunkte aufsummiert)
      vom Ende der VORHERIGEN Station bis zum Anfang dieser Station (die
      "Transit"-Etappe dazwischen).
    - wegstreckeEigenM: Gehstrecke (Meter) INNERHALB der eigenen
      revealIndex-Spanne dieser Station (eigenes Umherlaufen/Verweilen).

  Beide Streckenwerte sind reine Fakten (Meter) — die eigentliche
  Gewichtung/Tempo-Formel (wie stark Strecke vs. Annotationsdichte die
  Dauer eines Abschnitts im Musikstück bestimmt) ist eine gestalterische
  Entscheidung und lebt bewusst in sonifikation.js, nicht hier (Python
  bleibt für Daten/QA zuständig, siehe Brief-Arbeitsweise).

WICHTIG (Arbeitsweise-Vorgabe aus dem Brief): eigene Pipeline-Stufe, rührt
kapitel01-stationen.json NICHT an — reine Ableitung, landet in einer
separaten Ausgabedatei.

Annotationen ausserhalb 0–5 (station ist null oder >=100 — letzteres
scheint eine andere Zählung zu sein, z.B. Gedanken-Spalte) fliessen hier
NICHT ein; siehe Report am Skriptende für die genaue Anzahl.

Input:  <projekt-root>/kapitel01-stationen.json
Output: <projekt-root>/kapitel01-sonifikation.json
"""

import json
import math
import os
from collections import Counter

SKRIPT_ORDNER = os.path.dirname(os.path.abspath(__file__))
DATA_PREP_ORDNER = os.path.dirname(SKRIPT_ORDNER)
PROJEKT_ROOT = os.path.dirname(DATA_PREP_ORDNER)

STATIONEN_NUMMERN = list(range(6))  # 0..5, siehe Moduldocstring

F_WERT_KATEGORIEN = ["ort_loest_emotion_aus", "emotion_faerbt_raum", "koerper_als_sensor"]


def valenz_bucket(v):
    if v == 1:
        return "pos"
    if v == -1:
        return "neg"
    if v == 0:
        return "neutral"
    return "unrated"


def leere_fwert_anteile():
    return {k: 0 for k in F_WERT_KATEGORIEN + ["keine"]}


def leere_valenz_verteilung():
    return {"neg": 0, "pos": 0, "neutral": 0, "unrated": 0}


# Lokale, äquirechteckige Distanz-Approximation — dieselbe Herleitung wie
# resample_by_arclength() in baue-kapitel-stationen.py (für innerstädtische
# Distanzen ausreichend genau, kein globales GIS nötig).
def strecke_m(punkte, von_idx, bis_idx, kx, ky):
    total = 0.0
    von_idx = max(0, von_idx)
    bis_idx = min(len(punkte) - 1, bis_idx)
    for i in range(von_idx, bis_idx):
        dx = (punkte[i + 1][0] - punkte[i][0]) * kx
        dy = (punkte[i + 1][1] - punkte[i][1]) * ky
        total += math.hypot(dx, dy)
    return total


def main():
    quelle_pfad = os.path.join(PROJEKT_ROOT, "kapitel01-stationen.json")
    with open(quelle_pfad, encoding="utf-8") as f:
        daten = json.load(f)

    annotationen = daten["annotationen"]
    routen_punkte = daten["routenPunkte"]

    lat_mittel = sum(p[1] for p in routen_punkte) / len(routen_punkte)
    kx = 111_320 * math.cos(math.radians(lat_mittel))
    ky = 110_540

    # Revealindex-Spannen zuerst für ALLE Stationen bestimmen (werden für
    # die Wegstrecken-Berechnung schon vom jeweiligen Vorgänger gebraucht).
    spannen = {}
    for s in STATIONEN_NUMMERN:
        indizes = [a["revealIndex"] for a in annotationen if a.get("station") == s]
        spannen[s] = (min(indizes), max(indizes)) if indizes else None

    stationen = []
    fehlend = 0
    ausserhalb = 0
    letztes_bis = 0
    for s in STATIONEN_NUMMERN:
        gruppe = [a for a in annotationen if a.get("station") == s]

        fwert_anteile = leere_fwert_anteile()
        valenz_verteilung = leere_valenz_verteilung()
        summe_intensitaet = 0
        for a in gruppe:
            fwert = a.get("fWertType") if a.get("hasFwert") else None
            fwert_anteile[fwert if fwert in F_WERT_KATEGORIEN else "keine"] += 1
            valenz_verteilung[valenz_bucket(a.get("valenz"))] += 1
            summe_intensitaet += a.get("intensitaet") or 0

        orte = Counter(a.get("ortBasis") or a.get("ort") or "" for a in gruppe)
        ort = orte.most_common(1)[0][0] if orte else None

        span = spannen[s]
        von, bis = span if span else (letztes_bis, letztes_bis)
        wegstrecke_vorher_m = round(strecke_m(routen_punkte, letztes_bis, von, kx, ky), 1)
        wegstrecke_eigen_m = round(strecke_m(routen_punkte, von, bis, kx, ky), 1)
        letztes_bis = bis

        stationen.append({
            "station": s,
            "revealIndexMin": von,
            "revealIndexMax": bis,
            "wegstreckeVorherM": wegstrecke_vorher_m,
            "wegstreckeEigenM": wegstrecke_eigen_m,
            "ort": ort,
            "anzahlAnnotationen": len(gruppe),
            "summeIntensitaet": summe_intensitaet,
            "fWertAnteile": fwert_anteile,
            "valenzVerteilung": valenz_verteilung,
        })

    for a in annotationen:
        st = a.get("station")
        if st is None:
            fehlend += 1
        elif st not in STATIONEN_NUMMERN:
            ausserhalb += 1

    ausgabe = {
        "kapitel": 1,
        "wachstumsMetrik": "anzahlAnnotationen",
        "stationen": stationen,
    }

    ziel_pfad = os.path.join(PROJEKT_ROOT, "kapitel01-sonifikation.json")
    with open(ziel_pfad, "w", encoding="utf-8") as f:
        json.dump(ausgabe, f, ensure_ascii=False, indent=2)

    print(f"-> {ziel_pfad}\n")
    print("REPORT")
    print("=" * 70)
    for s in stationen:
        print(f"Station {s['station']} ({s['ort']}): "
              f"{s['anzahlAnnotationen']:3d} Annotationen, "
              f"Intensität-Summe {s['summeIntensitaet']:3d}, "
              f"Wegstrecke davor {s['wegstreckeVorherM']:6.1f}m, "
              f"eigene Strecke {s['wegstreckeEigenM']:6.1f}m, "
              f"F-Wert-Anteile {s['fWertAnteile']}, "
              f"Valenz {s['valenzVerteilung']}")
    print(f"\nAnnotationen ohne station-Feld (null): {fehlend}")
    print(f"Annotationen mit station ausserhalb 0–5 (z.B. Gedanken-Spalte, >=100): {ausserhalb}")


if __name__ == "__main__":
    main()
