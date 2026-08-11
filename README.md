# Bel-Ami v2

Dieses Projekt visualisiert die Route von Georges Duroy aus dem Roman «Bel-Ami» als generative Kartografie. Die Struktur ist bewusst einfach gehalten:

- Kern der Darstellung: index.html, sketch.js, datenbereinigung.js, style.css
- Daten und Aufbereitung: data-prep/
- Audio-Ergänzung: sonifikation.js

Die Arbeit folgt dem CAS-Stil: klar, reduziert und nachvollziehbar.

## Ordnerstruktur
- data-prep/01 texte: Kapiteltexte
- data-prep/03 output: finale Kapitel-Daten für die Visualisierung
- data-prep/05 bereinigen: erzeugte JSON-Dateien für Karten, Routen und Vergleiche
- data-prep/export: optionale GIS-Arbeitsdateien

## Für die aktuelle Visualisierung relevante Dateien
- kapitel01-stationen.json, kapitel03-stationen.json und die übrigen kapitelXX-stationen.json: direkte Eingabedaten für die Darstellung
- kapitel-routen-uebersicht.json: Übersicht der Kapitelrouten
- kreisvergleich-orte.json: Vergleichsorte für den letzten Akt
- kapitel01-sonifikation.json: Sonifikationsdaten für Kapitel 1

