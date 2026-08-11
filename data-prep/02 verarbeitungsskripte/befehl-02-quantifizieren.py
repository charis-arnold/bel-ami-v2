"""
befehl-02-quantifizieren.py
==============================
Die Gefühlte Stadt — Bel-Ami
Befehl 2: Valenz, Intensität und F-Wert-Verteilung (Claude / Anthropic API)

Input:  04 output/kapitel-XX-annotiert.json
Output: 04 output/kapitel-XX-quantifiziert.json
        04 output/kapitel-XX-f-verteilung.json

Voraussetzungen:
    pip install anthropic
    export ANTHROPIC_API_KEY="sk-ant-..."

Verwendung:
    python befehl-02-quantifizieren.py              → alle vorhandenen *-annotiert.json
    python befehl-02-quantifizieren.py 01           → nur Kapitel 01
    python befehl-02-quantifizieren.py 02 03 04 05 06  → Kapitel 02 bis 06
"""

import json
import math
import os
import sys
import time
import anthropic
from collections import defaultdict

# ── Pfade ──────────────────────────────────────────────────────────────────────
# ⚠ FIX: Pfade werden relativ zum Speicherort DIESES Skripts aufgelöst.
# Dieses Skript liegt in "data-prep/02 verarbeitungsskripte/". Eine Ebene
# höher liegt "data-prep" selbst — dort liegt "03 output".

SKRIPT_ORDNER  = os.path.dirname(os.path.abspath(__file__))   # .../data-prep/02 verarbeitungsskripte
DATA_PREP_ORDNER = os.path.dirname(SKRIPT_ORDNER)              # .../data-prep

INPUT_DIR  = os.path.join(DATA_PREP_ORDNER, "03 output")
OUTPUT_DIR = os.path.join(DATA_PREP_ORDNER, "03 output")

MODELL = "claude-sonnet-4-6"

F_WERTE = ["ort_loest_emotion_aus", "emotion_faerbt_raum", "koerper_als_sensor"]

# ── Anthropic Client ───────────────────────────────────────────────────────────

client = anthropic.Anthropic(
    api_key=os.environ.get("ANTHROPIC_API_KEY")
)

# ── Quantifizierungs-Prompt ────────────────────────────────────────────────────

QUANTIFIZIER_PROMPT = """
Du bist ein literarischer Annotator für das Projekt «Die Gefühlte Stadt».
Du vergibst Valenz und Intensität für bereits annotierte Textstellen aus Bel-Ami.

VALENZ (nur bei erlebbaren Qualitäten):
-1 = negativ — unangenehm, bedrückend, abstoßend
 0 = neutral — sachlich, ohne emotionale Färbung
+1 = positiv — angenehm, begehrenswert, erleichternd

INTENSITÄT (Gewichtungsfaktor):
1 = angedeutet — beiläufig erwähnt
2 = beschrieben — deutlich präsent
3 = dominant — ausführlich, strukturbildend

GEWICHTETE VALENZ = valenz × intensitaet

REGELN:
- Bei Tags: location, historical, material → nur intensitaet (1-3), valenz = null
- Bei Tag: social + erzaehler → nur intensitaet, valenz = null
- Bei Tag: social + figur → valenz + intensitaet
- Bei Tag: time + erzaehler → nur intensitaet, valenz = null
- Bei Tag: time + figur → valenz + intensitaet
- Bei Tag: location_erinnerung + historisch-politisch → nur intensitaet, valenz = null
- Bei Tag: location_erinnerung + persoenliche_sehnsucht → valenz + intensitaet
- Bei Tag: location_erinnerung + erinnerung → valenz + intensitaet
- george_duroy, move → valenz = null, intensitaet = null

AUSGABEFORMAT:
Antworte NUR mit einem JSON-Array. Kein Text davor oder danach. Kein Markdown. Kein ```json.
Jedes Element:
{
  "id": <Integer — gleiche ID wie Input>,
  "valenz": <-1, 0, 1 oder null>,
  "intensitaet": <1, 2, 3 oder null>,
  "gewichtete_valenz": <valenz × intensitaet oder null>
}
"""

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

    return [f"kapitel-{n:02d}-annotiert.json" for n in nummern]


def bereinige_json(roh: str) -> str:
    roh = roh.strip()
    if roh.startswith("```"):
        roh = roh.split("\n", 1)[1]
    if roh.endswith("```"):
        roh = roh.rsplit("```", 1)[0]
    roh = roh.strip()
    if not roh.endswith("]"):
        letztes_objekt = roh.rfind("},")
        if letztes_objekt != -1:
            roh = roh[:letztes_objekt + 1] + "\n]"
    return roh


def quantifiziere_paket(annotationen: list) -> dict:
    """Sendet ein Paket Annotationen an Claude für Valenz/Intensität-Vergabe."""

    kompakt = [
        {
            "id":          a["id"],
            "perspektive": a.get("perspektive", ""),
            "text":        a["text"][:150],
            "tags":        a["tags"],
            "notiz":       a.get("notiz", "")[:100],
        }
        for a in annotationen
    ]

    message = client.messages.create(
        model=MODELL,
        max_tokens=4096,
        system=QUANTIFIZIER_PROMPT,
        messages=[{
            "role":    "user",
            "content": f"Vergib Valenz und Intensität:\n\n{json.dumps(kompakt, ensure_ascii=False, indent=2)}"
        }]
    )

    roh = message.content[0].text.strip()
    roh_clean = bereinige_json(roh)
    return {item["id"]: item for item in json.loads(roh_clean)}


def quantifiziere_in_paketen(annotationen: list, paketgroesse: int = 15) -> dict:
    """Verarbeitet Annotationen in Paketen von je 15."""
    alle = {}
    pakete = math.ceil(len(annotationen) / paketgroesse)

    for i in range(pakete):
        paket = annotationen[i * paketgroesse:(i + 1) * paketgroesse]
        print(f"  Paket {i+1}/{pakete} ({len(paket)} Annotationen)...")
        try:
            ergebnis = quantifiziere_paket(paket)
            alle.update(ergebnis)
            if i < pakete - 1:
                time.sleep(0.5)
        except Exception as e:
            print(f"  FEHLER Paket {i+1}: {e}")

    return alle


def berechne_f_verteilung(annotationen: list) -> dict:
    """F-Wert-Verteilung pro Ort berechnen."""
    ort_f_counts = defaultdict(lambda: defaultdict(int))
    ort_gesamt   = defaultdict(int)

    for ann in annotationen:
        re = ann.get("raum_emotion")
        if not re:
            continue
        richtung = re.get("richtung")
        if richtung not in F_WERTE:
            continue
        ort_key = ann.get("koordinaten", {}).get("ort_bezeichnung", "unbekannt")
        ort_f_counts[ort_key][richtung] += 1
        ort_gesamt[ort_key] += 1

    verteilungen = {}
    for ort, counts in ort_f_counts.items():
        gesamt = ort_gesamt[ort]
        prozente = {
            f_wert: round((counts.get(f_wert, 0) / gesamt) * 100, 1)
            for f_wert in F_WERTE
        }
        dominant = max(counts, key=counts.get)
        verteilungen[ort] = {
            "gesamt_f_annotationen": gesamt,
            "absolut":               {f: counts.get(f, 0) for f in F_WERTE},
            "prozent":               prozente,
            "dominant":              dominant,
        }
    return verteilungen


def berechne_valenz_pro_ort(annotationen: list) -> dict:
    """Valenz-Durchschnitte pro Ort berechnen."""
    ort_werte = defaultdict(list)
    for ann in annotationen:
        gv = ann.get("gewichtete_valenz")
        if gv is None:
            continue
        ort = ann.get("koordinaten", {}).get("ort_bezeichnung", "unbekannt")
        ort_werte[ort].append(gv)

    return {
        ort: {
            "gewichtete_valenz_summe":        sum(werte),
            "gewichtete_valenz_durchschnitt": round(sum(werte) / len(werte), 2),
            "anzahl_annotationen":            len(werte),
        }
        for ort, werte in ort_werte.items()
    }


def speichere_quantifiziert(daten: dict, kapitel_nr: int) -> str:
    """Speichert quantifiziertes JSON — alle Metadaten vollständig."""
    dateiname = f"kapitel-{kapitel_nr:02d}-quantifiziert.json"
    pfad = os.path.join(OUTPUT_DIR, dateiname)
    with open(pfad, "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=2)
    print(f"  → Gespeichert: {pfad}")
    return pfad


def speichere_f_verteilung(verteilung: dict, valenz_pro_ort: dict, kapitel_nr: int):
    output = {
        "kapitel":              kapitel_nr,
        "beschreibung":         "F-Wert-Verteilung (Ebene 3) und Valenz-Durchschnitte (Ebene 2) pro Ort",
        "f_verteilung_pro_ort": verteilung,
        "valenz_pro_ort":       valenz_pro_ort,
    }
    dateiname = f"kapitel-{kapitel_nr:02d}-f-verteilung.json"
    pfad = os.path.join(OUTPUT_DIR, dateiname)
    with open(pfad, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"  → Gespeichert: {pfad}")


def berechne_valenz_pro_tag(annotationen: list) -> dict:
    """Gewichtete Valenz gruppiert nach Tag-Kategorie berechnen."""
    from collections import defaultdict
    tag_werte = defaultdict(list)

    for ann in annotationen:
        gv = ann.get("gewichtete_valenz")
        if gv is None:
            continue
        for tag in ann.get("tags", []):
            tag_werte[tag].append(gv)

    return {
        tag: {
            "gewichtete_valenz_summe":        sum(werte),
            "gewichtete_valenz_durchschnitt": round(sum(werte) / len(werte), 2),
            "anzahl_annotationen":            len(werte),
        }
        for tag, werte in tag_werte.items()
    }


def speichere_valenz_pro_tag(valenz_pro_tag: dict, kapitel_nr: int):
    output = {
        "kapitel":     kapitel_nr,
        "beschreibung": "Gewichtete Valenz pro Tag-Kategorie — Grundlage für Kreis-Visualisierung",
        "valenz_pro_tag": valenz_pro_tag,
    }
    dateiname = f"kapitel-{kapitel_nr:02d}-valenz-tags.json"
    pfad = os.path.join(OUTPUT_DIR, dateiname)
    with open(pfad, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"  → Gespeichert: {pfad}")

# ── Hauptprogramm ──────────────────────────────────────────────────────────────

def main():

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("FEHLER: ANTHROPIC_API_KEY nicht gesetzt.")
        print("Setze den Key mit: export ANTHROPIC_API_KEY='sk-ant-...'")
        sys.exit(1)

    alle_dateien = sorted([
        f for f in os.listdir(INPUT_DIR)
        if f.endswith("-annotiert.json")
    ])

    if not alle_dateien:
        print(f"FEHLER: Keine *-annotiert.json Dateien in '{INPUT_DIR}' gefunden.")
        print("Zuerst Befehl 1 ausführen: python befehl-01-annotieren.py")
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

    print(f"\nDie Gefühlte Stadt — Befehl 2: Quantifizierung (Claude)")
    print(f"{'─' * 50}")
    print(f"Modell:   {MODELL}")
    print(f"Kapitel:  {kapitel_nummern}")
    print(f"{'─' * 50}\n")

    for datei in dateien:
        pfad       = os.path.join(INPUT_DIR, datei)
        kapitel_nr = int(datei.split("-")[1])

        print(f"Verarbeite: {datei}")
        with open(pfad, encoding="utf-8") as f:
            daten = json.load(f)

        annotationen = daten["annotationen"]
        print(f"  Annotationen: {len(annotationen)}")

        print(f"  Sende an Claude für Valenz/Intensität...")
        try:
            quantifiziert = quantifiziere_in_paketen(annotationen)

            for ann in annotationen:
                q = quantifiziert.get(ann["id"], {})
                ann["valenz"]            = q.get("valenz", None)
                ann["intensitaet"]       = q.get("intensitaet", None)
                ann["gewichtete_valenz"] = q.get("gewichtete_valenz", None)

            # Metadaten vollständig aus annotiert.json übernehmen und ergänzen
            daten["annotationen"]     = annotationen
            daten["schema_version"]   = "5.1-claude"
            daten["modell"]           = MODELL
            daten["total_annotationen"] = len(annotationen)
            # autor und uebersetzung bleiben erhalten (kommen aus befehl-01)

            speichere_quantifiziert(daten, kapitel_nr)

            print(f"  Berechne F-Wert-Verteilung...")
            f_verteilung   = berechne_f_verteilung(annotationen)
            valenz_pro_ort = berechne_valenz_pro_ort(annotationen)
            speichere_f_verteilung(f_verteilung, valenz_pro_ort, kapitel_nr)

            valenz_pro_tag = berechne_valenz_pro_tag(annotationen)
            speichere_valenz_pro_tag(valenz_pro_tag, kapitel_nr)

            print(f"  F-Wert-Orte: {len(f_verteilung)}")
            print(f"  Valenz-Orte: {len(valenz_pro_ort)}")
            print(f"  Valenz-Tags: {len(valenz_pro_tag)}")

            if len(dateien) > 1:
                time.sleep(1)

        except anthropic.APIError as e:
            print(f"  FEHLER: Claude API — {e}")
            sys.exit(1)
        except Exception as e:
            print(f"  FEHLER: {e}")
            continue

    print(f"\n{'─' * 50}")
    print(f"Abgeschlossen.")
    print(f"Output: {OUTPUT_DIR}/")
    print(f"\nNächster Schritt: python befehl-03-geocodieren.py {' '.join(str(n) for n in kapitel_nummern)}")


if __name__ == "__main__":
    main()
