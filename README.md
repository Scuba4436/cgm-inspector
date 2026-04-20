# CGM Inspector

Eine Applikation zur Analyse von Computer Graphics Metafiles (CGM). Sie erkennt verlässlich Dateiformate (Binär/ASCII), CGM-Versionen, Profile (z.B. ATA GREXCHANGE, S1000D, WebCGM), Farbschemata, Tool-Quellen und Metadaten.

Die Software liegt in zwei Varianten vor:
1. Als interaktive **Web-Applikation**
2. Als **Kommandozeilen-Applikation (CLI)**

---

## 1. Web-Applikation

Die Web-App bietet eine visuelle Oberfläche inklusive Drag&Drop und einer Funktion zum Exportieren der Ergebnisse als Excel-Datei. 

### Starten mit Python
Da die App externe Node.js-Pakete (wie `xlsx` für den Excel-Export) verwendet, muss die Anwendung zunächst in statische, browserfähige Dateien gebündelt werden. Danach kann sie problemlos mit einem Python-Webserver bereitgestellt werden.

1. **Einmaliges Kompilieren (falls noch nicht geschehen):**
   ```bash
   npm install
   npm run build
   ```
   *Dies erzeugt einen `dist/` Ordner, in dem die fertige Web-Applikation liegt.*

2. **Webserver über Python starten:**
   Wechsle in den `dist`-Ordner und starte den integrierten HTTP-Server von Python:
   ```bash
   cd dist
   python3 -m http.server 8000
   ```
   Die Applikation ist nun im Browser unter **http://localhost:8000** erreichbar.

*(Tipp für Entwickler: Möchtest du den Code verändern und live im Browser testen, nutze einfach `npm run dev` im Hauptverzeichnis).*

### Nutzung der Web-Applikation
1. Ziehe eine oder mehrere `.cgm`-Dateien per Drag & Drop auf die gestrichelte "Drop-Zone" oder klicke auf **"Dateien auswählen"**.
2. Die App analysiert die Dateien sofort im Hintergrund. Der Fortschritt wird dir angezeigt.
3. In der Tabelle siehst du alle extrahierten Informationen. Über das Suchfeld kannst du die Einträge filtern.
4. Klicke oben rechts auf **"Excel exportieren"**, um alle Daten für die Weiterverarbeitung herunterzuladen.

---

## 2. Kommandozeilen-Applikation (CLI)

Wenn du Dateien lieber scriptbasiert oder schnell direkt im Terminal prüfen möchtest, kannst du das Python-Skript `cgm_inspector.py` verwenden. Es besitzt exakt die gleiche Parsing-Logik wie die Web-Applikation.

### Nutzung auf der Kommandozeile

Das Skript kann sowohl einzelne Dateien als auch komplette Ordnerstrukturen scannen.

**Gesamten Ordner analysieren:**
```bash
./cgm_inspector.py pfad/zum/ordner/
# Beispiel:
./cgm_inspector.py test-files/
```
Das Skript sucht rekursiv nach `.cgm`-Dateien, listet sie in einer sauberen Terminal-Tabelle auf und gibt am Ende eine Zusammenfassung der Fehler/Erfolge aus.

**Einzelne Datei analysieren:**
```bash
./cgm_inspector.py pfad/zur/datei.cgm
```

*(Hinweis: Falls du eine Meldung wie "Permission denied" erhältst, mache die Datei mit `chmod +x cgm_inspector.py` ausführbar oder starte sie explizit mit `python3 cgm_inspector.py`).*
