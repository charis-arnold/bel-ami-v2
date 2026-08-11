"""
ergaenze-orte.py
=====================
Die Gefühlte Stadt — Bel-Ami
Nachträgliches Hinzufügen fehlender Annotationen in kapitel-XX.geojson

WARUM DIESES SKRIPT EXISTIERT (im Unterschied zu korrigiere-orte.py):
korrigiere-orte.py korrigiert nur den Ort BEREITS VORHANDENER Annotationen
(per id). Manche Textstellen wurden von der automatischen Annotation aber
komplett übersprungen -- es gibt gar keine Annotation-id dafür. Dieses
Skript ergänzt genau solche fehlenden Annotationen als neue Feature-Objekte.

Verwendung:
    python3 ergaenze-orte.py              → alle Kapitel mit definierten Ergänzungen
    python3 ergaenze-orte.py 01            → nur Kapitel 01

WICHTIG BEIM ERWEITERN:
Jede Ergänzung braucht eine kurze Begründung, warum die Stelle fehlte und
warum diese id/dieses Ort-Feld gewählt wurde -- gleiche methodische
Dokumentationspflicht wie bei korrigiere-orte.py.
"""

import json
import os
import sys

SKRIPT_ORDNER = os.path.dirname(os.path.abspath(__file__))

# ── Neue Annotationen pro Kapitel ──────────────────────────────────────────
# Format: { kapitel_nr: [ (neue_annotation_dict, begruendung), ... ] }

ERGAENZUNGEN = {
    1: [
        (
            {
                "id": 41,
                "zeile": 4,
                "tags": ["george_duroy", "location_erinnerung", "mood"],
                "perspektive": "figur",
                "text": "Er dachte an seine zwei Dienstjahre in Afrika und an die Art und Weise, "
                        "wie man in den kleinen Vorposten im Süden den Arabern das Geld abnahm. "
                        "Ein grausames, zufriedenes Lächeln glitt über seine Lippen, als er eines "
                        "Streiches gedachte, der drei Männern vom Stamme der Uled-Alan das Leben "
                        "kostete und ihm und seinen Kameraden zwanzig Hühner, zwei Schafe und Gold "
                        "einbrachte und heiteren Gesprächsstoff für sechs Monate.",
                "notiz": "Duroy erinnert sich an einen Ort, an dem er persönlich war (Militärzeit "
                         "in Afrika) — passt exakt auf location_erinnerung/erinnerung gemäss Schema "
                         "(befehl-01-annotieren.py, Zeile 93f.). War in der automatischen Annotation "
                         "komplett übersprungen worden (IDs 41-43 fehlten in der Sequenz). "
                         "Koordinate ist eine reine Platzierungs-Näherung — entspricht Duroys "
                         "tatsächlicher Position auf dem Boulevard in diesem Moment (übernommen von "
                         "den unmittelbar benachbarten Annotationen id 39/40/44), NICHT dem "
                         "erinnerten Ort selbst. Afrika ist geografisch nicht sinnvoll auf der "
                         "Paris-Karte darstellbar.",
                "ort": "Afrika (Erinnerung, Militärdienst)",
                "valenz": None,
                "intensitaet": None,
                "gewichtete_valenz": None,
                "f_wert": None,
                "f_emotion": None,
                "raum_emotion": None,
                "route": None,
            },
            "Textstelle war vollständig unannotiert (keine ID deckte sie ab), obwohl sie "
            "wörtlich der Schema-Definition von location_erinnerung/erinnerung entspricht — "
            "nur Duroys eigene Erinnerung betroffen, keine fremde Figur (Bougival/Menton "
            "bewusst NICHT ergänzt, da Forestiers Erinnerung/Plan, nicht Duroys). "
            "Koordinate [2.3467, 48.8722] als Näherung von den Nachbar-Annotationen "
            "id 39/40/44 übernommen, nicht geocodiert."
        ),
    ],
}


def parse_kapitel_argumente(argv):
    if len(argv) <= 1:
        return None
    nummern = []
    for arg in argv[1:]:
        try:
            nummern.append(int(arg))
        except ValueError:
            print(f"WARNUNG: '{arg}' ist keine gültige Kapitelnummer — übersprungen.")
    return nummern


def ergaenze_kapitel(kapitel_nr):
    ergaenzungen = ERGAENZUNGEN.get(kapitel_nr)
    if not ergaenzungen:
        print(f"Kapitel {kapitel_nr:02d}: keine Ergänzungen definiert — übersprungen.")
        return

    dateiname = f"kapitel-{kapitel_nr:02d}.geojson"
    pfad = os.path.join(SKRIPT_ORDNER, dateiname)

    if not os.path.exists(pfad):
        print(f"✗ {pfad} nicht gefunden.")
        return

    with open(pfad, encoding="utf-8") as f:
        daten = json.load(f)

    bestehende_ids = {f["properties"]["id"] for f in daten["features"]}

    print(f"\nKapitel {kapitel_nr:02d} — {dateiname}")
    print("─" * 50)

    hinzugefuegt = 0
    for annotation, begruendung in ergaenzungen:
        ann_id = annotation["id"]
        if ann_id in bestehende_ids:
            print(f"  ⚠ id={ann_id} existiert bereits — übersprungen (kein Überschreiben).")
            continue

        feature = {
            "type": "Feature",
            "properties": annotation,
            "geometry": {"type": "Point", "coordinates": [None, None]},  # noch nicht geocodiert
        }
        daten["features"].append(feature)
        bestehende_ids.add(ann_id)

        print(f"  + id={ann_id}: {annotation['ort']!r} ergänzt")
        print(f"      Begründung: {begruendung}")
        hinzugefuegt += 1

    daten["features"].sort(key=lambda f: f["properties"]["id"])

    with open(pfad, "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=2)

    print(f"\n  ✓ {hinzugefuegt} Ergänzung(en) angewendet und gespeichert: {pfad}")


def main():
    ziel_kapitel = parse_kapitel_argumente(sys.argv)
    kapitel_liste = ziel_kapitel if ziel_kapitel else sorted(ERGAENZUNGEN.keys())

    print("Die Gefühlte Stadt — Fehlende Annotationen ergänzen")
    print("═" * 50)
    print(f"Kapitel: {kapitel_liste}")

    for nr in kapitel_liste:
        ergaenze_kapitel(nr)

    print("\n" + "═" * 50)
    print("Abgeschlossen.")
    print("Hinweis: geometry.coordinates ist noch [None, None] -- Geocoding-Schritt")
    print("(befehl-03-geocodieren.py) danach erneut für diese neue Annotation laufen lassen,")
    print("oder Koordinaten manuell setzen, z.B. via korrigiere-orte.py-Mechanismus.")


if __name__ == "__main__":
    main()