# ═══════════════════════════════════════════════════════════════════════════════
# Gefühlte Stadt · Topografie der Gefühle · Bel-Ami · Guy de Maupassant
# belami-pipeline.py
#
# Dieser Code verarbeitet den Romantext von Bel-Ami in einer mehrstufigen
# Pipeline: vom Rohtext über die Annotation bis zur geografischen
# Visualisierung auf einer historischen Pariskarte von 1878.
#
# ⚠ ÄNDERUNG (Fix Datei-Widerspruch + neue Ordnerstruktur):
# Die eigentliche Annotation (Claude API) läuft weiterhin extern im Terminal
# über data-prep/02 verarbeitungsskripte/befehl-01-annotieren.py und
# befehl-02-quantifizieren.py. Diese Pipeline hier annotiert NICHT selbst —
# sie lädt die bereits vorhandenen Ergebnisse aus data-prep/03 output.
# Block 5 wurde deshalb von einem leeren Annotations-Stub zu einer Lade-
# funktion umgebaut, damit kapitel-XX-annotiert.json nicht mehr versehentlich
# mit einer leeren Liste überschrieben wird.
# ═══════════════════════════════════════════════════════════════════════════════


# Kürzelerklärungen
# "f"   file — Variablenname für eine geöffnete Datei
# "r"   read — Datei nur lesen (Modus beim Öffnen)
# "w"   write — Datei schreiben, überschreibt bestehenden Inhalt
# "a"   append — Inhalt ans Ende einer bestehenden Datei anhängen




# ── Importe ───────────────────────────────────────────────────────────────────

# 1. Python Standard-Bibliotheken (eingebaut, keine Installation nötig)
import importlib   # Pakete dynamisch laden (für den Package-Check)
import json        # JSON-Dateien lesen und schreiben
import os          # Dateipfade und Ordner verwalten
import sys         # Systembefehle (z.B. Programm beenden)
import time        # Wartezeiten einbauen (Nominatim: max. 1 Anfrage/Sekunde)

# 2. Drittanbieter-Pakete (via pip installiert)
import geopandas as gpd              # Geografische Vektordaten (GeoJSON, Shapes)
import matplotlib.patches as mpatches # Legendenelemente für Karten
import matplotlib.pyplot as plt      # Diagramme und Karten zeichnen
import osmnx as ox                   # OpenStreetMap-Daten laden (Stadtumriss Paris)
import pandas as pd                  # Tabellarische Datenverarbeitung (DataFrame)
import rasterio                      # GeoTIFF-Dateien lesen (historische Karte)
import requests as req               # HTTP-Anfragen (Nominatim-Geocodierung)
from rasterio.plot import show       # GeoTIFF direkt in matplotlib anzeigen

# 3. Eigene Module (eigene .py Dateien)
# (noch keine in diesem Projekt)




# ── Basisordner ───────────────────────────────────────────────────────────────
# Dieses Skript liegt am Projekt-Root, zusammen mit index.html, sketch.js usw.
# Alle Rohdaten und Zwischenschritte liegen in "data-prep/", das GeoTIFF liegt
# in "images/". Beides wird relativ zum Speicherort DIESES Skripts aufgelöst —
# nicht relativ zum Arbeitsverzeichnis — damit es unabhängig davon läuft, ob
# du über den VSC-Run-Button, das VSC-Terminal oder von einem anderen Ordner
# aus startest.

SKRIPT_ORDNER  = os.path.dirname(os.path.abspath(__file__))         # Projekt-Root
DATA_PREP_ORDNER = os.path.join(SKRIPT_ORDNER, "data-prep")


# ── Globale Hilfsfunktionen ───────────────────────────────────────────────────
# Diese Funktionen werden in Block 8 und 12 verwendet.
# Sie liegen global, damit sie in beiden Blöcken verfügbar sind.
#
# ⚠ NUR FÜR KONTROLLZWECKE — KEINE DESIGN-REFERENZ.
# Diese Farben/Grössen dienen ausschliesslich der schnellen Plausibilitätsprüfung
# in matplotlib (Block 8/12), z.B. "stimmen Geocodierung und Valenz überhaupt?".
# Die gestalterische Wahrheit (Farbpalette, Opazitätsstufen, Typografie) lebt
# ausschliesslich in der Browser-Visualisierung (index.html / CSS / p5.js).
# Diese Werte hier NICHT an das Pergament-Farbsystem (v2) angleichen —
# das würde nur doppelten Pflegeaufwand erzeugen, ohne dass es je sichtbar wird.

# Valenz-Farbzuordnung: +1 = grün, 0 = sand, -1 = braun
FARBEN = { 1: '#6b8f71', 0: '#b0a08a', -1: '#a0522d' }

def valenz_farbe(v):
    """Gibt die Farbe für einen Valenzwert zurück."""
    return FARBEN.get(v, FARBEN[0])  # Fallback: neutral/sand

def intensitaet_groesse(i):
    """Gibt die Punktgrösse für einen Intensitätswert zurück (für Scatter-Plot)."""
    return {1: 60, 2: 150, 3: 300}.get(i, 60)  # 1=klein, 2=mittel, 3=gross




# ── BLOCK 1 — Umgebungs-Check ─────────────────────────────────────────────────
# Prüft ob alle benötigten Python-Pakete installiert sind.
# Nützlich beim ersten Start auf einem neuen Computer.

def block_01_package_check():
    """Prüft ob alle benötigten Pakete installiert sind."""

    packages = [
        "anthropic",   # Claude API — für die Annotation
        "geopandas",   # Geografische Daten
        "matplotlib",  # Visualisierung
        "osmnx",       # OpenStreetMap
        "shapely",     # Geometrie (Linien, Punkte)
        "pandas",      # DataFrame
        "json",        # JSON-Verarbeitung
        "requests",    # HTTP-Anfragen
        "rasterio"     # GeoTIFF
    ]

    print("Package-Check")
    alle_ok = True

    for paket in packages:
        try:
            importlib.import_module(paket)  # Versuche, das Paket zu laden
            print(f" ✓ {paket}")
        except ImportError:
            print(f" ✗ {paket} – nicht installiert")
            alle_ok = False  # Mindestens ein Paket fehlt

    if alle_ok:
        print("\n Alle Pakete verfügbar.")
    else:
        print("\n Fehlende Pakete installieren: pip install <paketname>")




# ── BLOCK 2 — Kapiteltext laden ───────────────────────────────────────────────
# Liest den Rohtext eines Kapitels aus dem Ordner 05 texte ein.
# Der Text wird als einzelner String zurückgegeben und in Block 5 weiterverwendet.

def block_02_kapitel_laden(kapitel_nr):
    """Kapiteltext als String einlesen und zurückgeben."""

    dateiname = f"kapitel-{kapitel_nr:02d}-belami-maupassant.txt"
    pfad = os.path.join(DATA_PREP_ORDNER, "01 texte", dateiname)

    with open(pfad, "r", encoding="utf-8") as f:
        text = f.read()

    print(f"✓ Kapitel {kapitel_nr:02d} geladen: {len(text)} Zeichen")
    return text




# ── BLOCK 3 — Paris-Basiskarte ────────────────────────────────────────────────

def block_03_karte_paris():
    """Paris-Umriss via OpenStreetMap laden und anzeigen."""

    paris = ox.geocode_to_gdf("Paris, France")

    fig, ax = plt.subplots(figsize=(8, 8))
    paris.plot(ax=ax, color="#f0ebe3", edgecolor="#333")
    ax.set_title("Paris – Topografie der Gefühle")
    ax.axis("off")
    plt.show()




# ── BLOCK 4 — Annotations-Struktur ───────────────────────────────────────────

def block_04_close_reading_viz():
    """Beispiel-Struktur des Annotation-Outputs anzeigen."""

    test_output = {
        "kapitel":   1,
        "orte":      [],
        "emotionen": []
    }
    print(json.dumps(test_output, ensure_ascii=False, indent=2))




# ── BLOCK 5 — Bereits annotierte Datei laden ─────────────────────────────────
# Die eigentliche Annotation (Claude API, Schema v5.1) läuft extern im
# Terminal über befehl-01-annotieren.py. Diese Pipeline dupliziert diese
# Logik bewusst NICHT (sonst zwei Stellen, die bei Schema-Änderungen
# synchron gehalten werden müssten). Stattdessen wird hier nur das Ergebnis
# geladen, das befehl-01 bereits nach "04 output" geschrieben hat.

def block_05_annotiert_laden(kapitel_nr):
    """Lädt die von befehl-01-annotieren.py bereits erzeugte Annotationsdatei."""

    dateiname = f"kapitel-{kapitel_nr:02d}-annotiert.json"
    pfad = os.path.join(DATA_PREP_ORDNER, "03 output", dateiname)

    if not os.path.exists(pfad):
        print(f"✗ {pfad} nicht gefunden — zuerst befehl-01-annotieren.py laufen lassen.")
        return []

    with open(pfad, "r", encoding="utf-8") as f:
        daten = json.load(f)

    annotationen = daten.get("annotationen", [])
    print(f"✓ {len(annotationen)} Annotationen geladen aus {pfad}")
    return annotationen


# ── BLOCK 5b — Annotationen im Terminal ausgeben (optional, zur Kontrolle) ────

def block_05b_annotationen_ausgeben(annotationen):
    """Annotationen zur Kontrolle im Terminal ausgeben."""
    for ann in annotationen:
        print(f"ID {ann['id']:02d} | {ann['perspektive']:10} | {ann['tags']}")
        print(f"       {ann['text'][:80]}...")
        print()


# ── BLOCK 5c — Annotationen speichern ────────────────────────────────────────
# ⚠ NICHT MEHR IM AKTIVEN LAUF VERWENDET.
# Das Speichern von kapitel-XX-annotiert.json übernimmt befehl-01-annotieren.py.
# Diese Funktion bleibt nur als Referenz/für manuelle Tests stehen — sie wird
# im Ausführungsblock unten bewusst nicht mehr aufgerufen, damit die echte
# Annotationsdatei nie versehentlich mit einer leeren Liste überschrieben wird.

def block_05c_speichern(annotationen, kapitel_nr):
    """Annotationen als JSON in 04 output speichern."""

    output = {
        "werk":               "Bel-Ami",
        "autor":              "Guy de Maupassant",
        "kapitel":            kapitel_nr,
        "schema_version":     "5.1-claude",
        "total_annotationen": len(annotationen),
        "annotationen":       annotationen
    }

    dateiname = f"kapitel-{kapitel_nr:02d}-annotiert.json"
    pfad = os.path.join(DATA_PREP_ORDNER, "03 output", dateiname)

    with open(pfad, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"✓ Gespeichert: {pfad}")




# ── BLOCK 6a — Quantifizierung ────────────────────────────────────────────────
# Die Valenz-Vergabe erfolgt via befehl-02-quantifizieren.py (Claude API).
# Dieser Block lädt das bereits quantifizierte JSON und gibt die Annotationen zurück.

def block_06a_lade_quantifiziert(kapitel_nr):
    """
    Lädt die bestmögliche verfügbare Datenstufe für ein Kapitel.
    Bevorzugt kapitel-XX-final.json (enthält bereits Geocodierung,
    Näherungsinterpolation und ggf. Strassenrouten aus befehl-04).
    Fällt zurück auf kapitel-XX-quantifiziert.json falls final.json fehlt.
    """

    final_dateiname = f"kapitel-{kapitel_nr:02d}-final.json"
    final_pfad = os.path.join(DATA_PREP_ORDNER, "03 output", final_dateiname)

    if os.path.exists(final_pfad):
        with open(final_pfad, encoding="utf-8") as f:
            daten = json.load(f)
        annotationen = daten.get("annotationen", [])
        print(f"✓ Final geladen: {len(annotationen)} Annotationen (Kapitel {kapitel_nr:02d})")
        return annotationen

    dateiname = f"kapitel-{kapitel_nr:02d}-quantifiziert.json"
    pfad = os.path.join(DATA_PREP_ORDNER, "03 output", dateiname)

    if not os.path.exists(pfad):
        print(f"⚠ Datei nicht gefunden: {pfad}")
        print(f"  → Zuerst ausführen: python befehl-02-quantifizieren.py {kapitel_nr:02d}")
        return []

    with open(pfad, encoding="utf-8") as f:
        daten = json.load(f)

    annotationen = daten.get("annotationen", [])
    print(f"✓ Quantifiziert geladen: {len(annotationen)} Annotationen (Kapitel {kapitel_nr:02d})")
    print(f"  Hinweis: kein final.json gefunden — Routen/Interpolation aus befehl-03/04 fehlen.")
    return annotationen


# ── BLOCK 6b — Quantifiziertes JSON speichern ─────────────────────────────────
# Nicht mehr verwendet — Speichern übernimmt befehl-02-quantifizieren.py

# def block_06b_quantifiziert_speichern(annotationen, kapitel_nr):
#     """Quantifiziertes JSON in 04 output speichern."""
#     output = {
#         "werk":               "Bel-Ami",
#         "autor":              "Guy de Maupassant",
#         "kapitel":            kapitel_nr,
#         "schema_version":     "5.1-claude",
#         "total_annotationen": len(annotationen),
#         "annotationen":       annotationen
#     }
#     dateiname = f"kapitel-{kapitel_nr:02d}-quantifiziert.json"
#     pfad = os.path.join("04 output", dateiname)
#     with open(pfad, "w", encoding="utf-8") as f:
#         json.dump(output, f, ensure_ascii=False, indent=2)
#     print(f"✓ Gespeichert: {pfad}")




# ── BLOCK 7 — Geocodierung ────────────────────────────────────────────────────

PARIS_KOORDINATEN = {
    "rue notre-dame de lorette":  (48.8796, 2.3346),
    "boulevard des capucines":    (48.8717, 2.3355),
    "place de l'opéra":           (48.8720, 2.3316),
    "folies bergère":             (48.8744, 2.3432),
    "boulevard poissonière":      (48.8722, 2.3467),
    "café américain":             (48.8717, 2.3355),
    "rue fontaine":               (48.8788, 2.3310),
    "parc monceau":               (48.8795, 2.3155),
    "champs-élysées":             (48.8698, 2.3078),
    "gare du nord":               (48.8810, 2.3553),
}

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "GefuehltStadt/1.0"}

def block_07_geocodieren(annotationen):
    """Ortsbezeichnungen zu Lat/Lng-Koordinaten auflösen."""

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

        ort = (koordinaten.get("ort_bezeichnung") or "").lower().strip()
        if not ort:
            continue

        if ort in ort_cache:
            ergebnis = ort_cache[ort]
        else:
            ergebnis = None
            for schluessel, koords in PARIS_KOORDINATEN.items():
                if schluessel in ort or ort in schluessel:
                    ergebnis = koords
                    stats["bekannt_lookup"] += 1
                    break

            if not ergebnis:
                try:
                    response = req.get(NOMINATIM_URL,
                        params={"q": f"{ort}, Paris, France",
                                "format": "json", "limit": 1},
                        headers=HEADERS, timeout=10)
                    ergebnisse = response.json()
                    if ergebnisse:
                        ergebnis = (float(ergebnisse[0]["lat"]),
                                    float(ergebnisse[0]["lon"]))
                        stats["nominatim_gefunden"] += 1
                    else:
                        stats["nominatim_nicht_gefunden"] += 1
                except Exception:
                    stats["nominatim_nicht_gefunden"] += 1
                time.sleep(1.1)

            ort_cache[ort] = ergebnis

        if ergebnis:
            ann["koordinaten"]["lat"] = ergebnis[0]
            ann["koordinaten"]["lng"] = ergebnis[1]

    print(f"✓ Geocodierung abgeschlossen")
    print(f"  Bereits vorhanden:         {stats['bereits_vorhanden']}")
    print(f"  Unsicher (übersprungen):   {stats['geo_unsicher_uebersprungen']}")
    print(f"  Bekannter Lookup:          {stats['bekannt_lookup']}")
    print(f"  Nominatim gefunden:        {stats['nominatim_gefunden']}")
    print(f"  Nominatim nicht gefunden:  {stats['nominatim_nicht_gefunden']}")

    # ── Näherungs-Interpolation für unspezifische, aber real-räumliche Orte ──
    # Annotationen ohne Koordinaten (geo_unsicher=True) werden anhand des
    # vorherigen/nachfolgenden bekannten Punktes genähert — ausser bei
    # erkennbar andernorts spielenden Erinnerungen (z.B. Algerien, Ausland),
    # die unverortet bleiben sollen.
    AUSSCHLUSS_KEYWORDS = ["algerien", "afrika", "ausland", "kolonial"]

    annotationen_sortiert = sorted(annotationen, key=lambda a: a.get("id", 0))
    mit_koord = [
        (a.get("id", 0), a["koordinaten"]["lat"], a["koordinaten"]["lng"])
        for a in annotationen_sortiert
        if a.get("koordinaten", {}).get("lat")
    ]

    interpoliert = 0
    for ann in annotationen_sortiert:
        ko = ann.get("koordinaten", {})
        if ko.get("lat"):
            continue  # hat schon Koordinaten

        ort_text = (ko.get("ort_bezeichnung") or "").lower()
        if any(kw in ort_text for kw in AUSSCHLUSS_KEYWORDS):
            continue  # bewusst unverortet lassen (z.B. Algerien-Erinnerung)

        ziel_id = ann.get("id", 0)
        vorher = None
        nachher = None
        for (aid, lat, lng) in mit_koord:
            if aid < ziel_id:
                vorher = (lat, lng)
            if aid > ziel_id and nachher is None:
                nachher = (lat, lng)
                break

        if vorher and nachher:
            lat = round((vorher[0] + nachher[0]) / 2, 5)
            lng = round((vorher[1] + nachher[1]) / 2, 5)
        elif vorher:
            lat, lng = vorher
        elif nachher:
            lat, lng = nachher
        else:
            continue

        ann["koordinaten"]["lat"] = lat
        ann["koordinaten"]["lng"] = lng
        interpoliert += 1

    print(f"  Näherungsinterpoliert:    {interpoliert}")

    return annotationen




# ── BLOCK 8 — Karte: Duroys Route ────────────────────────────────────────────

def block_08_karte_route(annotationen, kapitel_nr):
    """Annotierte Orte chronologisch als Route auf Paris-Karte plotten."""

    from shapely.geometry import LineString

    punkte = []
    for ann in annotationen:
        if "location" in ann.get("tags", []):
            ko = ann.get("koordinaten", {})
            if ko.get("lat") and ko.get("lng"):
                punkte.append({
                    "ort":   ko["ort_bezeichnung"],
                    "lat":   ko["lat"],
                    "lng":   ko["lng"],
                    "zeile": ann.get("zeile", 0)
                })

    punkte = sorted(punkte, key=lambda x: x["zeile"])
    print(f"Orte mit Koordinaten: {len(punkte)}")

    paris = ox.geocode_to_gdf("Paris, France")
    fig, ax = plt.subplots(figsize=(10, 10))
    paris.plot(ax=ax, color="#f0ebe3", edgecolor="#333")
    ax.set_xlim(2.22, 2.47)
    ax.set_ylim(48.81, 48.91)

    if len(punkte) >= 2:
        linie = LineString([(p["lng"], p["lat"]) for p in punkte])
        gpd.GeoSeries([linie]).plot(ax=ax, color="#C0392B", linewidth=2)

    for p in punkte:
        ax.plot(p["lng"], p["lat"], "o", color="#C0392B", markersize=8)
        ax.annotate(p["ort"], (p["lng"], p["lat"]), fontsize=7, ha="left")

    ax.set_title(f"Kapitel {kapitel_nr:02d} — Duroys Route durch Paris")
    ax.axis("off")
    ax.set_aspect(1/0.64)
    plt.tight_layout()
    plt.show()




# ── BLOCK 9 — pandas DataFrame ───────────────────────────────────────────────

def block_09_dataframe(annotationen):
    """Annotationen in pandas DataFrame umwandeln und analysieren."""

    df = pd.DataFrame(annotationen)

    print(f"✓ DataFrame erstellt: {len(df)} Zeilen, {len(df.columns)} Spalten")

    if df.empty:
        print("  → Noch keine Annotationen vorhanden.")
        return df

    print(df[["id", "perspektive", "text", "tags", "notiz", "valenz", "intensitaet"]].head(10).to_string())

    df_raum = df[df["raum_emotion"].notna()]
    print(f"\nAnnotationen mit raum_emotion: {len(df_raum)}")

    # Valenz-Übersicht — NaN bleibt erhalten, wird hier nur gezählt
    print(f"\nValenz-Übersicht:")
    print(f"  Mit Valenz:              {df['valenz'].notna().sum()}")
    print(f"  Ohne Valenz (null):      {df['valenz'].isna().sum()}  — location, move, george_duroy etc.")
    if df['gewichtete_valenz'].notna().any():
        print(f"  Gewichteter Durchschnitt: {df['gewichtete_valenz'].mean():.2f}")

    return df




# ── BLOCK 10 — GeoJSON-Export ─────────────────────────────────────────────────

def block_10_geojson_export(annotationen, kapitel_nr):
    """Annotationen als GeoJSON exportieren."""

    features = []

    for ann in annotationen:
        ko = ann.get("koordinaten", {})
        if not ko or not ko.get("lat") or not ko.get("lng"):
            continue

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [ko["lng"], ko["lat"]]
            },
            "properties": {
                "id":                ann["id"],
                "zeile":             ann.get("zeile"),
                "tags":              ann.get("tags", []),
                "perspektive":       ann.get("perspektive"),
                "text":              ann.get("text", "")[:100],
                "notiz":             ann.get("notiz", ""),
                "ort":               ko.get("ort_bezeichnung", ""),
                "valenz":            ann.get("valenz"),
                "intensitaet":       ann.get("intensitaet"),
                "gewichtete_valenz": ann.get("gewichtete_valenz"),
                "f_wert":            (ann.get("raum_emotion") or {}).get("richtung"),
                "f_emotion":         (ann.get("raum_emotion") or {}).get("emotion"),
                "raum_emotion":      ann.get("raum_emotion"),
                "route":             ann.get("route")
            }
        }
        features.append(feature)

    geojson = {
        "type":     "FeatureCollection",
        "features": features
    }

    # ⚠ Bewusst am ROOT gespeichert, nicht in data-prep/03 output: Das GeoJSON
    # ist das fertige Ergebnis, das index.html/sketch.js direkt lädt — analog
    # zu karte-hintergrund.png. Alle Zwischenschritte bleiben in data-prep.
    dateiname = f"kapitel-{kapitel_nr:02d}.geojson"
    pfad = os.path.join(SKRIPT_ORDNER, dateiname)

    with open(pfad, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    print(f"✓ GeoJSON gespeichert: {pfad} ({len(features)} Features)")




# ── BLOCK 11 — GeoTIFF-Kontrolle ─────────────────────────────────────────────

def block_11_geotiff_kontrolle():
    """GeoTIFF laden, Bounding Box prüfen und Karte anzeigen."""

    geotiff_pfad = os.path.join(SKRIPT_ORDNER, "images", "andriveau-1878-georef.tif")

    with rasterio.open(geotiff_pfad) as src:
        print("── GeoTIFF-Info ──────────────────────────────")
        print(f"Grösse:       {src.width} × {src.height} Pixel")
        print(f"Bänder:       {src.count}  (RGB = 3)")
        print(f"KBS:          {src.crs}")

        b = src.bounds
        print(f"West: {b.left:.6f}  Ost: {b.right:.6f}")
        print(f"Nord: {b.top:.6f}   Süd: {b.bottom:.6f}")

        fig, ax = plt.subplots(figsize=(10, 8))
        show(src, ax=ax, title="Andriveau-Goujon, Plan de Paris 1878 — georeferenziert")
        ax.set_aspect(1/0.64)
        plt.tight_layout()
        plt.show()




# ── BLOCK 12 — Historische Karte mit Annotationspunkten ──────────────────────

def block_12_karte_historisch(kapitel_nr):
    """Annotationspunkte auf historischer Andriveau-Karte plotten und exportieren."""

    geotiff_pfad = os.path.join(SKRIPT_ORDNER, "images", "andriveau-1878-georef.tif")
    geojson_pfad = os.path.join(SKRIPT_ORDNER, f"kapitel-{kapitel_nr:02d}.geojson")

    gdf = gpd.read_file(geojson_pfad)
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")

    print(f"GeoJSON geladen: {len(gdf)} Features")

    fig, ax = plt.subplots(figsize=(16, 13), dpi=150)
    fig.patch.set_facecolor('#f2ece0')
    ax.set_facecolor('#f2ece0')

    with rasterio.open(geotiff_pfad) as src:
        show(src, ax=ax, alpha=0.85)
    ax.set_aspect(1/0.64)

    for _, row in gdf.iterrows():
        if row.geometry is None:
            continue

        valenz      = int(row['valenz'])      if str(row.get('valenz',      'nan')) != 'nan' else 0
        intensitaet = int(row['intensitaet']) if str(row.get('intensitaet', 'nan')) != 'nan' else 1
        ort         = row.get('ort', '')

        ax.scatter(row.geometry.x, row.geometry.y,
                   c=valenz_farbe(valenz),
                   s=intensitaet_groesse(intensitaet),
                   alpha=0.85, zorder=5,
                   edgecolors='#2a2118', linewidths=0.8)

        ax.annotate(ort,
                    xy=(row.geometry.x, row.geometry.y),
                    xytext=(6, 6), textcoords='offset points',
                    fontsize=7, fontfamily='serif', fontstyle='italic',
                    color='#2a2118', zorder=6,
                    bbox=dict(boxstyle='round,pad=0.2',
                              facecolor='#f2ece0', edgecolor='none', alpha=0.75))

    legende = [
        mpatches.Patch(color='#6b8f71', label='Valenz +1 · positiv'),
        mpatches.Patch(color='#b0a08a', label='Valenz  0 · neutral'),
        mpatches.Patch(color='#a0522d', label='Valenz −1 · negativ'),
    ]
    ax.legend(handles=legende, loc='lower left', fontsize=8,
              framealpha=0.9, facecolor='#f2ece0', edgecolor='#b0a08a')

    ax.set_title(f'Gefühlte Stadt · Bel-Ami · Kapitel {kapitel_nr:02d}\nAnnotationspunkte auf Andriveau-Goujon 1878',
                 fontsize=11, fontfamily='serif', fontstyle='italic', color='#2a2118', pad=12)
    ax.set_xlabel("Längengrad", fontsize=8, color='#7a6a55')
    ax.set_ylabel("Breitengrad", fontsize=8, color='#7a6a55')
    ax.tick_params(labelsize=7, colors='#7a6a55')

    plt.tight_layout()
    exports_ordner = os.path.join(DATA_PREP_ORDNER, "exports")
    os.makedirs(exports_ordner, exist_ok=True)
    export_pfad = os.path.join(exports_ordner, f"karte-kapitel-{kapitel_nr:02d}.png")
    plt.savefig(export_pfad, dpi=200, bbox_inches='tight')
    plt.close(fig)




# ── Ausführen ─────────────────────────────────────────────────────────────────
# ┌─────────────────────────────────────────────────────────────────────────┐
# │  HIER STEUERN WELCHE KAPITEL VERARBEITET WERDEN                        │
# │                                                                         │
# │  Nur Kapitel 01 testen:    KAPITEL = [1]                               │
# │  Kapitel 01–06:            KAPITEL = range(1, 7)                       │
# │  Kapitel 07–12:            KAPITEL = range(7, 13)                      │
# │  Kapitel 13–18:            KAPITEL = range(13, 19)                     │
# │  Alle 18 Kapitel:          KAPITEL = range(1, 19)                      │
# └─────────────────────────────────────────────────────────────────────────┘

KAPITEL = [18]   # ← hier anpassen

# block_01_package_check()   # Pakete prüfen (einmalig)
# block_03_karte_paris()     # Paris-Umriss anzeigen (einmalig)
# block_11_geotiff_kontrolle()  # GeoTIFF prüfen (einmalig)

for nr in KAPITEL:
    print(f"\n{'═' * 50}")
    print(f"  Kapitel {nr:02d}")
    print(f"{'═' * 50}")

    # Text laden (nur zur Info/Konsistenzprüfung, wird hier nicht mehr annotiert)
    text = block_02_kapitel_laden(nr)

    # Annotationen laden — erzeugt von befehl-01-annotieren.py (Claude API).
    # Diese Pipeline annotiert nicht selbst, sondern lädt nur das Ergebnis.
    annotationen = block_05_annotiert_laden(nr)
    # block_05b_annotationen_ausgeben(annotationen)  # Kontrolle im Terminal

    if not annotationen:
        print(f"  → Kapitel {nr:02d} übersprungen (keine Annotationen gefunden).")
        continue

    # Quantifizieren
    # Valenz/Intensität werden via befehl-02-quantifizieren.py (Claude API) vergeben.
    # Danach hier das quantifizierte (bzw. finale) JSON laden:
    annotationen = block_06a_lade_quantifiziert(nr)
    if not annotationen:
        continue  # Überspringe dieses Kapitel wenn quantifiziert.json fehlt

    # Geocodieren
    annotationen = block_07_geocodieren(annotationen)

    # Auswerten und exportieren
    df = block_09_dataframe(annotationen)
    block_10_geojson_export(annotationen, nr)

    # Karten (auskommentiert bis echte Annotationen vorhanden)
    # block_08_karte_route(annotationen, nr)
    block_12_karte_historisch(nr)
