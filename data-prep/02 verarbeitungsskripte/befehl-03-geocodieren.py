"""
befehl-03-geocodieren.py
==========================
Die Gefühlte Stadt — Bel-Ami
Befehl 3: Geocodierung via Nominatim / OpenStreetMap

Input:  04 output/kapitel-XX-quantifiziert.json
Output: 04 output/kapitel-XX-final.json

Löst ort_bezeichnung-Felder via Nominatim zu Lat/Lng auf.
Überspringt Stellen mit geo_unsicher: true oder bereits vorhandenen Koordinaten.

Voraussetzungen:
    pip install requests --break-system-packages

Hinweis: Nominatim-Nutzungsbedingungen — max. 1 Anfrage pro Sekunde.
Kein API-Key nötig.

Verwendung:
    python befehl-03-geocodieren.py              → alle vorhandenen *-quantifiziert.json
    python befehl-03-geocodieren.py 01           → nur Kapitel 01
    python befehl-03-geocodieren.py 02 03 04 05 06  → Kapitel 02 bis 06
"""

import json
import os
import sys
import time
import requests

# ── Pfade ──────────────────────────────────────────────────────────────────────
# ⚠ FIX: Pfade werden relativ zum Speicherort DIESES Skripts aufgelöst.
# Dieses Skript liegt in "data-prep/02 verarbeitungsskripte/". Eine Ebene
# höher liegt "data-prep" selbst — dort liegt "03 output".

SKRIPT_ORDNER  = os.path.dirname(os.path.abspath(__file__))   # .../data-prep/02 verarbeitungsskripte
DATA_PREP_ORDNER = os.path.dirname(SKRIPT_ORDNER)              # .../data-prep

INPUT_DIR  = os.path.join(DATA_PREP_ORDNER, "03 output")
OUTPUT_DIR = os.path.join(DATA_PREP_ORDNER, "03 output")

# ── Nominatim-Konfiguration ────────────────────────────────────────────────────

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS       = {"User-Agent": "GefuehltStadt/1.0 (literatur-kartierung@projekt.ch)"}
WARTEZEIT     = 1.1  # Sekunden zwischen Anfragen (Nominatim-Limit: 1/s)

# ── Bekannte Paris-Koordinaten ─────────────────────────────────────────────────
# Interner Lookup — reduziert Nominatim-Anfragen

PARIS_KOORDINATEN = {
    "rue notre-dame de lorette":  (48.8796, 2.3346),
    "notre-dame de lorette":      (48.8796, 2.3346),
    "boulevard des capucines":    (48.8717, 2.3355),
    "boulevard":                  (48.8726, 2.3290),
    "place de l'opéra":           (48.8720, 2.3316),
    "place de l'opera":           (48.8720, 2.3316),
    "opéra":                      (48.8720, 2.3316),
    "folies bergère":             (48.8744, 2.3432),
    "folies bergere":             (48.8744, 2.3432),
    "boulevard poissonière":      (48.8722, 2.3467),
    "boulevard poissoniere":      (48.8722, 2.3467),
    "café napolitain":            (48.8699, 2.3380),
    "cafe napolitain":            (48.8699, 2.3380),
    "rue fontaine":               (48.8788, 2.3310),
    "17 rue fontaine":            (48.8788, 2.3310),
    "rue du faubourg-montmartre": (48.8762, 2.3438),
    "faubourg-montmartre":        (48.8762, 2.3438),
    "madeleine":                  (48.8700, 2.3241),
    "café américain":             (48.8717, 2.3355),
    "café americain":             (48.8717, 2.3355),
    "vaudeville":                 (48.8717, 2.3355),
    "parc monceau":               (48.8795, 2.3155),
    "park monceau":               (48.8795, 2.3155),
    "champs-élysées":             (48.8698, 2.3078),
    "champs elysées":             (48.8698, 2.3078),
    "bois de boulogne":           (48.8636, 2.2474),
    "nordbahn":                   (48.8810, 2.3553),
    "gare du nord":               (48.8810, 2.3553),
}

# ── Hilfsfunktionen ────────────────────────────────────────────────────────────

def parse_kapitel_argumente(argv: list) -> list:
    """
    Wandelt Kommandozeilen-Argumente in Dateinamen um.
    Akzeptiert Nummern: 1, 01, 7, 07
    """
    if len(argv) <= 1:
        return None

    nummern = []
    for arg in argv[1:]:
        try:
            nummern.append(int(arg))
        except ValueError:
            print(f"WARNUNG: Argument '{arg}' ist keine gültige Kapitelnummer — übersprungen.")

    return [f"kapitel-{n:02d}-quantifiziert.json" for n in nummern]


def normalisiere_ort(ort: str) -> str:
    return ort.lower().strip().rstrip(".")


def lookup_bekannt(ort: str):
    """Prüft ob Ort in bekannten Paris-Koordinaten vorhanden."""
    norm = normalisiere_ort(ort)
    for schluessel, koordinaten in PARIS_KOORDINATEN.items():
        if schluessel in norm or norm in schluessel:
            return koordinaten
    return None


def geocodiere_nominatim(ort: str):
    """Geocodiert einen Ortsnamen via Nominatim."""
    params = {
        "q":            f"{ort}, Paris, France",
        "format":       "json",
        "limit":        1,
        "countrycodes": "fr",
    }
    try:
        response = requests.get(
            NOMINATIM_URL, params=params, headers=HEADERS, timeout=10
        )
        response.raise_for_status()
        ergebnisse = response.json()
        if ergebnisse:
            return (float(ergebnisse[0]["lat"]), float(ergebnisse[0]["lon"]))
    except (requests.RequestException, ValueError, KeyError):
        pass
    return None


def geocodiere_annotationen(annotationen: list) -> tuple:
    """Geocodiert alle Annotationen. Gibt (annotationen, stats) zurück."""

    stats = {
        "bereits_vorhanden":          0,
        "geo_unsicher_uebersprungen": 0,
        "bekannt_lookup":             0,
        "nominatim_gefunden":         0,
        "nominatim_nicht_gefunden":   0,
    }

    ort_cache = {}

    for ann in annotationen:
        koordinaten = ann.get("koordinaten", {})
        if not koordinaten:
            continue

        if koordinaten.get("lat") and koordinaten.get("lng"):
            stats["bereits_vorhanden"] += 1
            continue

        if koordinaten.get("geo_unsicher", False):
            stats["geo_unsicher_uebersprungen"] += 1
            continue

        ort = koordinaten.get("ort_bezeichnung", "")
        if not ort:
            continue

        if ort in ort_cache:
            ergebnis = ort_cache[ort]
        else:
            ergebnis = lookup_bekannt(ort)
            if ergebnis:
                stats["bekannt_lookup"] += 1
                ort_cache[ort] = ergebnis
            else:
                print(f"    Nominatim: {ort}")
                ergebnis = geocodiere_nominatim(ort)
                time.sleep(WARTEZEIT)

                if ergebnis:
                    stats["nominatim_gefunden"] += 1
                else:
                    stats["nominatim_nicht_gefunden"] += 1
                    print(f"    ⚠ Nicht gefunden: {ort}")

                ort_cache[ort] = ergebnis

        if ergebnis:
            ann["koordinaten"]["lat"] = ergebnis[0]
            ann["koordinaten"]["lng"] = ergebnis[1]

    return annotationen, stats


def speichere_final(daten: dict, kapitel_nr: int) -> str:
    """Speichert finales JSON — alle Metadaten vollständig."""
    dateiname = f"kapitel-{kapitel_nr:02d}-final.json"
    pfad = os.path.join(OUTPUT_DIR, dateiname)
    with open(pfad, "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=2)
    print(f"  → Gespeichert: {pfad}")
    return pfad

# ── Hauptprogramm ──────────────────────────────────────────────────────────────

def main():

    alle_dateien = sorted([
        f for f in os.listdir(INPUT_DIR)
        if f.endswith("-quantifiziert.json")
    ])

    if not alle_dateien:
        print(f"FEHLER: Keine *-quantifiziert.json Dateien in '{INPUT_DIR}' gefunden.")
        print("Zuerst Befehl 2 ausführen: python befehl-02-quantifizieren.py")
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

    print(f"\nDie Gefühlte Stadt — Befehl 3: Geocodierung")
    print(f"{'─' * 50}")
    print(f"Kapitel:  {kapitel_nummern}")
    print(f"Quelle:   Nominatim / OpenStreetMap")
    print(f"{'─' * 50}\n")

    for datei in dateien:
        pfad       = os.path.join(INPUT_DIR, datei)
        kapitel_nr = int(datei.split("-")[1])

        print(f"Verarbeite: {datei}")
        with open(pfad, encoding="utf-8") as f:
            daten = json.load(f)

        annotationen = daten["annotationen"]
        print(f"  Annotationen: {len(annotationen)}")

        annotationen, stats = geocodiere_annotationen(annotationen)

        print(f"  Bereits vorhanden:        {stats['bereits_vorhanden']}")
        print(f"  Unsicher (übersprungen):  {stats['geo_unsicher_uebersprungen']}")
        print(f"  Bekannter Lookup:         {stats['bekannt_lookup']}")
        print(f"  Nominatim gefunden:       {stats['nominatim_gefunden']}")
        print(f"  Nominatim nicht gefunden: {stats['nominatim_nicht_gefunden']}")

        # Metadaten vollständig aus quantifiziert.json übernehmen
        daten["annotationen"]     = annotationen
        daten["total_annotationen"] = len(annotationen)
        # werk, autor, uebersetzung, schema_version, modell, kapitel bleiben erhalten

        speichere_final(daten, kapitel_nr)

    print(f"\n{'─' * 50}")
    print(f"Abgeschlossen.")
    print(f"Finale Dateien: {OUTPUT_DIR}/kapitel-XX-final.json")
    print(f"Bereit für Karte und Visualisierung.")


if __name__ == "__main__":
    main()
