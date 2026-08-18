"""
baue-sammelpunkte-handkuriert.py
=====================
Die Gefühlte Stadt — Bel-Ami

Schreibt die VON HAND (Annotation für Annotation) kuratierte Sammelpunkt-
Struktur eines Kapitels in kapitelXX-stationen.json zurück — also genau die
Verfeinerung, die baue-kapitel-stationen.py in seinem Kopfkommentar
ausdrücklich offenlässt ("keine Innen/Aussen-Splits, keine Wohnung-
Sammelpunkt-Tricks wie bei Kapitel 1. Diese Verfeinerungen kommen ... in
späteren Sitzungen Schritt für Schritt").

Kuratierungsregel (dieselbe, nach der Kapitel 1–9 gebaut sind):

  1. Ein SPEZIFISCHER ORT ergibt einen Sammelpunkt.
  2. Solange der Inhalt dort spielt, bleibt die Route stehen — alle
     Annotationen dieses Blocks teilen sich denselben ortBasis, der
     kumulative Pfadindex bleibt flach ("Stop").
  3. Bei der ERSTEN Annotation, in der die Figur sich auf den Weg macht,
     wächst die Route weiter ("Go") — der Pfadindex springt auf den vollen
     echten Fussweg zum nächsten Anker.
  4. Alle Annotationen von dort bis zum nächsten spezifischen Ort ergeben
     einen eigenen Sammelpunkt AUF der Route (Unterwegs-Punkt).
  5. JEDE Annotation zählt zu dem Ort, an dem sie gesagt, gedacht oder
     gefühlt wird — nicht zu dem, VON dem sie handelt. Erinnerungen,
     Wünsche, Vorstellungen und blosse Erwähnungen bekommen also keinen
     eigenen Kreis und kein Sammelbecken, sondern gehören zum Schauplatz,
     an dem die Figur gerade steht. Ein Kreis misst damit, was an diesem
     Ort empfunden wurde, nicht, worüber gesprochen wurde — für "Die
     Gefühlte Stadt" die passende Grösse. (Die Sammelbecken-Mechanik in
     sketch.js — SAMMELPUNKT_KATEGORIEN/zeichneOrteOhneAdresse — wird
     dadurch nicht mehr gebraucht; sie bleibt vorerst ungenutzt stehen.)

Wiederkehrende Orte behalten bewusst exakt denselben Namen (z.B. die
Redaktion, die in Kapitel 10 dreimal besucht wird): ortRuns gruppiert nach
ortBasis, gleicher Name = EIN Kreis auf der Karte, der über das Kapitel
hinweg mehrfach weiterwächst — genau wie "Rue Constantinople 127" in
Kapitel 9. Deshalb ist die Blockliste unten eine LAUFENDE Folge (mit
Wiederholungen), die ortRuns-Liste daraus die eindeutige Namensmenge.

Ein-/Ausgabe (in-place):  <projekt-root>/kapitelXX-stationen.json
Neu geschrieben werden:   annotationen[].ortBasis, ortRuns, routenPunkte,
                          routenPfadDetail, routenPfadKumulativ, route
Unangetastet bleiben:     annotationen[].ort (die feine LLM-Ortsangabe),
                          text/tags/valenz/category/perspektive/f_wert,
                          revealIndex, gedanken, markierungen, halteorte,
                          zwischenPunkte

Verwendung:
    python "baue-sammelpunkte-handkuriert.py"        → alle kuratierten Kapitel
    python "baue-sammelpunkte-handkuriert.py" 10     → nur Kapitel 10

Voraussetzung: pip install osmnx networkx (wie befehl-04-routen.py /
baue-kapitel-stationen.py; nutzt denselben Cache in data-prep/cache).
"""

import json
import math
import os
import sys

import networkx as nx
import osmnx as ox

# ── Pfade ──────────────────────────────────────────────────────────────────
SKRIPT_ORDNER = os.path.dirname(os.path.abspath(__file__))       # .../data-prep/05 bereinigen
DATA_PREP_ORDNER = os.path.dirname(SKRIPT_ORDNER)                  # .../data-prep
PROJEKT_ROOT = os.path.dirname(DATA_PREP_ORDNER)                   # Projekt-Root

ox.settings.use_cache = True
ox.settings.cache_folder = os.path.join(DATA_PREP_ORDNER, "cache")


# ── Sammelpunkte je Kapitel ────────────────────────────────────────────────
# name -> (lon, lat). Wiederkehrende Orte stehen genau einmal hier und werden
# in BLOECKE mehrfach referenziert.
#
# Kapitel 10 (Bel-Ami II/2): Die Koordinaten der bereits kapitelübergreifend
# verwendeten Orte (Redaktion, Wohnung 17 Rue Fontaine) sind unverändert aus
# Kapitel 9 übernommen, damit derselbe Ort über Kapitel hinweg denselben Punkt
# behält (das braucht u.a. der Kreisvergleich, siehe baue-kreisvergleich.py).
SAMMELPUNKTE = {
    # Kapitel 03 (Bel-Ami I/3): schon vorher von Hand kuratiert, hier nur
    # nachgezogen — neuer Heimweg-Punkt am Kapitelanfang, Rue Boursault auf
    # die in den Kapiteln 04–07 verwendete Koordinate vereinheitlicht.
    "03": {
        # NEU: Annotationen 0–1 sind der nächtliche Heimweg vom Diner bei
        # Forestier ("Er hatte Lust zu laufen ... beschloß, sofort nach Hause
        # zu gehen"); Annotation 2 kommt in der Rue Boursault an. Punkt auf
        # halber Strecke Rue Fontaine → Rue Boursault; die Route beginnt hier.
        "Heimweg vom Diner bei Forestier": (2.3265, 48.8833),
        # Vereinheitlicht: stand hier auf 2.3198/48.8839, in den Kapiteln
        # 04–07 auf 2.3187925/48.8851901 — 160 m auseinander, dazu unter zwei
        # Namen. Jetzt überall gleich.
        "Georges Duroys Wohnung (Rue Boursault)": (2.3187925, 48.8851901),
        "Boulevard des Batignolles, Paris": (2.32350, 48.88650),
        "Parc Monceau": (2.30960, 48.87960),
        "Unterwegs zu Forestier, Paris": (2.32189, 48.88053),
        "Wohnung Forestier, Paris": (2.33417, 48.88147),
        "Unterwegs (nach dem Besuch bei Forestier), Paris": (2.33741, 48.87868),
        "Bouillon Duval": (2.34065, 48.87590),
        # Stand auf 2.34670/48.87220 — also 6 m neben der Redaktion, die beiden
        # Kreise lagen exakt übereinander. Jetzt auf die Strecke dazwischen.
        "Boulevard (Richtung Redaktion)": (2.3422, 48.8746),
        "Redaktion La Vie Française": (2.34663, 48.87224),
    },
    # Kapitel 05 (Bel-Ami I/5): schon vor dieser Sitzung von Hand kuratiert,
    # hier nur nachgezogen und in drei Punkten korrigiert (siehe BLOECKE).
    # Alle Koordinaten unverändert aus der bestehenden Datei übernommen,
    # ausser den beiden neuen Punkten und dem Sammelbecken (siehe dort).
    "05": {
        "Georges Duroys Wohnung (Rue Boursault)": (2.3187925, 48.8851901),
        "Wohnung Clotilde (Rue de Verneuil)": (2.32918, 48.85798),
        "Café Riche, Boulevard des Italiens, Paris": (2.33840, 48.87160),
        "Fahrende Droschke (nach dem Diner), Paris": (2.33471, 48.86615),
        # NEU: der Triumphgang von der Rue de Verneuil zurück in die
        # Batignolles ("ging dann rasch und siegesgewiß ... seinen Weg
        # zurück"). Punkt auf halber Strecke, Höhe Madeleine/Rue Royale.
        "Heimweg nach der ersten Nacht": (2.3245, 48.8700),
        "Redaktion La Vie Française": (2.34663, 48.87224),
        "Rue de Rome, Paris": (2.32390, 48.87840),
        "Rue Constantinople 127": (2.31921, 48.88037),
        # Korrigiert: 2.34490/48.87410 ist die Rue Bergère, eine Strasse
        # gleichen Namens einen Block südlich — der Geocoder hatte "Folies
        # Bergère" darauf aufgelöst. Das Theater steht seit 1869 an der
        # Adresse 32 Rue Richer, rund 190 m nordwestlich.
        "Folies Bergère": (2.34375, 48.87565),
        "Unterwegs (auf der Suche nach einem Lokal), Paris": (2.34300, 48.88100),
        "Weinstube, äußere Boulevards, Paris": (2.33760, 48.88370),
        "Ballokal 'Weiße Königin', Paris": (2.33950, 48.88450),
        # NEU: "Nun begann eine Reihe von Ausflügen in alle möglichen
        # verdächtigen Lokale, wo sich das einfache Volk amüsiert" — kein
        # einzelnes Lokal, aber sehr wohl eine Gegend: die Fortsetzung von
        # Weinstube und Ballokal an den äusseren Boulevards.
        "Verdächtige Lokale an den äusseren Boulevards": (2.3300, 48.8835),
        "Garküche (unterwegs), Paris": (2.33550, 48.87742),
        "Brauerei (unterwegs), Paris": (2.32575, 48.88195),
        "Fahrende Droschke, Paris": (2.33095, 48.87900),
    },
    "10": {
        "Redaktion La Vie Française": (2.3466305, 48.8722361),
        # Rue Notre-Dame de Lorette selbst — liegt auf dem Fussweg von der
        # Redaktion zur Wohnung; Mitte der Strasse, konsistent mit Kapitel 1s
        # "Lokal mit festen Preisen nahe Rue Notre-Dame de Lorette".
        "Unterwegs zur Wohnung, Rue Notre-Dame de Lorette": (2.3382, 48.8770),
        # "am Ende der Rue Notre Dame de Lorette" = Nordende, Place Saint-Georges
        "Blumenladen, Rue Notre-Dame de Lorette": (2.3374, 48.8785),
        "Wohnung Duroy/Madeleine (17 Rue Fontaine)": (2.3341746, 48.8814675),
        # Hin- UND Rückfahrt derselben Achse — bewusst ein Ort/ein Kreis.
        "Avenue des Champs-Élysées, Paris": (2.30782, 48.8698),
        # "hinter den Befestigungen" (hin) und "an den Stadtbefestigungen
        # vorbei" (zurück) = dieselbe Stelle des Thiers-Walls, Porte Dauphine.
        "Stadtbefestigungen (Porte Dauphine), Paris": (2.2758, 48.8713),
        "Bois de Boulogne, Paris": (2.2695, 48.8697),
        "Weg um die Seen, Bois de Boulogne": (2.2585, 48.8628),
        "See im Bois de Boulogne": (2.2596, 48.8646),
        "Rückfahrt durch den Bois de Boulogne": (2.2662, 48.8670),
        "Arc de Triomphe, Place de l'Étoile": (2.2950, 48.8738),
        "Café-Chantant am Boulevard des Capucines": (2.3288, 48.8703),
        "Café Tortoni, Boulevard des Italiens": (2.3372, 48.8716),
    },
    # Kapitel 11 (Bel-Ami II/3): Redaktion, Wohnung, Wohnung Clotilde und
    # Boulevard Malesherbes mit denselben Koordinaten wie in den Kapiteln
    # 05/06/07/09/13 — derselbe Ort behält über Kapitel hinweg denselben Punkt.
    "11": {
        "Redaktion La Vie Française": (2.3466305, 48.8722361),
        "Wohnung Duroy/Madeleine (17 Rue Fontaine)": (2.3341746, 48.8814675),
        "Wohnung Clotilde (Rue de Verneuil)": (2.32918, 48.85798),
        # Der Text lokalisiert das Schaufenster nicht — der Punkt liegt auf
        # dem Fussweg von der Rue de Verneuil zur Wohnung (Seine-Übergang
        # Concorde), also dort, wo der Gang tatsächlich verläuft.
        "Unterwegs, Schaufenster eines Photographen": (2.3213, 48.8656),
        "Boulevard Malesherbes (Walters Haus)": (2.32237, 48.87132),
        # Rivals Junggesellenwohnung MIT Fechtkeller. Der Text nennt keine
        # Adresse, aber das Preisfechten findet "zugunsten der Waisenkinder
        # des 6. Stadtbezirks von Paris" in seinem eigenen Fechtsaal statt —
        # daher hier ins 6. Arrondissement gesetzt (Saint-Sulpice/Tournon)
        # statt auf die reine Geocoder-Notlösung 2.328/48.876, die in
        # kapitel07-stationen.json als "nicht näher lokalisiert" steht und
        # keinerlei Textgrundlage hat. Siehe Sitzungsnotiz — falls die
        # Zuordnung anders gewünscht ist, genügt es, diese Zeile zu ändern.
        "Junggesellenwohnung Jacques Rival": (2.3345, 48.8510),
        "Heimfahrt im Landauer, Paris": (2.3358, 48.8628),
        "Telegraphenbüro, Paris": (2.3300, 48.8712),
        "Fahrt im Wagen mit Frau Walter, Paris": (2.3295, 48.8768),
        "Fahrt im Wagen mit Clotilde, Paris": (2.3300, 48.8645),
    },
    # Kapitel 12 (Bel-Ami II/4): das Rendezvous in der Trinité, der
    # Ministersturz, der Parc Monceau, die Rue de Constantinople.
    "12": {
        # Platz und Kircheninneres sind hier bewusst zwei Sammelpunkte: die
        # ersten neun Annotationen spielen ausschliesslich draussen (Julihitze,
        # Springbrunnen, Hund, Bänke), Annotation 9 ist der ausdrückliche
        # Schwellenübertritt ("ging hinein"), Annotation 10 registriert sofort
        # den Temperatursturz. Der Platz liegt südlich vor der Kirche.
        "Platz vor der Trinité-Kirche": (2.3323, 48.8757),
        "Église de la Trinité (Innenraum)": (2.3320, 48.8770),
        "Redaktion La Vie Française": (2.3466305, 48.8722361),
        "Wohnung Duroy/Madeleine (17 Rue Fontaine)": (2.3341746, 48.8814675),
        "Parc Monceau, Paris": (2.30890, 48.87960),
        # Auf dem Boulevard de Courcelles zwischen dem Parktor ("das Tor, das
        # auf den äußeren Boulevard führt") und der Rue de Constantinople.
        "Fahrt in der Droschke, Paris": (2.3140, 48.8802),
        "Rue Constantinople 127": (2.31921, 48.88037),
    },
    # Kapitel 13 (Bel-Ami II/5): Herbst, Marokko-Coup, der Tag zwischen
    # Frau Walter und Clotilde, Vaudrecs Sterben.
    "13": {
        "Wohnung Duroy/Madeleine (17 Rue Fontaine)": (2.3341746, 48.8814675),
        # Der Text nennt keine Adresse — nur, dass der Aussenminister dort mit
        # seiner Frau frühstückt, bevor um zwölf der Ministerrat tagt. Als
        # Amtswohnung des Ministers des Äussern hier ans Quai d'Orsay gesetzt;
        # die Alternative wäre ein reiner Phantasiepunkt ohne Aussage.
        "Wohnung Laroche-Mathieu (Quai d'Orsay)": (2.3175, 48.8615),
        "Redaktion La Vie Française": (2.3466305, 48.8722361),
        # Der ganze Sechs-Wochen-Rückblick auf Frau Walter fällt in EINEN Gang
        # quer durch Paris — Annotation 85 hält ihn ausdrücklich fest ("Er las
        # es im Gehen noch einmal durch"). Punkt auf der Gehstrecke von der
        # Redaktion zur Rue Constantinople.
        "Unterwegs zur Junggesellenwohnung": (2.3255, 48.8785),
        "Rue Constantinople 127": (2.31921, 48.88037),
        # "bis zum äußeren Boulevard, dann ... den Boulevard Malesherbes
        # entlang" — also dort, wo Malesherbes den Boulevard de Courcelles
        # kreuzt, stadteinwärts.
        "Kuchenbäckerei am Boulevard Malesherbes": (2.3122, 48.8801),
        # "Er ging langsam den Boulevard herunter" — von der Rue de
        # Constantinople Richtung Rue Drouot, also über die Grands Boulevards.
        # Genauer verortet über Kapitel 14: dort führt Du Roy Madeleine zu
        # DEMSELBEN Schaufenster ("in dessen Schaufenster er den Chronometer
        # bewundert hatte") und gleich danach kommen sie am Vaudeville vorbei,
        # das an der Ecke Chaussée d'Antin/Boulevard des Capucines stand. Der
        # Laden liegt also auf den Capucines, nicht auf dem Haussmann.
        "Juwelierladen am Boulevard des Capucines": (2.3270, 48.8700),
        "Rue Drouot, Paris": (2.3396, 48.8730),
        "Wohnhaus Graf de Vaudrec, Chaussée d'Antin": (2.3323, 48.8738),
    },
    # Kapitel 14 (Bel-Ami II/6): Vaudrecs Begräbnis, das Testament, die
    # Schenkung, der Einkauf beim Juwelier.
    "14": {
        # Die Kirche wird nicht genannt. Vaudrec wohnt in der Chaussée d'Antin
        # (Kapitel 13) — das ist Trinité-Pfarrei, und die Trinité ist im Projekt
        # bereits mit Kapitel 12 gesetzt. Koordinate identisch mit dort.
        "Trauerfeier für Vaudrec (Église de la Trinité)": (2.3320, 48.8770),
        "Wohnung Duroy/Madeleine (17 Rue Fontaine)": (2.3341746, 48.8814675),
        # Maupassants "17, rue des Vosges" — eine Rue des Vosges gibt es in
        # Paris nicht, gemeint ist die Place des Vosges im Marais.
        "Notariat Lamaneur, 17 Rue des Vosges": (2.36550, 48.85550),
        # "bei dem schönen Wetter einen Spaziergang" — der Weg vom Marais zu
        # den Grands Boulevards, Punkt auf halber Strecke (Höhe Châtelet).
        "Spaziergang nach der Schenkung": (2.3470, 48.8650),
        # Derselbe Laden wie in Kapitel 13, gleicher Name = ein Ort über beide
        # Kapitel hinweg.
        "Juwelierladen am Boulevard des Capucines": (2.3270, 48.8700),
        "Théâtre du Vaudeville, Boulevard des Capucines": (2.3315, 48.8709),
        "Wohnung Clotilde (Rue de Verneuil)": (2.32918, 48.85798),
    },
    # Kapitel 15 (Bel-Ami II/7): der Empfang im neu gekauften Palais Walter.
    # Das konzentrierteste Kapitel bisher — drei Sammelpunkte auf 177
    # Annotationen.
    "15": {
        "Wohnung Duroy/Madeleine (17 Rue Fontaine)": (2.3341746, 48.8814675),
        # "das schönste Schloss im Faubourg-Saint-Honoré, mit einem Garten
        # nach den Champs-Elysées" — also eines der Hôtels zwischen Rue du
        # Faubourg-Saint-Honoré und Avenue Gabriel, wie das Élysée selbst.
        # Die alte Koordinate (2.33035/48.86520, Höhe Tuilerien) stammte aus
        # der Geocodierung und passte zu keiner der beiden Angaben.
        "Palais Walter, Faubourg Saint-Honoré": (2.3160, 48.8712),
        # Der Garten ist hier ein eigener Sammelpunkt, nicht bloss ein Raum:
        # Annotation 122 "endlich war er im Garten", 123 "Die kalte Luft
        # durchschauerte ihn wie ein eiskaltes Bad" — derselbe Innen/Aussen-
        # Kontrast wie Platz und Kirche in Kapitel 12. Die Gärten dieser
        # Hôtels reichen rund 350 m bis zur Avenue Gabriel hinunter.
        "Garten des Palais Walter": (2.3148, 48.8680),
    },
    # Kapitel 16 (Bel-Ami II/8): der Winter bei den Walters, die Erklärung an
    # Suzanne, der Ehebruch-Überfall in der Rue des Martyrs.
    "16": {
        # Dasselbe Haus wie in Kapitel 15, gleiche Koordinate. Die alte
        # Geocodierung (2.33460/48.87960) lag im Quartier der Rue des Martyrs
        # und widersprach dem Faubourg Saint-Honoré aus Kapitel 15.
        "Palais Walter, Faubourg Saint-Honoré": (2.3160, 48.8712),
        "Wohnung Duroy/Madeleine (17 Rue Fontaine)": (2.3341746, 48.8814675),
        "Place Notre-Dame-de-Lorette": (2.3385, 48.8762),
        "Restaurant Coq-Faisan, Rue Lafayette": (2.34370, 48.87620),
        "Wohnung des Polizeikommissars, Rue La Rochefoucauld": (2.33300, 48.87890),
        # Der Text nennt nur "die Polizeiwache". Der Kommissar wohnt in der
        # Rue La Rochefoucauld, also 9. Arrondissement — dessen Kommissariat
        # sass bei der Mairie in der Rue Drouot. Erklärt auch den Umweg nach
        # Süden und zurück, den Annotation 50 beschreibt.
        "Polizeiwache (Mairie du 9e, Rue Drouot)": (2.3395, 48.8730),
        "Rue des Martyrs (möblierte Wohnung)": (2.33933, 48.87964),
        "Redaktion La Vie Française": (2.3466305, 48.8722361),
    },
    # Kapitel 17 (Bel-Ami II/9): der Landpartie-Donnerstag nach Saint-Germain,
    # die Entführung Suzannes, die Nacht der Frau Walter vor dem Christusbild.
    "17": {
        "Palais Walter, Faubourg Saint-Honoré": (2.3160, 48.8712),
        # Annotation 5 nennt beide Achsen in einem Satz — ein Punkt zwischen
        # Avenue (Kapitel 10: 2.30782/48.8698) und Bois (2.2695/48.8697).
        "Fahrt über die Champs-Élysées und durch das Bois": (2.2850, 48.8690),
        # Die ganze Landpartie ausserhalb der Stadt — Bougival und Pecq, das
        # Frühstück im Pavillon Henri IV, die Terrasse von Le Nôtre, die
        # Rückfahrt über Chatou — sammelt sich an EINEM Punkt am Westrand des
        # Bois, kurz vor dem Seineübergang bei Suresnes. Das ist dieselbe
        # Konvention wie Cannes in Kapitel 8 und die Rouen-Reise in Kapitel 9:
        # die auswärtige Etappe wächst dort, wo die Stadt verlassen wird.
        # Vorher standen hier drei einzelne Stationen bis Saint-Germain, 14,6 km
        # westlich der Kartenkante.
        "Fahrt über die Seine nach Saint-Germain und zurück": (2.2400, 48.8720),
        # Nach der Scheidung wohnt er wieder in seiner Junggesellenwohnung —
        # kapitel18-stationen.json beginnt dort ("Rue Constantinople 127"),
        # und die Wohnung Rue Fontaine war Madeleines (Forestiers) gewesen.
        # Die alte Zuordnung "Rue Boursault" ist die Adresse aus Kapitel 3–5.
        "Wohnung Du Roy (Rue Constantinople 127)": (2.31921, 48.88037),
        "Place de la Concorde (Droschke vor dem Marineministerium)": (2.3212, 48.8656),
        # "Wir fahren mit diesem Wagen nach Sevres" — Sèvres selbst wird nur
        # angekündigt, nie gezeigt; der Punkt liegt auf der Ausfahrtstrecke.
        "Fahrt aus Paris Richtung Sèvres": (2.2750, 48.8480),
        # Ferne Etappe, 65 km seineabwärts. Nach der Projektkonvention (wie
        # Cannes in Kapitel 8, Rouen in Kapitel 9) bekommt sie keine echte
        # Koordinate, sondern einen Ersatzpunkt DORT, WO DIE STADT VERLASSEN
        # WIRD — 335 m hinter dem Sèvres-Ausfahrtspunkt, in derselben
        # Fahrtrichtung. Dieselbe Distanz wie Cannes zum Gare de Lyon und die
        # Rouen-Reise zum Gare Saint-Lazare. Vorher stand der Punkt bei
        # 2.1480/48.8995 und lag als einziger ausserhalb des Basisbilds.
        "La Roche-Guyon an der Seine": (2.271031, 48.846488),
    },
    # Kapitel 18 (Bel-Ami II/10, Schlusskapitel): die letzte Szene mit
    # Clotilde in der Junggesellenwohnung, dann die Hochzeit in der Madeleine.
    # Zwei Sammelpunkte auf 109 Annotationen — das ganze Kapitel spielt an
    # genau diesen beiden Orten.
    "18": {
        "Rue Constantinople 127": (2.31921, 48.88037),
        # Vorplatz/Freitreppe (Annotationen 30–34 und 101–108) und Innenraum
        # sind hier bewusst NICHT getrennt: die Stufen liegen 85 m vom
        # Kirchenmittelpunkt, der kleinere Kreis läge vollständig im grösseren
        # (anders als Platz und Kirche in Kapitel 12, die 130 m trennen und
        # auf einer viermal feineren Karte liegen).
        "Église de la Madeleine, Paris": (2.32454, 48.87013),
    },
}

# Laufende Blockfolge je Kapitel: (erster revealIndex des Blocks, Sammelpunkt).
# Der Block endet jeweils vor dem nächsten Eintrag; der letzte Block läuft bis
# zur letzten Annotation. Der Kommentar hinter jedem Eintrag nennt die
# Textstelle, an der die Zuordnung hängt.
BLOECKE = {
    "03": [
        (0,   "Heimweg vom Diner bei Forestier"),                 # 0 "Er hatte Lust zu laufen, zu träumen" / 1 der Entschluss, nach Hause zu gehen — Routenbeginn
        (2,   "Georges Duroys Wohnung (Rue Boursault)"),          # 2 "gelangte endlich in die Rue Boursault" bis 52 — die Erinnerungen an Canteleu und das erträumte Liebesabenteuer werden am Schreibtisch gedacht und zählen deshalb hierher
        (53,  "Boulevard des Batignolles, Paris"),                # 53 "Als er auf der Straße war" → Go / 54 "unter den Bäumen der äußeren Boulevards"
        (56,  "Parc Monceau"),                                    # 56 "Er erreichte den Park Monceau" bis 60
        (61,  "Unterwegs zu Forestier, Paris"),                   # 61 "Er stand auf, setzte seinen Weg fort und dachte dabei an Forestier"
        (62,  "Wohnung Forestier, Paris"),                        # 62 an der Haustür bis 99 — Madeleine diktiert den Artikel, Vaudrec tritt ein
        (100, "Unterwegs (nach dem Besuch bei Forestier), Paris"), # 100 "Auch auf der Straße fühlte er sich bedrückt" bis 105
        (106, "Bouillon Duval"),                                  # 106 "Er ging in die Bouillon Duval frühstücken"
        (107, "Boulevard (Richtung Redaktion)"),                  # 107 "Dann trieb er sich auf dem Boulevard herum"
        (108, "Redaktion La Vie Française"),                      # 108 "Punkt drei Uhr stieg er die große prunkhafte Treppe zur Vie Française hinauf" bis 152
    ],
    "05": [
        (0,   "Georges Duroys Wohnung (Rue Boursault)"),
        (11,  "Wohnung Clotilde (Rue de Verneuil)"),
        (50,  "Georges Duroys Wohnung (Rue Boursault)"),          # 50 "Er wartete mit wachsender Ungeduld auf den verabredeten Tag" / 51 der geliehene Frackanzug
        (52,  "Café Riche, Boulevard des Italiens, Paris"),        # 52 "Er erschien als erster einige Minuten vor der Zeit" — das Diner zu viert im Separé
        (92,  "Fahrende Droschke (nach dem Diner), Paris"),        # 92 die Heimfahrt, in der die Affäre beginnt
        (101, "Wohnung Clotilde (Rue de Verneuil)"),               # 101 "die Droschke hielt schon nach kurzer Zeit vor dem Hause, wo sie wohnte" bis 107 — Hauseingang, Hausflur
        # KORREKTUR 1: 108–112 lagen bisher auf der Wohnung Rue Boursault,
        # spielen aber ausdrücklich auf der Strasse ("ging dann rasch und
        # siegesgewiß ... seinen Weg zurück", "Endlich hatte er eine Frau
        # gefunden") — derselbe Fall wie der Heimweg in Kapitel 11/13.
        (108, "Heimweg nach der ersten Nacht"),                    # 108 "Er gab dem Kutscher fünf Francs" → Go, bis 112 die Vision der Frauen auf goldenen Wolken
        (113, "Georges Duroys Wohnung (Rue Boursault)"),           # 113 "Und auch sein Schlaf war reich von solchen Träumen"
        (114, "Wohnung Clotilde (Rue de Verneuil)"),               # 114 "als er die Treppe zur Wohnung der Madame de Marelle hinaufstieg" bis 141
        # KORREKTUR 2: Annotation 140 ("brach er auf, um auf die Redaktion zu
        # gehen") lag auf der Redaktion, 141 ("Auf der Treppe flüsterte er
        # nochmals durch die halboffene Tür") aber wieder bei Clotilde — die
        # Route fuhr dadurch zweimal grundlos quer durch Paris. Beide gehören
        # zu ihrem Haus; die Redaktion beginnt erst mit 142.
        (142, "Redaktion La Vie Française"),                       # 142 "Sobald er seine Tagesarbeit erledigt hatte, überlegte er sich, wie er sein Zimmer ausschmücken sollte"
        (143, "Georges Duroys Wohnung (Rue Boursault)"),           # 143 die japanischen Bildchen, das Zimmer wie eine bemalte Papierlaterne, bis 151
        (152, "Rue de Rome, Paris"),                               # 152 "begleitete er sie zu einer Droschkenhaltestelle in der Rue de Rome" bis 154
        (155, "Georges Duroys Wohnung (Rue Boursault)"),           # 155 "Drei Wochen lang besuchte Frau de Marelle jeden zweiten oder dritten Tag ihren Freund" bis 164
        (165, "Rue Constantinople 127"),                           # 165 die gemietete Wohnung, bis 179
        (180, "Folies Bergère"),
        (181, "Unterwegs (auf der Suche nach einem Lokal), Paris"),
        (188, "Weinstube, äußere Boulevards, Paris"),
        (200, "Ballokal 'Weiße Königin', Paris"),
        # KORREKTUR 3: 206–225 lagen gemeinsam im Sammelbecken "Unbestimmt".
        # Die erste Hälfte hat sehr wohl einen Ort (die Lokalrunde an den
        # äusseren Boulevards, direkte Fortsetzung der beiden Blöcke davor),
        # nur die zweite ist wirklich ortlos (seine Armut, der 14. Dezember).
        (206, "Verdächtige Lokale an den äusseren Boulevards"),    # 206 "Nun begann eine Reihe von Ausflügen in alle möglichen verdächtigen Lokale" bis 225 — auch die Geldnot gehört hierher: Annotation 218 knüpft sie ausdrücklich an diese Ausflüge
        (226, "Redaktion La Vie Française"),                       # 226 "arbeitete den Nachmittag in der Redaktion" bis 236 — die geborgten zehn Francs von Foucart
        (237, "Garküche (unterwegs), Paris"),                      # 237 "Er aß in einer Garküche, wo er in den schlimmsten Tagen seiner Armut oft einkehrte"
        (238, "Georges Duroys Wohnung (Rue Boursault)"),           # 238 "Um neun Uhr saß er im Salon am Kamin und erwartete seine Geliebte" bis 269
        (270, "Brauerei (unterwegs), Paris"),                      # 270 "Dann ging er aus, in der Hoffnung, daß auf der Straße ihm irgendein guter Einfall kommen würde" → Go, bis 273
        (274, "Redaktion La Vie Française"),
        (276, "Georges Duroys Wohnung (Rue Boursault)"),
        (291, "Folies Bergère"),
        (310, "Fahrende Droschke, Paris"),
    ],
    "10": [
        # ── Rückkehr nach Paris, Abendgang zur Wohnung ────────────────────
        (0,   "Redaktion La Vie Française"),                    # 0 Rückkehr nach Paris / 1 "hatte seine alte Tätigkeit wieder aufgenommen"
        (2,   "Unterwegs zur Wohnung, Rue Notre-Dame de Lorette"),  # 2 "Er ging abends ... nach der Wohnung seines Vorgängers" → Go
        (4,   "Blumenladen, Rue Notre-Dame de Lorette"),        # 4 "an einem Blumenladen am Ende der Rue Notre Dame de Lorette"
        (6,   "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 6 Treppenhaus/Spiegel bis 34 Schlafzimmer (Diner Vaudrec, Arbeitszimmer)
        # ── Der Artikel, die Zeitung, die politische Öffentlichkeit ───────
        (35,  "Redaktion La Vie Française"),                    # 35 "Der Artikel erschien" bis 41 Wirkung in Presse/politischen Kreisen
        (42,  "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 42 "Wenn er nach Hause kam, fand er stets in seinem Salon" bis 55 (Laroche-Mathieu dienstags in der Rue Fontaine)
        (56,  "Redaktion La Vie Française"),                    # 56 "Du Roys Kollegen ihn zu necken begannen" bis 68 (Bilboquetschrank, verletzte Eitelkeit)
        (69,  "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 69 "Und auch zu Hause ..." bis 90 (Eifersucht auf den Toten, Ende Juni am Fenster)
        # ── Nächtliche Ausfahrt in den Bois de Boulogne ───────────────────
        (91,  "Avenue des Champs-Élysées, Paris"),              # 91 "Sie nahmen einen offenen Wagen und fuhren über die Champs Elysée" → Go, bis 100
        (101, "Stadtbefestigungen (Porte Dauphine), Paris"),    # 101 "Als sie hinter den Befestigungen an einer Kurve vorbeifuhren, küßten sie sich"
        (102, "Bois de Boulogne, Paris"),                       # 102 "Als sie in den Wald hineinfuhren"
        (103, "Weg um die Seen, Bois de Boulogne"),             # 103 "Auf dem Wege um die Seen" bis 116 — Förster/Forestier, die Eifersuchtsszene
        (117, "See im Bois de Boulogne"),                       # 117 "Die Droschke fuhr jetzt an dem See entlang" / 118 zwei Schwäne
        (119, "Rückfahrt durch den Bois de Boulogne"),          # 119 "Umkehren!" → Go, bis 131 (Wut, Eifersucht, "Dem Starken gehört die Welt")
        # ── Heimfahrt in die Stadt ────────────────────────────────────────
        (132, "Stadtbefestigungen (Porte Dauphine), Paris"),    # 132 "Er kam an den Stadtbefestigungen vorbei" bis 136 (roter Schimmer, Atem von Paris)
        (137, "Arc de Triomphe, Place de l'Étoile"),            # 137 "Am Eingange der Stadt wurde der Triumphbogen ... sichtbar" / 138
        (139, "Avenue des Champs-Élysées, Paris"),              # 139 "fuhren nun wieder in der langen Reihe der heimkehrenden Wagen" bis 143
        (144, "Café-Chantant am Boulevard des Capucines"),      # 144 Seitenblick / 145 "Gasgirlande vor einem Café-Chantant" bis 147
        (148, "Café Tortoni, Boulevard des Italiens"),          # 148 "beim Aussteigen aus dem Wagen" / 149 "bei Tortoni ein Eis essen"
    ],
    "11": [
        # ── Der Name Forestier ist erledigt, Clotilde kehrt zurück ────────
        (0,   "Redaktion La Vie Française"),                    # 0 "Als Du Roy am nächsten Morgen auf die Redaktion kam" bis 3 "Niemand nannte ihn mehr Forestier" (die Besorgungen in Ann. 2 führen zurück — kein Ortswechsel)
        (4,   "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 4 "Als er nach Hause kam, hörte er Frauenstimmen im Salon" — Besuch Frau Walter/Clotilde, danach das Gespräch mit Madeleine, bis 28
        (29,  "Wohnung Clotilde (Rue de Verneuil)"),            # 29 "begab er sich tatsächlich nach der Rue de Verneuil" bis 42 — die Rue de Constantinople wird nur besprochen, nicht betreten
        (43,  "Unterwegs, Schaufenster eines Photographen"),    # 43 "Du Roy verließ sie" → Go / 44 das Photographenschaufenster erinnert ihn an Frau Walter, bis 46
        # ── Donnerstag: das Preisfechten bei Rival ────────────────────────
        (47,  "Boulevard Malesherbes (Walters Haus)"),          # 47 "nahm einen offenen Landauer und fuhr, Frau Walter abzuholen" bis 51
        (52,  "Junggesellenwohnung Jacques Rival"),             # 52 "Vor Rivals Wohnung stand eine Wagenreihe" bis 136 — Büfett, Kellertreppe, Fechtkeller, Ball im Obergeschoss, Abrechnung
        (137, "Heimfahrt im Landauer, Paris"),                  # 137 "wartete auf seinen Landauer" → Go / 138–140 Frau Walters Blicke auf der Heimfahrt
        (141, "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 141 "Er kam sehr vergnügt nach Hause" bis 150 — Marokko, Laroche-Mathieu, die neue Waffe gegen Madeleine
        # ── Die Liebeserklärung an Frau Walter ───────────────────────────
        (151, "Boulevard Malesherbes (Walters Haus)"),          # 151 "ging er etwas früher hin" / 152 "Um zwei Uhr war er auf dem Boulevard Malesherbes" bis 163 — Kniefall, Flucht, Treppe hinab
        (164, "Telegraphenbüro, Paris"),                        # 164 "Er ging auf ein Telegraphenbureau und schickte Clotilde ein blaues Briefchen"
        (165, "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 165 "Als er zur gewohnten Stunde heimkehrte" bis 174 — das Diner mit Frau Walter, Clotilde, Laroche-Mathieu
        (175, "Fahrt im Wagen mit Frau Walter, Paris"),         # 175 "Kaum waren sie im Wagen" → Go, bis 179 — das Drängen auf ein Rendezvous
        (180, "Boulevard Malesherbes (Walters Haus)"),          # 180 "da der Wagen schon vor ihrer Tür hielt" — die Trinité wird nur verabredet, nicht betreten / 181 sie steigt aus
        (182, "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 182 "»Ich mußte ein wichtiges Telegramm aufgeben«" — zurück beim eigenen Diner, bis 186
        (187, "Fahrt im Wagen mit Clotilde, Paris"),            # 187 "Der Wagen schaukelte wie ein Boot" / 188 Schlussbild — er denkt an Frau Walter
    ],
    "12": [
        # ── Das Rendezvous in der Trinité ─────────────────────────────────
        (0,   "Platz vor der Trinité-Kirche"),                  # 0 "lag menschenleer in der glühenden Julisonne" bis 8 — Hitze über Paris, Springbrunnen, Hund, Warten auf die Uhr
        (9,   "Église de la Trinité (Innenraum)"),              # 9 "ging hinein" → Go / 10 "Die kühle Kellerluft des steinernen Gewölbes umfing ihn" bis 73 — Frau Walter, der Betstuhl, der dicke Herr, der Beichtstuhl
        (74,  "Platz vor der Trinité-Kirche"),                  # 74 "kam pfeifend aus der Kirche heraus" bis 77 — Portal, Platz, Gruss an den dicken Herrn
        # ── Der Ministersturz ─────────────────────────────────────────────
        (78,  "Redaktion La Vie Française"),                    # 78 "begab er sich auf die Redaktion der Vie Française" bis 89 — Marokko, Laroche-Mathieu wird Aussenminister, der alte Algerien-Artikel
        (90,  "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 90 "Als Du Roy zum Essen nach Hause kam" bis 97 — das Telegramm bestellt ihn in den Parc Monceau (nur angekündigt, noch kein Ort)
        # ── Parc Monceau und die Rue de Constantinople ────────────────────
        (98,  "Parc Monceau, Paris"),                           # 98 "erschien tags darauf pünktlich zu seinem Rendezvous" bis 104 — Bänke, Kindermädchen, die Ruine mit der Quelle, der Vorschlag mit der Droschke
        (105, "Fahrt in der Droschke, Paris"),                  # 105 "Er ging mit schnellen Schritten davon" → Go / 106–108 im Wagen, er hat dem Kutscher die Rue de Constantinople genannt
        (109, "Rue Constantinople 127"),                        # 109 "Der Wagen hielt und Du Roy öffnete die Tür" bis 118 — der Weinhändler, das Erdgeschosszimmer, das Kapitelende
    ],
    "13": [
        # ── Herbst: der Aufstieg des Hauses Du Roy ────────────────────────
        (0,   "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 0 "Der Herbst war gekommen" bis 23 — Marokko, "Der Salon Madeleines war zu einem einflußreichen Mittelpunkt geworden", der Morgen der Kammereröffnung, "Dann ging er fort"
        (24,  "Wohnung Laroche-Mathieu (Quai d'Orsay)"),        # 24 "Dann ging er fort" → Go / 25 "Herr Laroche-Mathieu erwartete ihn bereits" bis 35 — das Frühstück beim Aussenminister
        (36,  "Redaktion La Vie Française"),                    # 36 "Du Roy ging langsam auf die Redaktion" bis 40 — dort die Depesche Frau Walters
        (41,  "Unterwegs zur Junggesellenwohnung"),             # 41 "verließ er sofort die Redaktion" → Go, bis 90 — der ganze Rückblick auf Frau Walters Liebe fällt in diesen einen Gang (85: "Er las es im Gehen noch einmal durch")
        (91,  "Rue Constantinople 127"),                        # 91 "Er trat ein, um auf Frau Walter zu warten" bis 124 — der Marokko-Coup, die 70000 Francs, die Haare um die Westenknöpfe
        (125, "Kuchenbäckerei am Boulevard Malesherbes"),       # 125 "Sie trennten sich" → Go / 126–129 die kandierten Kastanien für Clotilde
        (130, "Rue Constantinople 127"),                        # 130 "Um vier war er wieder zurück" bis 150 — Clotilde findet das Haar, die Ohrfeige, seine Wut
        # ── Der Heimweg, auf dem Vaudrec dazwischenkommt ──────────────────
        (151, "Juwelierladen am Boulevard des Capucines"),      # 151 "Dann ging er auch hinaus" → Go / 152 "blieb vor einem Juwelierladen stehen" — der Chronometer, der 70000-Francs-Tagtraum, bis 155
        (156, "Rue Drouot, Paris"),                             # 156 "schlug er den Weg nach Hause ein" / 157 "Als er die Rue Drouot erreichte, blieb er plötzlich stehen" / 158 er erinnert sich an Vaudrec
        (159, "Wohnhaus Graf de Vaudrec, Chaussée d'Antin"),    # 159 "Er kehrte langsam um" → Go / 161 "Im Hause, wo Graf de Vaudrec wohnte, fragte er den Portier" — Vaudrec liegt im Sterben
        (163, "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 163 "nahm eine Droschke und fuhr nach Hause" bis 168 — Madeleine fährt zu Vaudrec, er schreibt den Artikel
        (169, "Redaktion La Vie Française"),                    # 169 "Dann brachte er das Manuskript auf die Redaktion, plauderte da mit seinem Chef"
        (170, "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 170 der Rückweg / 171 "Seine Frau war noch nicht zurück" bis 181 — Mitternacht, das Schlafzimmer, das Kapitelende
    ],
    "14": [
        # ── Begräbnis und Testament ──────────────────────────────────────
        (0,   "Trauerfeier für Vaudrec (Église de la Trinité)"),# 0 "Die Kirche war ganz mit Schwarz bezogen" / 1 die Gäste am Sarg
        (2,   "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 2 "Als Georges Du Roy und seine Frau die Kirche verlassen hatten, gingen sie langsam ... nach Hause" → Go / 5 der Brief des Notars, bis 7
        (8,   "Notariat Lamaneur, 17 Rue des Vosges"),          # 8 "machten sie sich auf den Weg" → Go / 9 "Als sie in das Bureau des Herrn Lamaneur kamen" — das Testament, bis 17
        (18,  "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 18 "Sobald sie nach Hause gekommen waren, schloß Du Roy heftig die Tür" bis 42 — das Verhör, die Teilung der Million
        (43,  "Notariat Lamaneur, 17 Rue des Vosges"),          # 43 "Am folgenden Tag unterzeichneten sie eine Schenkung zu Lebzeiten"
        # ── Der Nachmittag der frischgebackenen Millionäre ───────────────
        (44,  "Spaziergang nach der Schenkung"),                # 44 "als sie das Bureau verlassen hatten, schlug Georges ... einen Spaziergang" → Go / 46 "Es war ein kühler Herbsttag", bis 47
        (48,  "Juwelierladen am Boulevard des Capucines"),      # 48 "vor den Laden, in dessen Schaufenster er den Chronometer bewundert hatte" bis 56 — Armband, Chronometer, Baronskrone
        (57,  "Théâtre du Vaudeville, Boulevard des Capucines"),# 57 "Sie gingen am Vaudeville vorbei" / 58 sie nehmen eine Loge
        (59,  "Wohnung Clotilde (Rue de Verneuil)"),            # 59 "Sie gingen hin" — die de Marelles werden zum Abend geholt
        (60,  "Théâtre du Vaudeville, Boulevard des Capucines"),# 60 "Das Diner war lustig und der Abend entzückend"
        (61,  "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 61 "kamen spät nach Hause zurück" bis 66 — das dunkle Treppenhaus, der Spiegel, "Da gehen die beiden Millionäre!"
    ],
    "15": [
        # ── Der Aufstieg Walters, von Du Roys Haus aus gesehen ────────────
        (0,   "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 0 "Seit zwei Monaten war die Eroberung Marokkos vollzogen" bis 36 — Walters Palastkauf, das Gemälde, die Einladungen, Du Roys Neid, "Es wird wohl trotzdem besser sein"
        # ── Die Soiree vom 30. Dezember ──────────────────────────────────
        (37,  "Palais Walter, Faubourg Saint-Honoré"),          # 37 "noch in der Droschke" → Go / 38 die Hofeinfahrt bis 121 — Vorhalle, fünf Salons, Wintergarten, das Markowitsch-Bild, Speisesaal, Büfett
        (122, "Garten des Palais Walter"),                      # 122 "endlich war er im Garten" bis 139 — das Rendezvous mit Frau Walter in der Kälte, das Päckchen Briefe
        (140, "Palais Walter, Faubourg Saint-Honoré"),          # 140 "trat er stolz und lächelnd in den Wintergarten ein" bis 151 — die Säle leeren sich
        (152, "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 152 "Während sie nach Hause fuhren" → Go / 153 das Kreuz der Ehrenlegion bis 164
        # ── Das Diner am Neujahrstag ─────────────────────────────────────
        (165, "Palais Walter, Faubourg Saint-Honoré"),          # 165 "Als sie erschienen, saß Frau Walter allein in dem kleinen Louis-XVI-Boudoir" bis 176 — vor dem Bild, die Ähnlichkeit mit dem Christus
    ],
    "16": [
        # ── Winter bei den Walters, die Erklärung am Fischbecken ─────────
        (0,   "Palais Walter, Faubourg Saint-Honoré"),          # 0 "In der zweiten Hälfte des Winters ging das Ehepaar Du Roy oft zu den Walters" bis 25 — die Verlobungen, das Füttern der chinesischen Fische, die Erklärung an Suzanne, "eilte hinaus"
        (26,  "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 26 "Er ging in voller Ruhe nach Hause" bis 31 — die Überwachung Madeleines, "Am Freitag zog er sich frühzeitig an"
        # ── Der Freitag: Falle, Kommissar, Rue des Martyrs ───────────────
        (32,  "Place Notre-Dame-de-Lorette"),                   # 32 "suchte sich eine Droschke auf der Place Notre Dame de Lorette"
        (33,  "Wohnung Duroy/Madeleine (17 Rue Fontaine)"),     # 33 "halten Sie gegenüber der Nummer 17" bis 38 — er belauert im geschlossenen Wagen die eigene Haustür, bis Madeleine herauskommt
        (39,  "Restaurant Coq-Faisan, Rue Lafayette"),          # 39 "setzte ihn vor dem Coq-Faisan ab" bis 41 — er isst in aller Ruhe und sieht auf die Uhr
        (42,  "Wohnung des Polizeikommissars, Rue La Rochefoucauld"), # 42 "ließ sich nach der Rue La Rochefoucauld fahren" bis 49 — die Frist bis neun Uhr, der dreifarbene Gurt unterm Überrock
        (50,  "Polizeiwache (Mairie du 9e, Rue Drouot)"),       # 50 "Sie fuhren zuerst nach der Polizeiwache und nahmen drei Schutzleute in Zivil mit"
        (51,  "Rue des Martyrs (möblierte Wohnung)"),           # 51 "die Droschke, die nach der Rue des Martyrs fuhr" → Go, bis 96 — das Warten auf der Strasse, die aufgebrochene Tür, Laroche-Mathieu im Bett, "ich bin hier beinahe zu Hause"
        (97,  "Redaktion La Vie Française"),                    # 97 "Eine Stunde später erschien Du Roy im Redaktionsbureau" bis 115 — "Ich habe eben den Minister des Äußeren gestürzt"
    ],
    "17": [
        # ── Die Landpartie nach Saint-Germain ────────────────────────────
        (0,   "Palais Walter, Faubourg Saint-Honoré"),          # 0 "Drei Monate waren seitdem vergangen" bis 4 — die Scheidung, die Abfahrt um neun Uhr im sechssitzigen Reiselandauer
        (5,   "Fahrt über die Champs-Élysées und durch das Bois"), # 5 "fuhr in raschem Trabe die Avenue des Champs-Elysees hinab und dann durch das Bois de Boulogne" → Go, bis 7
        (8,   "Fahrt über die Seine nach Saint-Germain und zurück"), # 8 "Man fuhr über die Seine am Mont-Valérien vorbei" → der Übergang, ab hier ist die Route ausserhalb der Stadt: Bougival und Pecq, das Frühstück im Pavillon Henri IV, der Panoramablick von der Terrasse, die Verabredung zur Flucht, die Rückfahrt über Chatou — bis 37
        (38,  "Palais Walter, Faubourg Saint-Honoré"),          # 38 "Als man nach Paris zurückkam" → Go / 39 "Als der Landauer in den Hof des Palais einfuhr"
        (40,  "Wohnung Du Roy (Rue Constantinople 127)"),       # 40 "Er lehnte jedoch dankend ab und ging nach Hause" bis 45 — er ordnet die Papiere, verbrennt Briefe, "Gegen elf Uhr verließ er sein Haus"
        # ── Die Entführung ───────────────────────────────────────────────
        (46,  "Place de la Concorde (Droschke vor dem Marineministerium)"), # 46 "Er wanderte eine Weile auf und ab" → Go / 47 die Arkaden des Marineministeriums, das Warten bis 54
        (55,  "Fahrt aus Paris Richtung Sèvres"),               # 55 "Er rief dem Kutscher zu: »Vorwärts!«" → Go, bis 65 — Suzannes Bericht, der Plan Sèvres/La Roche-Guyon
        # ── Gleichzeitig im Palais: die Nacht der Frau Walter ────────────
        (66,  "Palais Walter, Faubourg Saint-Honoré"),          # 66 der Erzählschnitt zurück ins Palais (Textzeile 128) bis 104 — das leere Bett, Walters Zusammenbruch, die Nacht im Wintergarten vor dem Christusbild
        (105, "La Roche-Guyon an der Seine"),                   # 105 Walter sagt die Hand der Tochter zu / 109 "Sie hatten sechs Tage an der Seine in La Roche-Guyon verbracht" bis 117
    ],
    "18": [
        (0,   "Rue Constantinople 127"),                        # 0 "Es war dunkel in der kleinen Wohnung auf der Rue Constantinople" bis 19 — der Bruch mit Clotilde, die Schläge, die Kündigung beim Portier
        (20,  "Église de la Madeleine, Paris"),                 # 20 "Er entfernte sich schnell" → Go; ab hier gehört alles zur Hochzeit: 22 "Die Trauung sollte in der Madeleinekirche stattfinden", 30 der rote Teppich auf der Freitreppe, 35–100 die Trauung, 101–108 die Schwelle und die Stufen — Montmartre (40), Canteleu (79/80), Place de la Concorde und Palais Bourbon (103–105) sind Erwähnungen und Blickachsen, keine Stationen
    ],
}

KURATIERTE_KAPITEL = sorted(BLOECKE.keys())


# ── Strassennetz / Fusswege ────────────────────────────────────────────────
GRAPH = None
GRAPH_BBOX = None  # (min_lon, max_lon, min_lat, max_lat) des geladenen Netzes + Marge

# Anker weiter als dieser Radius vom Median aller Anker entfernt gelten als
# "ferne Etappe" (Kapitel 17: La Roche-Guyon, 65 km nordwestlich; analog
# Cannes/Rouen in 06–09). Sie fliessen NICHT in die Bbox des geladenen
# Fussgängernetzes ein — sonst würde eine sinnlose Overpass-Abfrage über
# zig Kilometer Landschaft ausgelöst — und ihre Etappen bekommen eine
# Luftlinie statt eines Fusswegs. Dieselbe Unterscheidung trifft
# baue-kapitel-stationen.py mit im_pariser_netz().
FERNE_ETAPPE_GRAD = 0.25   # ~18 km in der Breite, ~28 km in der Länge
GRAPH_BBOX_MARGE = 0.012


def im_netz(lon, lat):
    if GRAPH_BBOX is None:
        return False
    min_lon, max_lon, min_lat, max_lat = GRAPH_BBOX
    return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat


def lade_strassennetz(anker):
    """Lädt (einmalig pro Skriptlauf) das Fussgängernetz um alle Anker herum.
    Bewusst als Bbox statt ox.graph_from_place("Paris, France") wie in
    baue-kapitel-stationen.py: die Bbox deckt alle Anker inkl. Bois de
    Boulogne ab, ist aber ein Bruchteil der Overpass-Abfrage (und damit auch
    ohne den grossen Paris-Cache verfügbar). Die Fusswege selbst sind
    identisch, solange die Bbox alle Anker mit Marge umschliesst."""
    global GRAPH, GRAPH_BBOX
    if GRAPH is not None:
        return GRAPH
    marge = GRAPH_BBOX_MARGE  # ~1.3 km, damit ein Fussweg auch mal aus der Anker-Bbox ausscheren darf
    sortiert_lon = sorted(p[0] for p in anker)
    sortiert_lat = sorted(p[1] for p in anker)
    mitte = (sortiert_lon[len(anker) // 2], sortiert_lat[len(anker) // 2])
    nah = [p for p in anker
           if abs(p[0] - mitte[0]) <= FERNE_ETAPPE_GRAD and abs(p[1] - mitte[1]) <= FERNE_ETAPPE_GRAD]
    fern = [p for p in anker if p not in nah]
    if fern:
        print(f"  {len(fern)} ferne Etappe(n) ausserhalb des Netzes — dafür Luftlinie statt Fussweg: "
              + ", ".join(f"{p[0]:.4f}/{p[1]:.4f}" for p in sorted(set(fern))))
    lons = [p[0] for p in nah]
    lats = [p[1] for p in nah]
    bbox = (min(lons) - marge, min(lats) - marge, max(lons) + marge, max(lats) + marge)
    GRAPH_BBOX = (bbox[0], bbox[2], bbox[1], bbox[3])
    print(f"Lade Fussgängernetz via OSMnx (Bbox {bbox[0]:.4f},{bbox[1]:.4f} .. {bbox[2]:.4f},{bbox[3]:.4f})...")
    GRAPH = ox.graph_from_bbox(bbox=bbox, network_type="walk", simplify=True)
    print(f"  Netz geladen: {len(GRAPH.nodes)} Knoten, {len(GRAPH.edges)} Kanten")
    return GRAPH


def berechne_fussweg(graph, lon0, lat0, lon1, lat1):
    """Kürzester Fussweg im echten Strassennetz, [[lon,lat], ...].
    Fällt bei Fehlern auf die Luftlinie zurück (dieselbe Semantik wie
    berechne_etappe in baue-kapitel-stationen.py)."""
    if lon0 == lon1 and lat0 == lat1:
        return [[lon0, lat0], [lon1, lat1]], False
    if not (im_netz(lon0, lat0) and im_netz(lon1, lat1)):
        # Ferne Etappe (siehe FERNE_ETAPPE_GRAD): ox.nearest_nodes würde den
        # Punkt sonst STUMM auf den nächstgelegenen Pariser Knoten snappen.
        return [[lon0, lat0], [lon1, lat1]], False
    try:
        start = ox.nearest_nodes(graph, lon0, lat0)
        ziel = ox.nearest_nodes(graph, lon1, lat1)
        if start == ziel:
            return [[lon0, lat0], [lon1, lat1]], False
        knoten = nx.shortest_path(graph, start, ziel, weight="length")
        pfad = [[graph.nodes[k]["x"], graph.nodes[k]["y"]] for k in knoten]
        # Anker exakt erhalten: der gesnappte Netzknoten liegt bis zu ein paar
        # Dutzend Meter neben dem Sammelpunkt, und routenPunkte/ortRuns müssen
        # exakt dieselbe Koordinate tragen (siehe Verifikation unten).
        pfad[0] = [lon0, lat0]
        pfad[-1] = [lon1, lat1]
        return pfad, True
    except (nx.NetworkXNoPath, nx.NodeNotFound) as e:
        print(f"    WARNUNG: Fussweg nicht berechenbar ({e}) — Luftlinie als Fallback.")
        return [[lon0, lat0], [lon1, lat1]], False


# ── bandCounts ─────────────────────────────────────────────────────────────
def valenz_bucket(v):
    if v == 1:
        return "pos"
    if v == -1:
        return "neg"
    if v == 0:
        return "neutral"
    return "unrated"


def leere_bandcounts():
    return {
        "gold_dunkel": {"neg": 0, "pos": 0, "neutral": 0, "unrated": 0},
        "gold_mittel": {"neg": 0, "pos": 0, "neutral": 0, "unrated": 0},
        "gold_hell": {"neg": 0, "pos": 0, "neutral": 0, "unrated": 0},
    }


# ── Hauptarbeit ────────────────────────────────────────────────────────────
def verarbeite_kapitel(nr):
    pfad = os.path.join(PROJEKT_ROOT, f"kapitel{nr}-stationen.json")
    with open(pfad, encoding="utf-8") as f:
        daten = json.load(f)

    annotationen = daten["annotationen"]
    n = len(annotationen)
    bloecke = BLOECKE[nr]
    punkte = SAMMELPUNKTE[nr]

    # ── Plausibilität der Blockliste ──────────────────────────────────────
    if bloecke[0][0] != 0:
        raise ValueError(f"Kapitel {nr}: erster Block muss bei revealIndex 0 beginnen, ist {bloecke[0][0]}")
    for (a, _), (b, _) in zip(bloecke, bloecke[1:]):
        if b <= a:
            raise ValueError(f"Kapitel {nr}: Blockgrenzen nicht streng aufsteigend ({a} -> {b})")
    if bloecke[-1][0] >= n:
        raise ValueError(f"Kapitel {nr}: letzter Block beginnt bei {bloecke[-1][0]}, es gibt nur {n} Annotationen")
    unbekannt = [name for _, name in bloecke if name not in punkte]
    if unbekannt:
        raise ValueError(f"Kapitel {nr}: Sammelpunkt(e) ohne Koordinate: {sorted(set(unbekannt))}")

    grenzen = [start for start, _ in bloecke] + [n]

    # ── annotationen[].ortBasis ───────────────────────────────────────────
    for i, (start, name) in enumerate(bloecke):
        for idx in range(grenzen[i], grenzen[i + 1]):
            annotationen[idx]["ortBasis"] = name

    # ── routenPfadDetail + routenPfadKumulativ + routenPunkte ─────────────
    anker = [punkte[name] for _, name in bloecke]
    graph = lade_strassennetz(anker)

    detail = [[anker[0][0], anker[0][1]]]
    anker_index = [0]  # Position jedes Blockankers in detail
    echte_fusswege = 0
    for k in range(len(anker) - 1):
        lon0, lat0 = anker[k]
        lon1, lat1 = anker[k + 1]
        segment, war_fussweg = berechne_fussweg(graph, lon0, lat0, lon1, lat1)
        if war_fussweg:
            echte_fusswege += 1
        detail.extend([[p[0], p[1]] for p in segment[1:]])  # erster Punkt == letzter der Vor-Etappe
        anker_index.append(len(detail) - 1)

    routenPfadKumulativ = [0] * n
    routenPunkte = [None] * n
    for i, (start, name) in enumerate(bloecke):
        for idx in range(grenzen[i], grenzen[i + 1]):
            routenPfadKumulativ[idx] = anker_index[i]
            routenPunkte[idx] = [punkte[name][0], punkte[name][1]]

    # ── ortRuns (eindeutig nach ortBasis, in Reihenfolge des ersten Auftretens)
    ortRuns = []
    gesehen = {}
    for idx, a in enumerate(annotationen):
        name = a["ortBasis"]
        if name not in gesehen:
            gesehen[name] = {"revealIndex": idx, "bandCounts": leere_bandcounts()}
        bc = gesehen[name]["bandCounts"]
        bc[a["category"]][valenz_bucket(a.get("valenz"))] += 1
    for name, eintrag in sorted(gesehen.items(), key=lambda kv: kv[1]["revealIndex"]):
        lon, lat = punkte[name]
        ortRuns.append({
            "ort": name,
            "revealIndex": eintrag["revealIndex"],
            "lon": lon,
            "lat": lat,
            "nodeType": "location",
            "bandCounts": eintrag["bandCounts"],
        })

    # ── route: die laufende Blockfolge (mit Wiederholungen) ───────────────
    # Für Kapitel 02–18 zeichnet sketch.js nicht aus route (das tut nur
    # Kapitel 1s stationenData), die Liste dokumentiert hier aber die
    # kuratierte Stop-and-go-Folge und hält den von sketch.js erwarteten
    # endStation-Fallback bereit.
    route = []
    for i, (start, name) in enumerate(bloecke):
        lon, lat = punkte[name]
        eintrag = {"ort": name, "lon": lon, "lat": lat, "revealIndex": start}
        if i == len(bloecke) - 1:
            eintrag["routeEndsHere"] = True
        route.append(eintrag)

    daten["route"] = route
    daten["routenPunkte"] = routenPunkte
    daten["routenPfadDetail"] = detail
    daten["routenPfadKumulativ"] = routenPfadKumulativ
    daten["ortRuns"] = ortRuns

    print(f"  Kapitel {nr}: {len(bloecke)} Blöcke, {len(ortRuns)} ortRuns, "
          f"{echte_fusswege}/{max(len(anker) - 1, 0)} echte Fusswege, {len(detail)} Punkte in routenPfadDetail.")
    return daten, pfad


# ── Verifikation ───────────────────────────────────────────────────────────
def verifiziere(nr, daten):
    fehler = []
    anns = daten["annotationen"]
    n = len(anns)
    detail = daten["routenPfadDetail"]
    kum = daten["routenPfadKumulativ"]
    runs = daten["ortRuns"]
    namen = {r["ort"] for r in runs}

    waisen = sorted({a["ortBasis"] for a in anns} - namen)
    if waisen:
        fehler.append(f"ortBasis ohne ortRun: {waisen}")

    if len(kum) != n:
        fehler.append(f"len(routenPfadKumulativ)={len(kum)} != len(annotationen)={n} "
                      f"(sketch.js fällt sonst auf den proportionalen Fortschritt zurück)")
    if len(daten["routenPunkte"]) != n:
        fehler.append(f"len(routenPunkte)={len(daten['routenPunkte'])} != {n}")

    if any(kum[i] > kum[i + 1] for i in range(len(kum) - 1)):
        fehler.append("routenPfadKumulativ nicht monoton aufsteigend (Route würde zurückspringen)")
    if kum and kum[0] != 0:
        fehler.append(f"routenPfadKumulativ[0]={kum[0]}, muss 0 sein")
    if kum and kum[-1] != len(detail) - 1:
        fehler.append(f"routenPfadKumulativ[-1]={kum[-1]}, erwartet {len(detail) - 1} (Route endet nicht am Pfadende)")

    # Stop-and-go: flach genau dann, wenn ortBasis gleich bleibt
    for i in range(1, n):
        gleich = anns[i]["ortBasis"] == anns[i - 1]["ortBasis"]
        if gleich and kum[i] != kum[i - 1]:
            fehler.append(f"Annotation {i}: gleicher ortBasis, aber Pfadindex springt ({kum[i-1]} -> {kum[i]})")
        if not gleich and kum[i] == kum[i - 1]:
            fehler.append(f"Annotation {i}: Ortswechsel, aber Pfadindex bleibt stehen ({kum[i]})")

    # routenPunkte/ortRuns/Pfadanker müssen exakt dieselbe Koordinate tragen
    nach_name = {r["ort"]: (r["lon"], r["lat"]) for r in runs}
    for i, a in enumerate(anns):
        soll = nach_name[a["ortBasis"]]
        if tuple(daten["routenPunkte"][i]) != soll:
            fehler.append(f"Annotation {i}: routenPunkte {daten['routenPunkte'][i]} != ortRun {list(soll)}")
            break
        if tuple(detail[kum[i]]) != soll:
            fehler.append(f"Annotation {i}: routenPfadDetail[{kum[i]}] {detail[kum[i]]} != ortRun {list(soll)}")
            break

    for r in runs:
        erste = next(i for i, a in enumerate(anns) if a["ortBasis"] == r["ort"])
        if r["revealIndex"] != erste:
            fehler.append(f"ortRun '{r['ort']}': revealIndex {r['revealIndex']} != erste Annotation {erste}")

    gesamt = sum(sum(sum(cat.values()) for cat in r["bandCounts"].values()) for r in runs)
    if gesamt != n:
        fehler.append(f"bandCounts summieren auf {gesamt}, erwartet {n} Annotationen")

    if not daten["route"]:
        fehler.append("route ist leer (sketch.js endStation-Fallback)")

    try:
        json.dumps(daten, ensure_ascii=False)
    except (TypeError, ValueError) as e:
        fehler.append(f"JSON nicht serialisierbar: {e}")

    return fehler


# ── Kreisvergleich nachziehen ──────────────────────────────────────────────
# kreisvergleich-orte.json wird aus den ortRuns ALLER Kapitel abgeleitet
# (baue-kreisvergleich.py). Ein voller Neubau dieses Skripts würde aber auch
# die Zeilen der noch nicht kuratierten Kapitel neu schreiben — die stehen
# dort bis heute im Vor-Kuratierungs-Zustand, ein Neubau ist deshalb eine
# eigene, bewusste Entscheidung (siehe Sitzungsnotiz). Hier wird darum NUR
# die Zeile des gerade kuratierten Kapitels ersetzt, alles andere bleibt
# unangetastet. Muster und Normalisierung sind bewusst wortgleich aus
# baue-kreisvergleich.py übernommen — laufen sie auseinander, ist dort die
# Quelle der Wahrheit.
KREISVERGLEICH_ORTE = [
    ("Rue Constantinople", ["rue constantinople"]),
    ("Rue Notre-Dame de Lorette", ["rue notre dame de lorette"]),
    ("Boulevard des Italiens/Capucines", ["boulevard des italiens", "boulevard des capucines"]),
    ("Parc Monceau", ["parc monceau"]),
    ("Boulevard Malesherbes", ["boulevard malesherbes"]),
    ("Folies Bergère", ["folies bergere"]),
    ("Place de la Madeleine", ["place de la madeleine", "eglise de la madeleine", "madeleine kirche"]),
    ("Redaktion", ["redaktion"]),
]


def normalisiere(ort):
    import re
    import unicodedata
    n = ort.lower().strip()
    n = re.sub(r",?\s*paris$", "", n)
    n = n.replace("-", " ")
    n = "".join(c for c in unicodedata.normalize("NFKD", n) if not unicodedata.combining(c))
    n = re.sub(r"[^a-z0-9 ]", "", n)
    return re.sub(r"\s+", " ", n).strip()


def aktualisiere_kreisvergleich(nr, daten):
    pfad = os.path.join(PROJEKT_ROOT, "kreisvergleich-orte.json")
    if not os.path.exists(pfad):
        return
    beitrag = {}
    varianten = {}
    for run in daten["ortRuns"]:
        if run["ort"].startswith("Unbestimmt"):
            continue
        n = normalisiere(run["ort"])
        for name, muster in KREISVERGLEICH_ORTE:
            if any(m in n for m in muster):
                bc = beitrag.setdefault(name, leere_bandcounts())
                for cat in bc:
                    for v in bc[cat]:
                        bc[cat][v] += run["bandCounts"].get(cat, {}).get(v, 0)
                varianten.setdefault(name, []).append(run["ort"])

    with open(pfad, encoding="utf-8") as f:
        vergleich = json.load(f)
    meldungen = []
    for eintrag in vergleich:
        name = eintrag["name"]
        alt = next((k for k in eintrag["kapitel"] if k["nr"] == nr), None)
        alt_n = sum(sum(c.values()) for c in alt["bandCounts"].values()) if alt else 0
        if name in beitrag:
            neu_n = sum(sum(c.values()) for c in beitrag[name].values())
            if alt:
                alt["bandCounts"] = beitrag[name]
            else:
                eintrag["kapitel"].append({"nr": nr, "bandCounts": beitrag[name]})
                eintrag["kapitel"].sort(key=lambda k: k["nr"])
            if alt_n != neu_n:
                meldungen.append(f"{name}: {alt_n} -> {neu_n} ({', '.join(varianten[name])})")
        elif alt:
            eintrag["kapitel"] = [k for k in eintrag["kapitel"] if k["nr"] != nr]
            meldungen.append(f"{name}: {alt_n} -> entfernt")
    with open(pfad, "w", encoding="utf-8") as f:
        json.dump(vergleich, f, ensure_ascii=False, indent=2)
    if meldungen:
        print("  Kreisvergleich (nur Kapitel " + nr + "): " + "; ".join(meldungen))
    else:
        print("  Kreisvergleich: unverändert")


def main():
    argumente = sys.argv[1:]
    kapitel = [f"{int(a):02d}" for a in argumente] if argumente else KURATIERTE_KAPITEL
    unbekannt = [k for k in kapitel if k not in BLOECKE]
    if unbekannt:
        print(f"WARNUNG: keine kuratierte Blockliste für Kapitel {unbekannt} — übersprungen.")
        kapitel = [k for k in kapitel if k in BLOECKE]

    for nr in kapitel:
        print(f"\nVerarbeite Kapitel {nr}...")
        # Netz je Kapitel neu laden: die Bbox wird aus DIESEN Ankern gebaut.
        # Ohne das Zurücksetzen benutzt jedes weitere Kapitel eines Sammel-
        # laufs das Netz des ERSTEN — Anker ausserhalb davon würden von
        # ox.nearest_nodes stumm auf einen fremden Knoten gesnappt (bzw. seit
        # der Fern-Etappen-Sicherung als Luftlinie durchgehen). Der Cache von
        # OSMnx bleibt davon unberührt, ein erneuter Lauf kostet also nichts.
        global GRAPH, GRAPH_BBOX
        GRAPH = None
        GRAPH_BBOX = None
        daten, pfad = verarbeite_kapitel(nr)
        fehler = verifiziere(nr, daten)
        if fehler:
            print("  FEHLER — nichts geschrieben:")
            for f in fehler:
                print(f"    - {f}")
            continue
        with open(pfad, "w", encoding="utf-8") as f:
            json.dump(daten, f, ensure_ascii=False, indent=2)
        print(f"  -> {pfad}")
        print("  Verifikation: OK")
        aktualisiere_kreisvergleich(nr, daten)
        print("  Sammelpunkte (Reihenfolge auf der Route):")
        for eintrag in daten["route"]:
            print(f"    ab Annotation {eintrag['revealIndex']:4d}  {eintrag['ort']}")


if __name__ == "__main__":
    main()
