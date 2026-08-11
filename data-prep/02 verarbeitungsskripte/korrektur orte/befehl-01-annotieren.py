"""
befehl-01-annotieren.py
=========================
Die Gefühlte Stadt — Bel-Ami
Befehl 1: Strukturelle Annotation (Claude / Anthropic API)

Input:  05 texte/kapitel-01-belami-maupassant.txt
Output: 04 output/kapitel-01-annotiert.json

Voraussetzungen:
    pip install anthropic
    export ANTHROPIC_API_KEY="sk-ant-..."

Verwendung:
    python befehl-01-annotieren.py              → verarbeitet ALLE Kapitel im Ordner
    python befehl-01-annotieren.py 01           → nur Kapitel 01
    python befehl-01-annotieren.py 02 03 04 05 06  → Kapitel 02 bis 06
"""

import json
import os
import sys
import time
import anthropic

# ── Konfiguration ──────────────────────────────────────────────────────────────

WERK         = "Bel-Ami"
AUTOR        = "Guy de Maupassant"
UEBERSETZUNG = "Fürst N. Obolensky"

# ── Pfade ──────────────────────────────────────────────────────────────────────
# ⚠ FIX: Pfade werden relativ zum Speicherort DIESES Skripts aufgelöst.
# Dieses Skript liegt in "data-prep/02 verarbeitungsskripte/". Eine Ebene
# höher liegt "data-prep" selbst — dort liegen "01 texte" und "03 output"
# als Geschwister-Ordner.

SKRIPT_ORDNER  = os.path.dirname(os.path.abspath(__file__))   # .../data-prep/02 verarbeitungsskripte
DATA_PREP_ORDNER = os.path.dirname(SKRIPT_ORDNER)              # .../data-prep

INPUT_DIR  = os.path.join(DATA_PREP_ORDNER, "01 texte")
OUTPUT_DIR = os.path.join(DATA_PREP_ORDNER, "03 output")

MODELL = "claude-sonnet-4-6"

# ── Anthropic Client ───────────────────────────────────────────────────────────

client = anthropic.Anthropic(
    api_key=os.environ.get("ANTHROPIC_API_KEY")
)

# ── Annotations-Schema ─────────────────────────────────────────────────────────

SCHEMA_PROMPT = """
Du bist ein literarischer Annotator für das Projekt «Die Gefühlte Stadt».
Du annotierst Textstellen aus Bel-Ami (Guy de Maupassant, deutsche Übersetzung) nach folgendem Schema.

PERSPEKTIVEN (Pflicht — genau einer pro Annotation):
- figur: Ausschliesslich Duroys Perspektive — er nimmt wahr, fühlt oder erlebt. Die Wahrnehmung kommt von innen, aus seinem Blickwinkel. NICHT wenn die Szene von aussen beschrieben wird, auch wenn Duroy physisch anwesend ist.
- erzaehler: Maupassant beschreibt von aussen — neutral, beobachtend, ohne inneres Erleben Duroys.

NICHT ANNOTIEREN:
- Direkte Rede oder Wahrnehmung anderer Figuren (weder figur noch erzaehler)
- Nur Duroys Perspektive (figur) und Maupassants Erzählerstimme (erzaehler) werden erfasst
- Spricht eine andere Figur — auch wenn Duroy zuhört — wird die Stelle übersprungen

A — FIGUR & BEWEGUNG (immer figur):
- george_duroy: Duroy nimmt aktiv wahr, fühlt oder handelt. NICHT wenn andere Personen nur auf ihn reagieren und er selbst kein inneres Erleben oder keine Wahrnehmung zeigt.
- move: Ortsveränderung, Route, Bewegung durch den Raum — aus Duroys Perspektive

B — RAUM & ORT:
- location: Immer erzaehler. Jede konkrete Ortsnennung — Strassen, Plätze, Gebäude, städtische Strukturen. Wird für die Geo-Verknüpfung (Punkt/Polygon) verwendet. Auch wenn Duroy den Ort durchquert, ansteuert oder plant dorthin zu gehen.
  ⚠ AUSNAHME — vergleichende/generalisierende Ortserwähnung: Wenn ein Ort nur zum VERGLEICH genannt wird
  (z.B. "die Halbwelt vom Americain", "von der Oper zu den Italienern rennen", "wie im Café X üblich"),
  während die Figur nachweislich am selben, bereits etablierten realen Ort bleibt, dann:
    - NICHT den verglichenen/erwähnten Ort als location taggen
    - Falls die Stelle trotzdem raum-emotional relevant ist (z.B. für atmosphere/social), verwende
      stattdessen den AKTUELLEN realen Ort (denselben wie die umgebenden Annotationen) als ort_bezeichnung
  Erkennungsmerkmal: kein Bewegungs- oder Anwesenheitsverb für DIESEN Ort im Satz (z.B. nicht "ging",
  "blieb stehen", "hier"), sondern eine Charakterisierung/ein Vergleich zu etwas an einem anderen Ort.
  Beispiel zur Unterscheidung:
    "Er ging am Vaudeville vorbei und blieb vor dem Café Americain stehen." → location: Café Américain
    (reale Bewegung + Anwesenheitsverb "blieb stehen")
    "Was die Frauen angeht, so gibt es hier nur eine Art: die Halbwelt vom Americain."
    → KEIN location-Tag für "Americain" — "hier" verweist auf den aktuellen, bereits etablierten Ort
    (z.B. Folies Bergère), "vom Americain" ist nur ein vergleichender Typus-Verweis.
- space: Qualität des urbanen Raums. figur wenn Duroy die Raumqualität erlebt (Enge, Weite, Bedrängnis). erzaehler wenn Maupassant den Raum von aussen beschreibt.
- historical: Immer erzaehler. Verweise auf Weltgeschichte, politische Institutionen, historische Ereignisse und Personen zur Entstehungszeit des Romans (Dritte Republik, Kolonialismus, 1880er Jahre). NICHT für persönliche Erinnerungen Duroys — diese gehören zu location_erinnerung.

C — SENSORISCHE QUALITÄTEN (figur oder erzaehler):
- material: Physische Qualität eines Objekts (Textur, Oberfläche, Form) — NICHT wenn Objekt als sozialer Marker fungiert (dann: social)
- smell: Gerüche. figur wenn Duroy es riecht. erzaehler wenn Maupassant es als Kulisse beschreibt.
- sound: Geräusche und Klang. figur wenn Duroy es hört. erzaehler wenn Maupassant es als Kulisse beschreibt.

D — ZEIT & WETTER:
- time (figur): Zeit im Zusammenhang mit dem Gefühl der Figur — Zeitdruck, Ungeduld, Warten. Nur wenn Zeit emotional erlebt wird.
- time (erzaehler): Datum, Tageszeit, Jahreszeit, Jahr als neutrale Erzählerangabe ohne emotionalen Bezug zur Figur.
- weather (figur): Duroy spürt das Wetter körperlich — Hitze, Kälte, Regen als Erlebnis.
- weather (erzaehler): Maupassant beschreibt atmosphärische Bedingungen als Kulisse.

E — STIMMUNG & EMOTION:
- atmosphere: Stimmungsbild eines Ortes. erzaehler wenn Maupassant von aussen beschreibt. figur nur wenn Duroy die Stimmung explizit wahrnimmt und sie sein Erleben färbt.
- social (figur): Duroy denkt über Geld, Armut, sozialen Status nach — inneres Erleben seiner eigenen Lage.
- social (erzaehler): Maupassant beschreibt soziale Schicht durch Objekte, Kleidung, Umgebung — von aussen beobachtet.
- mood: Gefühle und innere Zustände Duroys — immer figur
- koerper_als_akteur: Körper als Handlung im Raum (Rempeln, Blockieren, militärische Haltung) — immer figur
- location_erinnerung (figur) — drei Untertypen:
  * erinnerung: Duroy erinnert sich an einen Ort wo er persönlich war → geo_unsicher true
  * persoenliche_sehnsucht: Duroy stellt sich einen Ort vor den er nicht kennt → mit Valenz, geo_unsicher true
  * historisch-politisch: kollektive Erinnerung, Kolonialgeschichte → kein Valenz-Tag nötig

F — TOPOGRAFIE DER GEFÜHLE (Werte für das Feld 'richtung' im raum_emotion Objekt):
- ort_loest_emotion_aus: Raum löst Gefühl aus
- emotion_faerbt_raum: Gefühl beeinflusst Raumwahrnehmung
- koerper_als_sensor: Körper als Wahrnehmungsmodus (Durst, Hitze, Rausch)

REGELN:
1. Jede Annotation hat genau einen Perspektiv-Tag: figur oder erzaehler
2. george_duroy nur wenn Duroy aktiv wahrnimmt, fühlt oder handelt
3. location und historical sind immer erzaehler
4. Direkte Rede anderer Figuren wird nicht annotiert
5. raum_emotion: richtung akzeptiert nur: ort_loest_emotion_aus / emotion_faerbt_raum / koerper_als_sensor
6. geo_unsicher: true bei imaginierten, erinnerten oder nicht eindeutig verortbaren Stellen
7. Eine Textstelle kann mehrere Annotationen haben
8. figur und erzaehler sind ausschliesslich Perspektiv-Labels — sie dürfen NIE im tags-Array erscheinen
9. NÄHERUNGSREGEL für unspezifische, aber real-räumliche Orte (z.B. "ein Lokal", "der Boulevard", "die Redaktion"):
   Wenn aus dem Kontext erschliessbar ist, dass die Szene in der Nähe eines konkret benannten Ortes spielt
   (z.B. weil die Figur kurz danach einen bekannten Ort erreicht oder von dort kommt), gib als ort_bezeichnung
   eine beschreibende Näherung an UND setze geo_unsicher: true. Lass lat/lng dabei auf null — die Geocodierung
   erfolgt in einem späteren Schritt durch Kontext-Interpolation, nicht durch dich.
   Diese Regel gilt NICHT für tatsächlich imaginierte, erinnerte oder andernorts (z.B. Algerien) spielende
   Szenen — diese bleiben wie bisher ohne räumliche Näherung zu Paris.
10. VERGLEICHS-ORTE NICHT ALS EIGENEN ORT TAGGEN: Wird ein Ort nur zum Vergleich oder zur Charakterisierung
    genannt (z.B. "die Halbwelt vom Americain", "wie im Café X"), während die Figur nachweislich am selben,
    bereits etablierten realen Ort bleibt, verwende für diese Stelle den AKTUELLEN realen Ort als
    ort_bezeichnung — NICHT den verglichenen Ort. Prüfe: gibt es ein Bewegungs- oder Anwesenheitsverb
    ("ging", "blieb stehen", "hier") für den GENANNTEN Ort selbst? Falls nein, ist es ein Vergleich, kein
    realer Ortswechsel. Siehe Beispiel bei der location-Definition oben.

AUSGABEFORMAT:
Antworte NUR mit einem JSON-Array. Kein erklärender Text davor oder danach. Kein Markdown. Kein ```json.
Jedes Element:
{
  "id": <Integer>,
  "zeile": <Integer>,
  "kapitel_abschnitt": <String oder null>,
  "perspektive": <"figur" oder "erzaehler">,
  "text": <Zitat aus dem Text>,
  "tags": [<Array von Tag-Strings>],
  "notiz": <Kurze Annotation, 1 Satz>,
  "koordinaten": {
    "lat": <Float oder null>,
    "lng": <Float oder null>,
    "ort_bezeichnung": <String>,
    "geo_unsicher": <Boolean>
  },
  "raum_emotion": <Objekt mit ort/emotion/richtung — oder null>
}
"""

# ── Hilfsfunktionen ────────────────────────────────────────────────────────────

def lade_text(pfad: str) -> str:
    with open(pfad, "r", encoding="utf-8") as f:
        return f.read()


def parse_kapitel_argumente(argv: list) -> list:
    """
    Wandelt Kommandozeilen-Argumente in eine Liste von Dateinamen um.
    Akzeptiert Nummern mit oder ohne führende Null: 1, 01, 7, 07
    Beispiele:
        python befehl-01-annotieren.py          → alle Kapitel
        python befehl-01-annotieren.py 01       → nur Kapitel 01
        python befehl-01-annotieren.py 02 03 04 → Kapitel 02, 03, 04
    """
    if len(argv) <= 1:
        return None  # Kein Argument → alle Kapitel verarbeiten

    nummern = []
    for arg in argv[1:]:
        try:
            nummern.append(int(arg))
        except ValueError:
            print(f"WARNUNG: Argument '{arg}' ist keine gültige Kapitelnummer — übersprungen.")

    return [f"kapitel-{n:02d}-belami-maupassant.txt" for n in nummern]


def extrahiere_kapitel_nr(dateiname: str) -> int:
    basis = os.path.basename(dateiname).replace(".txt", "")
    teile = basis.split("-")
    for teil in teile:
        if teil.isdigit():
            return int(teil)
    return 0


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


def annotiere_abschnitt(text: str, kapitel_nr: int) -> list:
    """Sendet einen Textabschnitt an Claude und gibt Annotationen zurück."""

    user_prompt = f"""Annotiere folgenden Text aus Kapitel {kapitel_nr} von Bel-Ami (Guy de Maupassant).

Extrahiere ALLE relevanten Textstellen systematisch nach dem Schema.
Für Paris-Koordinaten: Verwende bekannte Adressen (Rue Notre-Dame de Lorette: 48.8796/2.3346,
Boulevard des Capucines: 48.8717/2.3355, Place de l'Opéra: 48.8720/2.3316,
Folies Bergère: 48.8744/2.3432, Boulevard Poissonière: 48.8722/2.3467).
Bei unbekannten oder imaginierten Orten: lat/lng null, geo_unsicher true.

Antworte NUR mit dem JSON-Array. Kein Text davor oder danach.

TEXT:
{text}
"""

    message = client.messages.create(
        model=MODELL,
        max_tokens=8096,
        system=SCHEMA_PROMPT,
        messages=[{"role": "user", "content": user_prompt}]
    )

    roh = message.content[0].text.strip()
    roh_clean = bereinige_json(roh)
    return json.loads(roh_clean)


def segmentiere_text(text: str, abschnitt_groesse: int = 2000) -> list:
    """Teilt den Text an Satzgrenzen in Abschnitte auf."""
    saetze = text.replace('\n', ' ').split('. ')
    abschnitte = []
    aktuell = ""

    for satz in saetze:
        if len(aktuell) + len(satz) < abschnitt_groesse:
            aktuell += satz + ". "
        else:
            if aktuell:
                abschnitte.append(aktuell.strip())
            aktuell = satz + ". "
    if aktuell:
        abschnitte.append(aktuell.strip())

    return abschnitte


def speichere_output(annotationen: list, kapitel_nr: int, output_dir: str) -> str:
    os.makedirs(output_dir, exist_ok=True)

    for i, ann in enumerate(annotationen):
        ann["id"] = i + 1
        ann["kapitel"] = kapitel_nr
        if "kapitel_abschnitt" not in ann:
            ann["kapitel_abschnitt"] = None

    output = {
        "werk":               WERK,
        "autor":              AUTOR,
        "uebersetzung":       UEBERSETZUNG,
        "kapitel":            kapitel_nr,
        "schema_version":     "5.1-claude",
        "modell":             MODELL,
        "total_annotationen": len(annotationen),
        "annotationen":       annotationen,
    }

    dateiname = f"kapitel-{kapitel_nr:02d}-annotiert.json"
    pfad = os.path.join(output_dir, dateiname)

    with open(pfad, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"  → Gespeichert: {pfad} ({len(annotationen)} Annotationen)")
    return pfad

# ── Hauptprogramm ──────────────────────────────────────────────────────────────

def main():

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("FEHLER: ANTHROPIC_API_KEY nicht gesetzt.")
        print("Setze den Key mit: export ANTHROPIC_API_KEY='sk-ant-...'")
        sys.exit(1)

    if not os.path.exists(INPUT_DIR):
        print(f"FEHLER: Ordner '{INPUT_DIR}' nicht gefunden.")
        sys.exit(1)

    # Alle vorhandenen Kapitel-Dateien ermitteln
    alle_dateien = sorted([
        f for f in os.listdir(INPUT_DIR)
        if f.startswith("kapitel-") and f.endswith(".txt")
    ])

    if not alle_dateien:
        print(f"FEHLER: Keine kapitel-XX-belami-maupassant.txt Dateien in '{INPUT_DIR}' gefunden.")
        sys.exit(1)

    # Kapitel-Auswahl via Argument
    ziel_dateien = parse_kapitel_argumente(sys.argv)

    if ziel_dateien is not None:
        # Nur die angeforderten Kapitel, die auch wirklich existieren
        dateien = [d for d in ziel_dateien if d in alle_dateien]
        nicht_gefunden = [d for d in ziel_dateien if d not in alle_dateien]
        for d in nicht_gefunden:
            print(f"WARNUNG: '{d}' nicht in '{INPUT_DIR}' gefunden — übersprungen.")
        if not dateien:
            print("FEHLER: Keine der angegebenen Kapitel-Dateien gefunden.")
            sys.exit(1)
    else:
        dateien = alle_dateien

    print(f"\nDie Gefühlte Stadt — Befehl 1: Strukturelle Annotation (Claude)")
    print(f"{'─' * 50}")
    print(f"Werk:      {WERK}")
    print(f"Modell:    {MODELL}")
    print(f"Schema:    v5.1-claude")
    print(f"Kapitel:   {[extrahiere_kapitel_nr(d) for d in dateien]}")
    print(f"{'─' * 50}\n")

    alle_annotationen = []

    for datei in dateien:
        pfad = os.path.join(INPUT_DIR, datei)
        kapitel_nr = extrahiere_kapitel_nr(datei)

        print(f"Verarbeite: {datei} (Kapitel {kapitel_nr})")
        text = lade_text(pfad)
        print(f"  Textlänge:  {len(text)} Zeichen")

        abschnitte = segmentiere_text(text)
        print(f"  Abschnitte: {len(abschnitte)}")

        kapitel_annotationen = []
        id_zaehler = 1

        for i, abschnitt in enumerate(abschnitte):
            print(f"  Abschnitt {i+1}/{len(abschnitte)} ({len(abschnitt)} Zeichen)...")

            try:
                anns = annotiere_abschnitt(abschnitt, kapitel_nr)
                for ann in anns:
                    ann["id"] = id_zaehler
                    id_zaehler += 1
                kapitel_annotationen.extend(anns)
                print(f"    ✓ {len(anns)} Annotationen")

                if i < len(abschnitte) - 1:
                    time.sleep(0.5)

            except json.JSONDecodeError as e:
                print(f"    FEHLER: JSON-Parsing — {e}")
                continue
            except anthropic.APIError as e:
                print(f"    FEHLER: Claude API — {e}")
                sys.exit(1)

        print(f"  Annotationen total: {len(kapitel_annotationen)}")
        speichere_output(kapitel_annotationen, kapitel_nr, OUTPUT_DIR)
        alle_annotationen.extend(kapitel_annotationen)

        if len(dateien) > 1:
            time.sleep(1)

    print(f"\n{'─' * 50}")
    print(f"Abgeschlossen: {len(dateien)} Kapitel, {len(alle_annotationen)} Annotationen total")
    print(f"Output: {OUTPUT_DIR}/")
    print(f"\nNächster Schritt: python befehl-02-quantifizieren.py {' '.join(str(extrahiere_kapitel_nr(d)) for d in dateien)}")


if __name__ == "__main__":
    main()
