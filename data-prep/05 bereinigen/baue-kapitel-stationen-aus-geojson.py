"""
baue-kapitel-stationen-aus-geojson.py
=====================
Die Gefühlte Stadt — Bel-Ami
Wie baue-kapitel-stationen.py (siehe dort für die ausführliche Dokumentation
der Routen-/ortRuns-Logik), aber mit reichhaltigerer Quelle:

  ../04 geojson.geojson/kapitel-XX.geojson

statt ../03 output/kapitel-XX-final.json — das geojson hat für praktisch
jede Annotation bereits einen konkreten, benannten "ort" + Koordinate (siehe
Kapitel 1s Vorbild, dieselbe Quelle unter 05 bereinigen/kapitel-01.geojson),
während die "final.json"-Variante nur für wenige, eindeutig erkannte
Realorte überhaupt eine Koordinate hat (Rest: Sammelpunkt-Platzhalter).

Erstentwurf-Charakter bleibt bestehen (siehe Docstring von
baue-kapitel-stationen.py): ortBasis == ort (keine Synonym-Zusammenlegung
über leicht unterschiedliche Ortsbezeichnungen hinweg), keine Gedanken-
Spalten-Trennung, keine Wohnung-Sammelpunkt-Tricks — das sind spätere,
von-Hand-verfeinerte Schritte wie bei Kapitel 1.

Verwendung: python3 "baue-kapitel-stationen-aus-geojson.py" 02
            python3 "baue-kapitel-stationen-aus-geojson.py"       (alle in KAPITEL_NUMMERN)
"""

import json
import math
import os
import sys

import networkx as nx
import osmnx as ox

SKRIPT_ORDNER = os.path.dirname(os.path.abspath(__file__))
DATA_PREP_ORDNER = os.path.dirname(SKRIPT_ORDNER)
PROJEKT_ROOT = os.path.dirname(DATA_PREP_ORDNER)

INPUT_DIR = os.path.join(DATA_PREP_ORDNER, "04 geojson.geojson")
OUTPUT_DIR = PROJEKT_ROOT

ox.settings.use_cache = True
ox.settings.cache_folder = os.path.join(DATA_PREP_ORDNER, "cache")

KAPITEL_NUMMERN = [2] + list(range(4, 19))  # NIEMALS 1 oder 3 (eigenes, von Hand
# verfeinertes Format) — siehe baue-kapitel-stationen.py Warnung.

GENERISCHE_PARIS_KOORDINATE = (2.3522, 48.8566)  # (lng, lat) — Île de la Cité/Notre-Dame

# ── Kanonische, wiederkehrende Orte ─────────────────────────────────────────
# Namen wie "Redaktion La Vie Française" tauchen über viele Kapitel hinweg
# wieder auf — kreisvergleich-orte.json vergleicht solche Orte sogar NAMENTLICH
# EXAKT über alle Kapitel hinweg (siehe baue-kreisvergleich.py). Wird die
# Koordinate pro Kapitel unabhängig neu geokodiert, driftet sie (gefunden in
# Kapitel 4: zwei "Redaktion"-Erwähnungen mit zwei verschiedenen, beide von
# Kapitel 1s handverifizierter Koordinate abweichenden Positionen). Diese
# Liste erzwingt für Erwähnungen mit passendem Schlüsselwort (Substring,
# case-insensitiv, ohne Akzente) IMMER dieselbe Koordinate + denselben
# ortBasis-Namen — Koordinaten aus Kapitel 1s von Hand verifizierten ortRuns
# übernommen. Reihenfolge relevant: erster Treffer gewinnt, spezifischere
# Einträge (z.B. "Rue Notre-Dame de Lorette") müssen vor generischeren
# stehen, falls es je Überschneidungen gibt.
def _ohne_akzente(s):
    ersatz = str.maketrans("àâäéèêëïîôöùûüç-", "aaaeeeeiioouuuc ")
    return s.lower().translate(ersatz)


KANONISCHE_ORTE = [
    ("vie francaise", "Redaktion La Vie Française", (2.3466305, 48.8722361)),
    ("folies bergere", "Folies Bergère", (2.3449, 48.8741)),
    ("rue notre dame de lorette", "Rue Notre-Dame de Lorette", (2.3381, 48.8780)),
    ("place de l'opera", "Place de l'Opéra", (2.3309, 48.8717)),
    ("place de la madeleine", "Place de la Madeleine", (2.3242, 48.8697)),
    # Église de la Madeleine (nicht der Platz davor): Hochzeit Kapitel 18,
    # dort 7 verschiedene Koordinaten für dieselbe Kirche gefunden. Bewusst
    # NICHT generische Wörter wie "kirchenraum" allein als Muster (würde mit
    # anderen Kirchen in anderen Kapiteln kollidieren, z.B. Kapitel 12s
    # Trinité-Kirche) — nur eindeutig "Madeleine"-benannte Varianten.
    ("église de la madeleine", "Église de la Madeleine, Paris", (2.3245425, 48.8701338)),
    ("madeleine-kirche", "Église de la Madeleine, Paris", (2.3245425, 48.8701338)),
    ("madeleinekirche", "Église de la Madeleine, Paris", (2.3245425, 48.8701338)),
    # Église de la Trinité (Kapitel 12, Rendezvous/Beichtstuhl-Szene mit
    # Madame Walter): war über 4 Koordinaten verstreut, u.a. weil "Kirche,
    # Paris" (35 Annotationen der Beichtstuhl-Szene) eine andere Koordinate
    # hatte als "Trinité-Kirche, Paris". "kirche, paris" bewusst NICHT als
    # generisches Muster (kollidiert mit jeder anderen Kirche) — nur die
    # eindeutig "Trinité"-benannten Varianten.
    ("église de la trinité", "Église de la Trinité, Paris", (2.3313978, 48.8773025)),
    ("trinité-kirche", "Église de la Trinité, Paris", (2.3313978, 48.8773025)),
    ("boulevard des capucines", "Boulevard des Capucines", (2.3280, 48.8699)),
    ("boulevard des italiens", "Boulevard des Italiens", (2.3370, 48.8715)),
    ("boulevard poissonniere", "Boulevard Poissonnière", (2.3457, 48.8712)),
    ("cafe americain", "Café Américain", (2.3315, 48.8706)),
    ("cafe napolitain", "Café Napolitain", (2.3339, 48.8708)),
    ("rue la fayette", "Rue La Fayette", (2.3411, 48.8751)),
    # Rue de Constantinople 127: Clotildes Rendezvous-Zimmer, im Text von
    # Kapitel 5 genannt ("Rendezvous noch heute um fünf Uhr in der Rue de
    # Constantinople 127"); taucht laut kreisvergleich-orte.json auch in
    # Kapitel 7/13/18 wieder auf — Name bewusst OHNE "de", damit
    # baue-kreisvergleich.py (eigenes, separates Substring-Muster
    # "rue constantinople") den Ort weiterhin findet. Per Nominatim
    # geokodiert (genaue Hausnummer 127 nicht auflösbar, Straßen-Zentrum
    # verwendet).
    ("rue de constantinople", "Rue Constantinople 127", (2.3192132, 48.8803681)),
    ("rue constantinople", "Rue Constantinople 127", (2.3192132, 48.8803681)),
    # Rue Boursault: Duroys tatsächliche Wohnadresse (siehe Kapitel-1-
    # Korrektur) — in Kapitel 5 unabhängig bestätigt ("...nach Rue Boursault
    # am Boulevard Batignolles"). Gleiche Koordinate wie sketch.js
    # duroyWohnung.
    ("rue boursault", "Georges Duroys Wohnung (Rue Boursault)", (2.3187925, 48.8851901)),
    # Rue de Verneuil: Clotilde de Marelles Wohnung (Kapitel 5, "Sie wohnte
    # Rue de Verneuil, im vierten Stock."). Nominatim: Straßen-Zentrum, 7.
    # Arrondissement.
    ("rue de verneuil", "Wohnung Clotilde (Rue de Verneuil)", (2.3291830, 48.8579756)),
    # Boulevard Malesherbes: Walters Doppelhaus (Kapitel 6, "Herr Walter
    # bewohnte auf dem Boulevard Malesherbes ein Doppelhaus"); auch in
    # kreisvergleich-orte.json als eigener Vergleichsort geführt. Keine
    # Hausnummer im Text — Nominatim-Straßenpunkt (südliches Ende, nahe
    # Madeleine) verwendet.
    ("boulevard malesherbes", "Boulevard Malesherbes (Walters Haus)", (2.3223720, 48.8713231)),
    # Rue Fontaine 17: Forestiers alte Wohnung (Kapitel 1) — Duroy und
    # Madeleine ziehen ab Kapitel 10 dort ein ("Er ging... nach der Wohnung
    # seines Vorgängers"). Taucht auch in Kapitel 16 wieder auf ("Rue
    # Fontaine 17, Paris"). Gleiche Koordinate wie Kapitel 2s
    # KAPITEL_EINE_LOCATION-Eintrag (dort per Nominatim auf "Rue Pierre
    # Fontaine" geokodiert).
    ("rue fontaine", "Wohnung Duroy/Madeleine (17 Rue Fontaine)", (2.3341746, 48.8814675)),
    # Forestiers Wohnung, referenziert ohne Straßennamen (nur "bei Forestier"/
    # "Wohnung Forestier") — gefunden in Kapitel 3 und 4, dort mit eigenen,
    # von der echten Adresse (17 Rue Fontaine) abweichenden Koordinaten. Vor
    # "Cannes, Villa Forestier" (Kapitel 8, andere, tatsächlich verschiedene
    # Adresse an der Côte d'Azur) sicher, da "wohnung"/"arbeitszimmer" dort
    # nicht vorkommt — nur bis zu Forestiers Tod (Kapitel 8) relevant, danach
    # gibt es keine "bei Forestier"-Erwähnungen der Paris-Wohnung mehr.
    ("wohnung forestier", "Wohnung Forestier (17 Rue Fontaine)", (2.3341746, 48.8814675)),
    ("arbeitszimmer bei forestier", "Wohnung Forestier (17 Rue Fontaine)", (2.3341746, 48.8814675)),
    # Clotilde de Marelles Wohnung, referenziert ohne Straßennamen — gefunden
    # in Kapitel 5 (2x, dort sogar mit zwei verschiedenen falschen
    # Koordinaten), 6 und 13, jeweils von der echten Adresse (Rue de
    # Verneuil, siehe oben) abweichend.
    ("wohnung madame de marelle", "Wohnung Clotilde (Rue de Verneuil)", (2.3291830, 48.8579756)),
    ("wohnung von madame de marelle", "Wohnung Clotilde (Rue de Verneuil)", (2.3291830, 48.8579756)),
    ("bei madame de marelle", "Wohnung Clotilde (Rue de Verneuil)", (2.3291830, 48.8579756)),
]


def kanonischer_ort_fuer(ort_text):
    """Gibt (kanonischer_name, (lon,lat)) zurück, falls ort_text ein bekanntes
    Schlüsselwort enthält, sonst None."""
    normalisiert = _ohne_akzente(ort_text or "")
    for schluesselwort, name, koord in KANONISCHE_ORTE:
        if schluesselwort in normalisiert:
            return name, koord
    return None


PARIS_ZENTRUM = (2.3522, 48.8566)  # (lng, lat)
PARIS_RADIUS_GRAD = 0.3  # ~25-30km — grosszügig genug für Chatou/St-Germain-en-Laye


def ist_generischer_platzhalter(lng, lat, ort_text=None):
    if lng is None or lat is None:
        return True
    if abs(lng - GENERISCHE_PARIS_KOORDINATE[0]) < 1e-6 and abs(lat - GENERISCHE_PARIS_KOORDINATE[1]) < 1e-6:
        return True
    # Zweiter, seltenerer Fallback-Fehler der Geocodierung: "ort" behauptet
    # "Paris", die Koordinate liegt aber weit ausserhalb (gefunden in Kapitel
    # 6: 8 Annotationen "... Paris (nicht näher spezifiziert)" mit Koordinate
    # mitten in Zentralfrankreich, [4.6562, 46.2133] — vermutlich ein interner
    # "Frankreich-Mitte"-Fallback des Geocoding-Schritts für nicht auflösbare
    # vage Ortsangaben). Legitime, tatsächlich weit entfernte Handlungsorte
    # (Cannes, Rouen) behaupten dagegen nicht "Paris" in ihrem Namen und
    # bleiben unangetastet.
    if ort_text and "paris" in ort_text.lower():
        weit_weg = abs(lng - PARIS_ZENTRUM[0]) > PARIS_RADIUS_GRAD or abs(lat - PARIS_ZENTRUM[1]) > PARIS_RADIUS_GRAD
        if weit_weg:
            return True
    return False


GRAPH = None
GRAPH_BBOX = None
GRAPH_BBOX_MARGE = 0.02


def lade_strassennetz():
    global GRAPH, GRAPH_BBOX
    if GRAPH is not None:
        return GRAPH
    print("Lade Pariser Strassennetz via OSMnx (einmalig, nutzt Cache falls vorhanden)...")
    GRAPH = ox.graph_from_place("Paris, France", network_type="walk", simplify=True)
    print(f"  Strassennetz geladen: {len(GRAPH.nodes)} Knoten, {len(GRAPH.edges)} Kanten")
    xs = [d["x"] for _, d in GRAPH.nodes(data=True)]
    ys = [d["y"] for _, d in GRAPH.nodes(data=True)]
    GRAPH_BBOX = (min(xs) - GRAPH_BBOX_MARGE, max(xs) + GRAPH_BBOX_MARGE,
                  min(ys) - GRAPH_BBOX_MARGE, max(ys) + GRAPH_BBOX_MARGE)
    return GRAPH


def im_pariser_netz(lon, lat):
    if GRAPH_BBOX is None:
        return False
    min_lon, max_lon, min_lat, max_lat = GRAPH_BBOX
    return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat


def berechne_fussweg(graph, lon0, lat0, lon1, lat1):
    try:
        start = ox.nearest_nodes(graph, lon0, lat0)
        ziel = ox.nearest_nodes(graph, lon1, lat1)
        if start == ziel:
            return [[lon0, lat0], [lon1, lat1]]
        pfad = nx.shortest_path(graph, start, ziel, weight="length")
        return [[graph.nodes[k]["x"], graph.nodes[k]["y"]] for k in pfad]
    except (nx.NetworkXNoPath, nx.NodeNotFound) as e:
        print(f"    WARNUNG: Fussweg nicht berechenbar ({e}) — nutze Luftlinie als Fallback.")
        return None


def berechne_etappe(graph, lon0, lat0, lon1, lat1):
    if lon0 == lon1 and lat0 == lat1:
        return [[lon0, lat0], [lon1, lat1]], False
    if im_pariser_netz(lon0, lat0) and im_pariser_netz(lon1, lat1):
        pfad_pts = berechne_fussweg(graph, lon0, lat0, lon1, lat1)
        if pfad_pts:
            return pfad_pts, True
    return [[lon0, lat0], [lon1, lat1]], False


def resample_by_arclength(points, n):
    if n <= 0:
        return []
    if len(points) == 1 or n == 1:
        return [points[0]] * n if n > 1 else [points[0]]

    lat_mittel = sum(p[1] for p in points) / len(points)
    kx = 111320 * math.cos(math.radians(lat_mittel))
    ky = 110540

    def dist(p, q):
        dx = (q[0] - p[0]) * kx
        dy = (q[1] - p[1]) * ky
        return math.hypot(dx, dy)

    kumuliert = [0.0]
    for i in range(1, len(points)):
        kumuliert.append(kumuliert[-1] + dist(points[i - 1], points[i]))
    gesamt = kumuliert[-1]

    if gesamt == 0:
        return [points[0]] * n

    ergebnis = []
    for i in range(n):
        ziel_dist = gesamt * i / (n - 1)
        j = 0
        while j < len(kumuliert) - 2 and kumuliert[j + 1] < ziel_dist:
            j += 1
        seg_laenge = kumuliert[j + 1] - kumuliert[j]
        t = 0.0 if seg_laenge == 0 else (ziel_dist - kumuliert[j]) / seg_laenge
        t = max(0.0, min(1.0, t))
        lon = points[j][0] + t * (points[j + 1][0] - points[j][0])
        lat = points[j][1] + t * (points[j + 1][1] - points[j][1])
        ergebnis.append([lon, lat])
    return ergebnis


def kategorie_fuer_annotation(tags, valenz):
    tags = tags or []
    if "social" in tags:
        return "gold_hell"
    if "mood" in tags or valenz is not None:
        return "gold_mittel"
    if "space" in tags or "location" in tags:
        return "gold_dunkel"
    return "gold_dunkel"


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


ERINNERUNGS_AUSREISSER_SCHWELLE_GRAD = 0.003  # ~300m


def korrigiere_erinnerungs_ausreisser(feats_roh):
    """Annotationen mit Tag "location_erinnerung" beschreiben einen erinnerten
    Ort (z.B. Kindheit, Militärzeit, ein früher besuchter Ort) — sie sollen
    laut Projekt-Konvention (siehe Kapitel 1, ergaenze-orte.py: "Afrika"-
    Erinnerung) die Koordinate von Duroys TATSÄCHLICHER Position im Moment
    des Erinnerns tragen, nicht die des erinnerten Orts selbst (der wäre auf
    der Paris-Karte ohnehin nicht sinnvoll darstellbar). Die automatische
    Geocodierung hält sich meist daran (übernimmt stillschweigend die
    Nachbar-Koordinate), weicht aber vereinzelt ab und geokodiert den
    erinnerten Ort tatsächlich dorthin (gefunden: Kapitel 2, "Folies Bergère"-
    Erinnerung, ~1.1km von der unmittelbar umgebenden Dinner-Szene entfernt).
    Diese Funktion erkennt solche Ausreisser (Koordinate weicht um mehr als
    ERINNERUNGS_AUSREISSER_SCHWELLE_GRAD von der vorherigen UND nächsten
    Annotation ab) und ersetzt ihre Koordinate durch die der vorherigen
    Annotation (chronologisch letzte bekannte Position)."""
    for i, feat in enumerate(feats_roh):
        p = feat["properties"]
        if "location_erinnerung" not in (p.get("tags") or []):
            continue
        lng, lat = feat["geometry"]["coordinates"]
        if lng is None:
            continue
        nachbar = feats_roh[i - 1] if i > 0 else (feats_roh[i + 1] if i + 1 < len(feats_roh) else None)
        if nachbar is None:
            continue
        n_lng, n_lat = nachbar["geometry"]["coordinates"]
        if n_lng is None:
            continue
        weit_weg = abs(lng - n_lng) > ERINNERUNGS_AUSREISSER_SCHWELLE_GRAD or abs(lat - n_lat) > ERINNERUNGS_AUSREISSER_SCHWELLE_GRAD
        if weit_weg:
            print(f"    Erinnerungs-Ausreisser korrigiert: id={p['id']} ({p.get('ort')!r}) "
                  f"[{lng:.4f},{lat:.4f}] -> Nachbar-Koordinate [{n_lng:.4f},{n_lat:.4f}]")
            feat["geometry"]["coordinates"] = [n_lng, n_lat]


# Kapitel, die (laut Buchtext geprüft) komplett an einem einzigen Ort spielen
# — die automatische Geocodierung driftet dort trotzdem über mehrere leicht
# verschiedene Koordinaten/Rohtexte (z.B. Treppenhaus/Salon/Esszimmer als
# vermeintlich getrennte Orte), obwohl es real dieselbe Wohnung ist. Statt das
# der (an sich schon verbesserten) Koordinaten-Clusterung zu überlassen, wird
# hier explizit auf eine einzige ortRun erzwungen.
# Kapitel 2 (geprüft anhand kapitel-02-belami-maupassant.txt): Duroy betritt
# zu Kapitelbeginn direkt Forestiers Wohnhaus ("Bitte, wo wohnt hier Herr
# Forestier?") und verlässt es am Kapitelende wieder über dieselbe Treppe —
# keine andere Location im ganzen Kapitel. M. Walter ist dort nur zu Gast
# (Dinnergesellschaft in Forestiers Wohnung), keine zweite Location "Wohnung
# Walters" trotz gegenteiliger Rohtexte in einigen Annotationen.
# Koordinate: die Adresse "17 Rue Fontaine" nennt Forestier selbst im
# Kapitel-1-Text ("Vergiß nicht, um halb acht abends, 17 Rue Fontaine.");
# Kapitel 1 selbst geokodiert diese Erwähnung nicht als eigenen Ort (Forestier
# sagt den Satz noch in den Folies Bergère, korrekt an dessen Koordinate). Per
# Nominatim (OSM) geocodiert: heute "Rue Pierre Fontaine", 9. Arrondissement,
# nahe Pigalle — (2.3341746, 48.8814675). Die vorher hier verwendete
# Koordinate (2.3403, 48.8691, aus der automatischen Geocodierung übernommen)
# lag dazu rund 1.4km daneben.
KAPITEL_EINE_LOCATION = {
    2: ("Wohnung Forestier, 17 Rue Fontaine", (2.3341746, 48.8814675)),
}


def verarbeite_kapitel(nr, letzte_koordinate_vorkapitel):
    pfad = os.path.join(INPUT_DIR, f"kapitel-{nr:02d}.geojson")
    with open(pfad, encoding="utf-8") as f:
        quelle = json.load(f)

    feats_roh = sorted(quelle["features"], key=lambda f: f["properties"]["id"])
    korrigiere_erinnerungs_ausreisser(feats_roh)
    n = len(feats_roh)
    sammelpunkt_name = f"Unbestimmt (Kapitel {nr:02d})"

    annotationen = []
    kanonische_treffer = []
    for idx, feat in enumerate(feats_roh):
        p = feat["properties"]
        lng, lat = feat["geometry"]["coordinates"]
        ort_bez = p.get("ort")
        hat_koord = not ist_generischer_platzhalter(lng, lat, ort_bez)
        ort_basis = ort_bez if (hat_koord and ort_bez) else sammelpunkt_name

        # Kanonische Orte (siehe KANONISCHE_ORTE): überschreiben NUR die
        # Koordinate + ortBasis-Vorgabe, "ort" (roher Text) bleibt unangetastet.
        # Erinnerungs-Annotationen (location_erinnerung) ausgenommen: die sollen
        # an Duroys AKTUELLER Position bleiben (siehe
        # korrigiere_erinnerungs_ausreisser), nicht an die Koordinate des
        # erinnerten Orts selbst springen — sonst würde z.B. "Duroys Wohnung
        # (Erinnerung)", während er physisch bei den Forestiers ist, fälschlich
        # zur echten Wohnungs-Koordinate verschoben.
        ist_erinnerung = "location_erinnerung" in (p.get("tags") or [])
        ortBasis_vorgabe = None
        kanonisch = kanonischer_ort_fuer(ort_bez) if (hat_koord and ort_bez and not ist_erinnerung) else None
        if kanonisch:
            kan_name, (kan_lon, kan_lat) = kanonisch
            lng, lat = kan_lon, kan_lat
            ortBasis_vorgabe = kan_name
            kanonische_treffer.append((p["id"], ort_bez, kan_name))

        f_wert = p.get("f_wert")
        cat = kategorie_fuer_annotation(p.get("tags"), p.get("valenz"))

        annotationen.append({
            "id": p["id"],
            "text": p.get("text", ""),
            "tags": p.get("tags") or [],
            "valenz": p.get("valenz"),
            "intensitaet": p.get("intensitaet"),
            "category": cat,
            "ortBasis": ortBasis_vorgabe,  # None: unten per Koordinaten-Cluster befüllt
            "ort": ort_basis,  # roher, unveränderter Text pro Annotation (wie Kapitel 1)
            "revealIndex": idx,
            "station": None,
            "perspektive": p.get("perspektive"),
            "hasFwert": bool(f_wert),
            "fWertType": f_wert,
            "f_wert": f_wert,
            "_lng": lng,
            "_lat": lat,
            "_hat_koord": hat_koord,
        })

    if kanonische_treffer:
        print(f"    Kanonische Orte übernommen: " +
              ", ".join(f"id={i} ({roh!r}->{kan})" for i, roh, kan in kanonische_treffer))

    # ── ortBasis-Gruppierung: nicht nach rohem Text, sondern nach Koordinate ──
    # Der Geocoding-Schritt vergibt oft für mehrere unterschiedlich formulierte
    # Erwähnungen derselben physischen Szene exakt dieselbe Koordinate (z.B.
    # "Treppenhaus im Wohnhaus Forestier" / "Wohnung der Forestiers, Paris" /
    # "Salon, Wohnung der Forestiers" — alle am selben Punkt). Gruppierung nach
    # rohem "ort"-Text (wie in v1 dieses Skripts) erzeugte dadurch viele kleine
    # Einzel-ortRuns für denselben Ort. Kapitel 1 löst das genau umgekehrt: der
    # rohe Text bleibt pro Annotation in "ort" erhalten (59 unique Werte),
    # "ortBasis" fasst nach Koordinate zu deutlich weniger Gruppen zusammen
    # (23 unique) — dieselbe Logik wird hier nachgebildet.
    KOORD_PRAEZISION = 6  # ~0.1m — Cluster nur bei praktisch identischer Koordinate

    def koord_key(a):
        return (round(a["_lng"], KOORD_PRAEZISION), round(a["_lat"], KOORD_PRAEZISION))

    if nr in KAPITEL_EINE_LOCATION:
        einzige_location, (einzige_lon, einzige_lat) = KAPITEL_EINE_LOCATION[nr]
        for a in annotationen:
            a["ortBasis"] = einzige_location
            a["_lng"], a["_lat"] = einzige_lon, einzige_lat
            a["_hat_koord"] = True
    else:
        koord_cluster = {}
        for idx, a in enumerate(annotationen):
            if a["ort"] == sammelpunkt_name:
                continue  # Sammelpunkt bleibt eigene, koordinatenunabhängige Gruppe
            if a["ortBasis"] is not None:
                continue  # bereits per KANONISCHE_ORTE vorgegeben — nicht überschreiben
            koord_cluster.setdefault(koord_key(a), []).append(idx)

        for idxs in koord_cluster.values():
            namen = [annotationen[i]["ort"] for i in idxs]
            haeufigkeit = {}
            for name in namen:
                haeufigkeit[name] = haeufigkeit.get(name, 0) + 1
            # Kanonischer Name: häufigster Rohtext im Cluster, bei Gleichstand der
            # kürzeste (meist die allgemeinere Bezeichnung), dann erster Auftritt.
            kanonisch = min(
                haeufigkeit.keys(),
                key=lambda name: (-haeufigkeit[name], len(name), namen.index(name))
            )
            for i in idxs:
                annotationen[i]["ortBasis"] = kanonisch

        for a in annotationen:
            if a["ortBasis"] is None:
                a["ortBasis"] = a["ort"]  # Sammelpunkt (oder Einzelgänger ohne Cluster)

    gruppen = {}
    for idx, a in enumerate(annotationen):
        gruppen.setdefault(a["ortBasis"], []).append(idx)

    koord_indizes = [i for i in range(n) if annotationen[i]["_hat_koord"]]

    if koord_indizes:
        erster_koord_idx = koord_indizes[0]
        sammelpunkt_lon = annotationen[erster_koord_idx]["_lng"]
        sammelpunkt_lat = annotationen[erster_koord_idx]["_lat"]
    elif letzte_koordinate_vorkapitel is not None:
        sammelpunkt_lon, sammelpunkt_lat = letzte_koordinate_vorkapitel
    else:
        sammelpunkt_lon, sammelpunkt_lat = GENERISCHE_PARIS_KOORDINATE

    ortRuns = []
    for ort_basis, idxs in gruppen.items():
        idxs_sortiert = sorted(idxs)
        min_reveal = idxs_sortiert[0]
        if ort_basis == sammelpunkt_name:
            lon, lat = sammelpunkt_lon, sammelpunkt_lat
        else:
            lons = [annotationen[i]["_lng"] for i in idxs_sortiert]
            lats = [annotationen[i]["_lat"] for i in idxs_sortiert]
            lon = sum(lons) / len(lons)
            lat = sum(lats) / len(lats)

        bandCounts = leere_bandcounts()
        for i in idxs_sortiert:
            cat = annotationen[i]["category"]
            bucket = valenz_bucket(annotationen[i]["valenz"])
            bandCounts[cat][bucket] += 1

        ortRuns.append({
            "ort": ort_basis,
            "revealIndex": min_reveal,
            "lon": lon,
            "lat": lat,
            "nodeType": "location",
            "bandCounts": bandCounts,
        })
    ortRuns.sort(key=lambda r: r["revealIndex"])

    anker = [(i, annotationen[i]["_lng"], annotationen[i]["_lat"]) for i in koord_indizes]
    routenPunkte = [None] * n
    routenPfadDetail = []
    letzte_koordinate_dieses_kapitels = None

    if not anker:
        px, py = letzte_koordinate_vorkapitel or GENERISCHE_PARIS_KOORDINATE
        routenPunkte = [[px, py]] * n
        routenPfadDetail = [[px, py]]
        letzte_koordinate_dieses_kapitels = (px, py)
        print(f"  Kapitel {nr:02d}: KEINE Koordinaten im ganzen Kapitel — Platzhalter-Route verwendet.")
    else:
        graph = lade_strassennetz()

        erster_idx, erster_lon, erster_lat = anker[0]
        for i in range(0, erster_idx + 1):
            routenPunkte[i] = [erster_lon, erster_lat]
        routenPfadDetail.append([erster_lon, erster_lat])

        erfolgreiche_etappen = 0
        ausserhalb_etappen = 0
        for k in range(len(anker) - 1):
            i0, lon0, lat0 = anker[k]
            i1, lon1, lat1 = anker[k + 1]
            luecke = i1 - i0
            if luecke <= 0:
                continue
            pfad_pts, war_echter_fussweg = berechne_etappe(graph, lon0, lat0, lon1, lat1)
            if war_echter_fussweg:
                erfolgreiche_etappen += 1
            elif not (lon0 == lon1 and lat0 == lat1) and not (im_pariser_netz(lon0, lat0) and im_pariser_netz(lon1, lat1)):
                ausserhalb_etappen += 1
            resampled = resample_by_arclength(pfad_pts, luecke + 1)
            for offset, p in enumerate(resampled):
                routenPunkte[i0 + offset] = p
            routenPfadDetail.extend(pfad_pts[1:])

        letzter_idx, letzter_lon, letzter_lat = anker[-1]
        for i in range(letzter_idx, n):
            routenPunkte[i] = [letzter_lon, letzter_lat]

        letzte_koordinate_dieses_kapitels = (letzter_lon, letzter_lat)
        print(f"  Kapitel {nr:02d}: {len(anker)} Anker-Koordinaten, {erfolgreiche_etappen}/{max(len(anker)-1,0)} "
              f"echte Fusswege berechnet, {ausserhalb_etappen} Etappen ausserhalb Pariser Netz (Luftlinie), "
              f"{len(routenPfadDetail)} Punkte in routenPfadDetail.")

    for i in range(n):
        if routenPunkte[i] is None:
            routenPunkte[i] = routenPunkte[i - 1] if i > 0 else [GENERISCHE_PARIS_KOORDINATE[0], GENERISCHE_PARIS_KOORDINATE[1]]

    letzter_ort_basis = annotationen[-1]["ortBasis"]
    letzter_ortrun = next(r for r in ortRuns if r["ort"] == letzter_ort_basis)
    route = [{
        "ort": letzter_ort_basis,
        "lon": letzter_ortrun["lon"],
        "lat": letzter_ortrun["lat"],
        "revealIndex": n - 1,
        "routeEndsHere": True,
    }]

    for a in annotationen:
        del a["_lng"], a["_lat"], a["_hat_koord"]

    ausgabe = {
        "kapitel": nr,
        "route": route,
        "gedanken": [],
        "markierungen": [],
        "routenPunkte": routenPunkte,
        "routenPfadDetail": routenPfadDetail,
        "annotationen": annotationen,
        "halteorte": [],
        "zwischenPunkte": [],
        "ortRuns": ortRuns,
    }

    return ausgabe, letzte_koordinate_dieses_kapitels


def verifiziere(nr, daten):
    fehler = []
    anns = daten["annotationen"]
    ortRunNamen = {r["ort"] for r in daten["ortRuns"]}

    waisen = [a["id"] for a in anns if a["ortBasis"] not in ortRunNamen]
    if waisen:
        fehler.append(f"Waisen-ortBasis bei id(s) {waisen}")

    reveal_werte = [a["revealIndex"] for a in anns]
    if len(daten["routenPunkte"]) != max(reveal_werte) + 1:
        fehler.append(f"len(routenPunkte)={len(daten['routenPunkte'])} != max(revealIndex)+1={max(reveal_werte) + 1}")

    if any(reveal_werte[i] >= reveal_werte[i + 1] for i in range(len(reveal_werte) - 1)):
        fehler.append("revealIndex nicht streng monoton aufsteigend")

    if not daten["route"]:
        fehler.append("route ist leer")

    try:
        json.dumps(daten, ensure_ascii=False)
    except (TypeError, ValueError) as e:
        fehler.append(f"JSON nicht serialisierbar: {e}")

    return fehler


def parse_kapitel_argumente(argv):
    if len(argv) <= 1:
        return KAPITEL_NUMMERN
    gewuenscht = []
    for arg in argv[1:]:
        nr = int(arg)
        if nr not in KAPITEL_NUMMERN:
            print(f"WARNUNG: Kapitel {nr:02d} ist nicht in KAPITEL_NUMMERN — übersprungen.")
            continue
        gewuenscht.append(nr)
    return gewuenscht


def main():
    kapitel_liste = parse_kapitel_argumente(sys.argv)
    report = []
    letzte_koordinate = None

    for nr in kapitel_liste:
        print(f"\nVerarbeite Kapitel {nr:02d}...")
        daten, letzte_koordinate = verarbeite_kapitel(nr, letzte_koordinate)

        out_pfad = os.path.join(OUTPUT_DIR, f"kapitel{nr:02d}-stationen.json")
        with open(out_pfad, "w", encoding="utf-8") as f:
            json.dump(daten, f, ensure_ascii=False, indent=2)

        fehler = verifiziere(nr, daten)
        n_sammelpunkt = sum(1 for a in daten["annotationen"] if a["ortBasis"] == f"Unbestimmt (Kapitel {nr:02d})")

        report.append({
            "kapitel": nr,
            "n_annotationen": len(daten["annotationen"]),
            "n_ortRuns": len(daten["ortRuns"]),
            "n_sammelpunkt": n_sammelpunkt,
            "fehler": fehler,
            "pfad": out_pfad,
        })

        status = "OK" if not fehler else "FEHLER: " + "; ".join(fehler)
        print(f"  -> {out_pfad}")
        print(f"  Annotationen: {len(daten['annotationen'])}, ortRuns: {len(daten['ortRuns'])}, "
              f"im Sammelpunkt: {n_sammelpunkt}, Verifikation: {status}")

    print("\n" + "=" * 70)
    print("REPORT")
    print("=" * 70)
    for r in report:
        status = "OK" if not r["fehler"] else "FEHLER: " + "; ".join(r["fehler"])
        print(f"Kapitel {r['kapitel']:02d}: {r['n_annotationen']:4d} Annotationen, "
              f"{r['n_ortRuns']:3d} ortRuns, {r['n_sammelpunkt']:4d} im Sammelpunkt -> {status}")


if __name__ == "__main__":
    main()
