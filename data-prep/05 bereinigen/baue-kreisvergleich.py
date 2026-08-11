"""
baue-kreisvergleich.py
=====================
Die Gefühlte Stadt — Bel-Ami

Baut kreisvergleich-orte.json: für 8 handverlesene, kapitelübergreifend
wiederkehrende Orte wird pro Kapitel die (summierte) bandCounts-Verteilung
aus den ortRuns aller 18 Kapitel-Stationen-Dateien extrahiert. Grundlage für
den neuen Scroll-Akt "Kreisvergleich" (sketch.js, nach der Übersichtsrouten-
Karte): pro Ort ein Kreisdiagramm, das mit jedem erreichten Kapitel um dessen
Beitrag wächst — so wird sichtbar, wie sich ein einzelner Ort über die ganze
Handlung hinweg entwickelt (Gegenstück zu den Kapitel-eigenen Kreisen, die
nur innerhalb eines Kapitels wachsen).

Auswahl der 8 Orte und Zuordnungsregeln (Substring-Match auf den
normalisierten ort-Namen, NICHT auf exakte Gleichheit — die Rohdaten
enthalten Schreibvarianten wie "Rue Constantinople"/"Rue de Constantinople"
oder "Folies Bergère"/"Folies-Bergère"):

    Rue Constantinople                  — "rue constantinople"
    Rue Notre-Dame de Lorette            — "rue notredame de lorette"
                                           (NUR die Strasse selbst, nicht die
                                           "Lokal/Strasse nahe ..."-Varianten)
    Boulevard des Italiens/Capucines     — "boulevard des italiens" ODER
                                           "boulevard des capucines"
                                           (dieselbe grosse Boulevard-Achse,
                                           bewusst zusammengefasst)
    Parc Monceau                         — "parc monceau"
    Boulevard Malesherbes                — "boulevard malesherbes"
    Folies Bergère                       — "folies bergere" (Bindestrich
                                           ignoriert, siehe normalize())
    Place de la Madeleine                — "place la madeleine" ODER
                                           "eglise la madeleine" (Kirche und
                                           Platz derselben Örtlichkeit)
    Redaktion                            — "redaktion"

Input:  <projekt-root>/kapitelXX-stationen.json (XX = 01..18)
Output: <projekt-root>/kreisvergleich-orte.json
"""

import json
import os
import re
import unicodedata

SKRIPT_ORDNER = os.path.dirname(os.path.abspath(__file__))
DATA_PREP_ORDNER = os.path.dirname(SKRIPT_ORDNER)
PROJEKT_ROOT = os.path.dirname(DATA_PREP_ORDNER)

KAPITEL_NUMMERN = [f"{i:02d}" for i in range(1, 19)]


def normalisiere(ort: str) -> str:
    n = ort.lower().strip()
    n = re.sub(r",?\s*paris$", "", n)
    n = n.replace("-", " ")
    # Akzente entfernen (é/è/ê -> e, etc.) — die Suchmuster unten sind
    # bewusst akzentfrei geschrieben, damit ein Tippfehler/eine fehlende
    # Akzent-Variante in den Rohdaten nicht zu einem stillen Nicht-Treffer
    # führt (genau das ist beim ersten Versuch mit "Folies Bergère" und
    # "Place de la Madeleine" passiert).
    n = "".join(c for c in unicodedata.normalize("NFKD", n) if not unicodedata.combining(c))
    n = re.sub(r"[^a-z0-9 ]", "", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


# Reihenfolge hier = spätere Anzeige-Reihenfolge im Kreisvergleich-Raster.
ORTE_DEFINITIONEN = [
    ("Rue Constantinople", ["rue constantinople"]),
    ("Rue Notre-Dame de Lorette", ["rue notre dame de lorette"]),
    ("Boulevard des Italiens/Capucines", ["boulevard des italiens", "boulevard des capucines"]),
    ("Parc Monceau", ["parc monceau"]),
    ("Boulevard Malesherbes", ["boulevard malesherbes"]),
    ("Folies Bergère", ["folies bergere"]),
    ("Place de la Madeleine", ["place de la madeleine", "eglise de la madeleine", "madeleine kirche"]),
    ("Redaktion", ["redaktion"]),
]


def leere_bandcounts():
    return {
        "gold_dunkel": {"neg": 0, "pos": 0, "neutral": 0, "unrated": 0},
        "gold_mittel": {"neg": 0, "pos": 0, "neutral": 0, "unrated": 0},
        "gold_hell": {"neg": 0, "pos": 0, "neutral": 0, "unrated": 0},
    }


def addiere(ziel, quelle):
    for cat in ("gold_dunkel", "gold_mittel", "gold_hell"):
        for v in ("neg", "pos", "neutral", "unrated"):
            ziel[cat][v] += quelle.get(cat, {}).get(v, 0)


def ist_treffer(ort_normalisiert, muster_liste):
    return any(m in ort_normalisiert for m in muster_liste)


def main():
    ergebnis = []
    treffer_report = {name: {} for name, _ in ORTE_DEFINITIONEN}

    for nr in KAPITEL_NUMMERN:
        pfad = os.path.join(PROJEKT_ROOT, f"kapitel{nr}-stationen.json")
        if not os.path.exists(pfad):
            continue
        with open(pfad, encoding="utf-8") as f:
            daten = json.load(f)
        for run in daten.get("ortRuns", []):
            ort = run.get("ort", "")
            if ort.startswith("Unbestimmt"):
                continue
            normalisiert = normalisiere(ort)
            bc = run.get("bandCounts") or {}
            for name, muster in ORTE_DEFINITIONEN:
                if ist_treffer(normalisiert, muster):
                    eintrag = treffer_report[name].setdefault(nr, {"bandCounts": leere_bandcounts(), "varianten": set()})
                    addiere(eintrag["bandCounts"], bc)
                    eintrag["varianten"].add(ort)

    for name, _ in ORTE_DEFINITIONEN:
        kapitel_liste = []
        for nr in sorted(treffer_report[name].keys()):
            eintrag = treffer_report[name][nr]
            n = sum(sum(cat.values()) for cat in eintrag["bandCounts"].values())
            if n == 0:
                continue
            kapitel_liste.append({"nr": nr, "bandCounts": eintrag["bandCounts"]})
        ergebnis.append({"name": name, "kapitel": kapitel_liste})

    out_pfad = os.path.join(PROJEKT_ROOT, "kreisvergleich-orte.json")
    with open(out_pfad, "w", encoding="utf-8") as f:
        json.dump(ergebnis, f, ensure_ascii=False, indent=2)

    print(f"-> {out_pfad}\n")
    print("REPORT")
    print("=" * 70)
    for name, _ in ORTE_DEFINITIONEN:
        alle_varianten = set()
        for eintrag in treffer_report[name].values():
            alle_varianten |= eintrag["varianten"]
        kapitel_nrs = [k["nr"] for k in next(o for o in ergebnis if o["name"] == name)["kapitel"]]
        gesamt = sum(
            sum(sum(cat.values()) for cat in k["bandCounts"].values())
            for k in next(o for o in ergebnis if o["name"] == name)["kapitel"]
        )
        print(f"{name:35s} Kapitel: {kapitel_nrs}  Gesamt-Annotationen: {gesamt}")
        print(f"{'':35s} Varianten: {sorted(alle_varianten)}")


if __name__ == "__main__":
    main()
