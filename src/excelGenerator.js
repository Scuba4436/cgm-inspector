import * as XLSX from 'xlsx';

/**
 * Exportiert die CGM-Analyseergebnisse als strukturierte Excel-Datei.
 * @param {Array} dataArray
 */
export function exportToExcel(dataArray) {
  if (!dataArray || dataArray.length === 0) {
    alert('Keine Daten zum Exportieren vorhanden.');
    return;
  }

  const worksheetData = dataArray.map((item, index) => ({
    'Nr.':         index + 1,
    'Dateiname':   item.name,
    'Kodierung':   item.encoding   || '',
    'CGM-Version': item.version    || '',
    'Profil-ID':   item.profileId  || '',
    'Edition':     item.profileEd  || '',
    'Farbe':       item.colourClass || '',
    'Quelle/Tool': item.source     || '',
    'Datum':       item.date       || '',
    'Font-Liste':  item.fontList   || '',
    'Profil (gesamt)': item.profile || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(worksheetData);

  // Spaltenbreiten
  worksheet['!cols'] = [
    { wch: 5 },   // Nr.
    { wch: 55 },  // Dateiname
    { wch: 12 },  // Kodierung
    { wch: 18 },  // CGM-Version
    { wch: 32 },  // Profil-ID
    { wch: 10 },  // Edition
    { wch: 12 },  // Farbe
    { wch: 40 },  // Quelle/Tool
    { wch: 12 },  // Datum
    { wch: 30 },  // Font-Liste
    { wch: 60 },  // Profil gesamt
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'CGM Analyse');

  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `CGM_Analyse_${date}.xlsx`);
}
