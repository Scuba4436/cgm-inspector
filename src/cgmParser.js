/**
 * CGM Inspector – Parser für Binary (ISO 8632-3) und ASCII (ISO 8632-4) CGM-Dateien.
 * Erkennt CGM-Version, Profil-ID, Profil-Edition, Quelle, Farbe und Enkodierung.
 */
const asciiDecoder = new TextDecoder('ascii', { fatal: false });

// CGM-Version Mapping
const VERSION_NAMES = {
  1: 'CGM:1987 (V1)',
  2: 'CGM:1992 (V2)',
  3: 'CGM:1999 (V3)',
  4: 'CGM:2001 (V4)',
};

/**
 * Hauptfunktion: Analysiert eine CGM-Datei.
 * @param {File} file
 * @returns {Promise<{version, profile, encoding, profileId, profileEd, colourClass, source, date, fontList}>}
 */
export async function parseCGM(file) {
  const arrayBuffer = await file.arrayBuffer();

  const result = {
    version: 'Unbekannt',
    profile: 'Kein Profil erkannt',
    encoding: 'Binär',
    profileId: '',
    profileEd: '',
    colourClass: '',
    source: '',
    date: '',
    fontList: '',
  };

  try {
    const scanSize = Math.min(arrayBuffer.byteLength, 512);
    const headerBytes = new Uint8Array(arrayBuffer, 0, scanSize);

    const isClearText = detectClearText(headerBytes);

    if (isClearText) {
      result.encoding = 'ASCII';
      parseClearText(arrayBuffer, result);
    } else {
      result.encoding = 'Binär';
      parseBinary(arrayBuffer, result);
    }

    // Normalisierung: Versionsnummer → lesbarer Name
    const vNum = parseInt(result.version, 10);
    if (!isNaN(vNum) && VERSION_NAMES[vNum]) {
      result.version = VERSION_NAMES[vNum];
    } else if (!isNaN(vNum)) {
      result.version = `V${vNum}`;
    }

    // Profil-String aufbauen
    result.profile = buildProfileString(result);

  } catch (error) {
    console.warn('Fehler beim Parsen:', error);
  }

  return result;
}

// ============================================================
// ASCII-TEXT PARSER (ISO 8632-4)
// ============================================================

function detectClearText(bytes) {
  let str = '';
  for (let i = 0; i < Math.min(bytes.length, 32); i++) {
    const c = bytes[i];
    if (c >= 32 && c < 127) str += String.fromCharCode(c);
    else if (c === 10 || c === 13 || c === 9) str += ' ';
    else if (c > 127) return false;
  }
  return /^\s*(BEGMF|MFVERSION)/i.test(str);
}

function parseClearText(buffer, result) {
  const scanSize = Math.min(buffer.byteLength, 1024 * 16); // erste 16 KB
  const text = asciiDecoder.decode(buffer.slice(0, scanSize));

  // MFVERSION
  const verMatch = text.match(/MFVERSION\s+(\d+)/i);
  if (verMatch) result.version = verMatch[1];

  // MFDESC – enthält Key-Value-Paare
  const descMatch = text.match(/MFDESC\s+'([\s\S]*?)'\s*;/i);
  if (descMatch) {
    parseProfileDesc(descMatch[1], result);
  }

  // Falls kein ProfileId aus MFDESC → MFELEMLIST auswerten
  // 'VERSION4' ist der standardisierte Name der ATA GREXCHANGE-Elementliste (ISO 8632 Amendment)
  if (!result.profileId) {
    const elemMatch = text.match(/MFELEMLIST\s+'([^']+)'/i);
    if (elemMatch) {
      const elem = elemMatch[1].trim().toUpperCase();
      if (elem === 'VERSION4' || elem.startsWith('VERSION4')) {
        // Typisch für ATA GREXCHANGE / CHRP-Profile (S1000D, ATA iSpec 2200)
        result.profileId = 'ATA GRAPHICS.GREXCHANGE';
      } else if (elem === 'VERSION3') {
        result.profileId = 'ATA GRAPHICS.GREXCHANGE';
      }
    }
  }

  // FONTLIST
  const fontMatch = text.match(/FONTLIST\s+'([^']+)'/i);
  if (fontMatch) {
    result.fontList = fontMatch[1].replace(/,/g, ', ').trim();
  }
}

// ============================================================
// BINARY PARSER (ISO 8632-3)
// ============================================================

function parseBinary(buffer, result) {
  const view = new DataView(buffer);
  const maxOffset = Math.min(view.byteLength, 1024 * 512);
  let offset = 0;

  while (offset < maxOffset) {
    if (offset + 1 >= view.byteLength) break;

    const command = view.getUint16(offset);
    offset += 2;

    const elemClass = (command >>> 12) & 0x0F;
    const elemId = (command >>> 5) & 0x7F;
    let paramLen = command & 0x1F;

    // Extended Parameter Length (long form)
    if (paramLen === 31) {
      if (offset + 1 >= view.byteLength) break;
      const extWord = view.getUint16(offset);
      offset += 2;
      paramLen = extWord & 0x7FFF;
    }

    // --- Klasse 0: Delimiter ---
    // BEGIN METAFILE (elemId=1): Dateiname, nicht weiter ausgewertet

    // --- Klasse 1: Metafile Descriptor ---
    if (elemClass === 1) {
      if (elemId === 1 && paramLen >= 2) {
        // METAFILE VERSION: enthält einen 16-bit Integer (kein String)
        if (offset + 1 < view.byteLength) {
          result.version = view.getUint16(offset).toString();
        }
      } else if (elemId === 2) {
        // METAFILE DESCRIPTION: CGM-String mit Profil-Info
        const desc = extractCGMString(buffer, view, offset, paramLen);
        if (desc) parseProfileDesc(desc, result);
      } else if (elemId === 13) {
        // FONT LIST: Liste verwendeter Fonts (KEIN Profil!)
        const fonts = extractCGMString(buffer, view, offset, paramLen);
        if (fonts) result.fontList = fonts;
      }
    }

    // Abbruch beim Picture Descriptor oder Body
    if (elemClass >= 2 && elemClass <= 5) break;

    // Byte-Padding (immer gerade Länge)
    const alignedLen = paramLen % 2 !== 0 ? paramLen + 1 : paramLen;
    offset += alignedLen;
  }
}

// ============================================================
// PROFIL-BESCHREIBUNG PARSEN
// ============================================================

/**
 * Parst Key-Value-Paare aus dem Metafile-Description-String.
 *
 * Unterstützte Formate:
 *   Format A (kommagetrennt):  "ProfileId:ATA GRAPHICS.GREXCHANGE","ProfileEd:2.6","ColourClass:colour"
 *   Format B (leerzeichenget.): "ProfileID:ATA GRAPHICS.GREXCHANGE" "ProfileED:2.7" "ColourClass:colour"
 *   Format C (ohne ProfileId):  "Source:Created by OSW","Date:20200520","ColourClass:colour"
 */
function parseProfileDesc(desc, result) {
  if (!desc || desc.length === 0) return;

  const pairs = {};

  // Extrahiere alle "Key:Value"-Paare (beide Formate: komma- und leerzeichengetrennt)
  const kvRegex = /"([^":]+):([^"]*)"/g;
  let match;
  while ((match = kvRegex.exec(desc)) !== null) {
    const key = match[1].trim().toLowerCase().replace(/\s+/g, '');
    const value = match[2].trim();
    if (!pairs[key]) pairs[key] = value; // erster Treffer gewinnt
  }

  if (Object.keys(pairs).length === 0) {
    // Fallback: kein Key-Value-Format → Rohstring als ProfileId (z.B. "PSC CGM 3.0")
    const cleaned = desc.replace(/['"]/g, '').trim();
    if (cleaned.length > 0 && cleaned.length < 200) {
      if (!result.profileId) result.profileId = cleaned;
    }
    return;
  }

  // Bekannte Keys → Felder zuordnen
  const keyMap = {
    'profileid': 'profileId',
    'profiled': 'profileId',   // alternative Schreibweise
    'profileed': 'profileEd',
    'colourclass': 'colourClass',
    'colorclass': 'colourClass',
    'source': 'source',
    'date': 'date',
  };

  for (const [rawKey, field] of Object.entries(keyMap)) {
    if (pairs[rawKey] && !result[field]) {
      result[field] = pairs[rawKey];
    }
  }

  // Source: "Created by " Präfix entfernen
  if (result.source) {
    result.source = result.source.replace(/^created by\s+/i, '').trim();
  }
}

// ============================================================
// PROFIL-STRING AUFBAUEN
// ============================================================

function buildProfileString(result) {
  const parts = [];

  if (result.profileId) {
    const pid = normalizeProfileId(result.profileId);
    let profilePart = pid;
    if (result.profileEd) profilePart += ` (Ed. ${result.profileEd})`;
    parts.push(profilePart);
  }

  if (result.colourClass) {
    const cc = result.colourClass;
    const ccLabel = cc.toLowerCase() === 'colour' ? 'Farbe'
      : cc.toLowerCase() === 'monochrome' ? 'Monochrom'
        : (cc.charAt(0).toUpperCase() + cc.slice(1));
    parts.push(ccLabel);
  }

  if (result.source) {
    parts.push(`Quelle: ${result.source}`);
  }

  if (result.date) {
    const d = result.date;
    if (/^\d{8}$/.test(d)) {
      parts.push(`Datum: ${d.slice(6, 8)}.${d.slice(4, 6)}.${d.slice(0, 4)}`);
    } else {
      parts.push(`Datum: ${d}`);
    }
  }

  return parts.length > 0 ? parts.join(' · ') : 'Kein Profil erkannt';
}

function normalizeProfileId(pid) {
  const p = pid.trim();
  const upper = p.toUpperCase();

  if (upper.includes('ATA GRAPHICS') || upper.includes('GREXCHANGE')) {
    return 'ATA GRAPHICS.GREXCHANGE';
  }
  if (upper === 'S1000D' || upper.startsWith('S1000D')) return 'S1000D';
  if (upper.includes('WEBCGM')) return p.replace(/webcgm/i, 'WebCGM');
  if (upper.includes('PSC CGM')) return p;
  if (upper.includes('J2008')) return 'J2008';
  if (upper.includes('ATA')) return 'ATA';
  return p;
}

// ============================================================
// HILFSFUNKTIONEN
// ============================================================

/**
 * Liest einen CGM-String (P-String mit Längenbyte) aus dem DataView.
 * Unterstützt kurze (1-Byte) und lange (255 + 2-Byte-Länge) Form.
 */
function extractCGMString(buffer, view, offset, maxLen) {
  if (offset >= view.byteLength || maxLen === 0) return '';

  let strLen = view.getUint8(offset);
  let strStart = offset + 1;

  if (strLen === 255) {
    // Langer String: nächste 2 Bytes sind die eigentliche Länge
    if (offset + 2 < view.byteLength) {
      strLen = view.getUint16(offset + 1);
      strStart = offset + 3;
    } else {
      return '';
    }
  }

  // Sicherheits-Clamp
  if (strLen > maxLen) strLen = maxLen;
  if (strStart + strLen > view.byteLength) strLen = view.byteLength - strStart;
  if (strLen <= 0) return '';

  const bytes = new Uint8Array(buffer, strStart, strLen);
  return asciiDecoder.decode(bytes).replace(/[^\x20-\x7E]/g, '').trim();
}
