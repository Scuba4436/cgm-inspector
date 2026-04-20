import { parseCGM } from './cgmParser.js';
import { exportToExcel } from './excelGenerator.js';

let cgmResults = []; // Globale Ergebnisliste für Excel-Export

document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const fileSelectBtn = document.getElementById('file-select-btn');
  const resultsContainer = document.getElementById('results-container');
  const resultsBody = document.getElementById('results-body');
  const downloadExcelBtn = document.getElementById('download-excel-btn');
  const clearBtn = document.getElementById('clear-btn');
  const summaryBar = document.getElementById('summary-bar');
  const countTotal = document.getElementById('count-total');
  const countOk = document.getElementById('count-ok');
  const countUnknown = document.getElementById('count-unknown');
  const countError = document.getElementById('count-error');
  const progressBar = document.getElementById('progress-bar');
  const progressWrap = document.getElementById('progress-wrap');
  const filterInput = document.getElementById('filter-input');

  // ---- Drag & Drop ----
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files?.length > 0) handleFiles(e.dataTransfer.files);
  });

  // ---- Datei-Dialog ----
  fileSelectBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files?.length > 0) handleFiles(e.target.files);
    fileInput.value = '';
  });

  // ---- Excel Export ----
  downloadExcelBtn.addEventListener('click', () => exportToExcel(cgmResults));

  // ---- Clear ----
  clearBtn.addEventListener('click', () => {
    cgmResults = [];
    resultsBody.innerHTML = '';
    resultsContainer.classList.add('hidden');
    document.getElementById('toolbar').classList.add('hidden');
    summaryBar.classList.add('hidden');
    progressWrap.classList.add('hidden');
    filterInput.value = '';
    updateSummary();
  });

  // ---- Suche/Filter ----
  filterInput.addEventListener('input', () => {
    const q = filterInput.value.toLowerCase();
    const rows = resultsBody.querySelectorAll('tr');
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(q) ? '' : 'none';
    });
  });

  // ---- Kernlogik ----
  async function handleFiles(files) {
    const fileArray = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.cgm'));
    if (fileArray.length === 0) {
      alert('Bitte wähle gültige .cgm-Dateien aus.');
      return;
    }

    // UI vorbereiten
    resultsContainer.classList.remove('hidden');
    document.getElementById('toolbar').classList.remove('hidden');
    summaryBar.classList.remove('hidden');
    progressWrap.classList.remove('hidden');
    document.body.style.cursor = 'wait';

    let done = 0;
    const total = fileArray.length;

    for (const file of fileArray) {
      const rowId = 'row-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      addRow(rowId, file.name, '…', '…', '…', '…', '…', 'loading');

      // Rendering-Yield
      await new Promise(r => setTimeout(r, 0));

      try {
        const result = await parseCGM(file);

        cgmResults.push({
          name: file.name,
          encoding: result.encoding,
          version: result.version,
          profileId: result.profileId,
          profileEd: result.profileEd,
          colourClass: result.colourClass,
          source: result.source,
          date: result.date,
          fontList: result.fontList,
          profile: result.profile,
        });

        const status = result.profile === 'Kein Profil erkannt' ? 'unknown' : 'success';
        updateRow(rowId, file.name, result.encoding, result.version, result.profileId, result.profileEd, result.colourClass, result.source, result.date, status);

      } catch (err) {
        updateRow(rowId, file.name, '?', 'Fehler', '', '', '', '', '', 'error');
      }

      done++;
      const pct = Math.round((done / total) * 100);
      progressBar.style.width = pct + '%';
      progressBar.textContent = pct + '%';
      updateSummary();
    }

    progressWrap.classList.add('hidden');
    document.body.style.cursor = 'default';
  }

  // ---- Zusammenfassung ----
  function updateSummary() {
    const rows = resultsBody.querySelectorAll('tr');
    let ok = 0, unknown = 0, error = 0;
    rows.forEach(row => {
      const badge = row.querySelector('.status-badge');
      if (!badge) return;
      if (badge.classList.contains('success')) ok++;
      else if (badge.classList.contains('unknown')) unknown++;
      else if (badge.classList.contains('error')) error++;
    });
    countTotal.textContent = rows.length;
    countOk.textContent = ok;
    countUnknown.textContent = unknown;
    countError.textContent = error;
  }

  // ---- UI Helferfunktionen ----
  function addRow(id, name, encoding, version, profileId, profileEd, colourClass, source, date, status) {
    const tr = document.createElement('tr');
    tr.id = id;
    tr.innerHTML = buildRowHTML(name, encoding, version, profileId, profileEd, colourClass, source, date, status);
    resultsBody.prepend(tr);
  }

  function updateRow(id, name, encoding, version, profileId, profileEd, colourClass, source, date, status) {
    const tr = document.getElementById(id);
    if (!tr) return;
    tr.innerHTML = buildRowHTML(name, encoding, version, profileId, profileEd, colourClass, source, date, status);
  }

  function buildRowHTML(name, encoding, version, profileId, profileEd, colourClass, source, date, status) {
    const statusLabel = {
      loading: 'Lädt…',
      success: 'Erkannt',
      unknown: 'Kein Profil',
      error: 'Fehler',
    }[status] || status;

    const colourBadge = colourClass
      ? `<span class="colour-badge ${colourClass.toLowerCase().includes('mono') ? 'mono' : 'colour'}">${colourClass || ''}</span>`
      : '<span class="text-muted">–</span>';

    const dateFormatted = formatDate(date);
    const encBadge = encoding
      ? `<span class="enc-badge ${encoding === 'ASCII' ? 'cleartext' : 'binary'}">${escapeHTML(encoding)}</span>`
      : '';

    return `
      <td class="col-filename" title="${escapeHTML(name)}">${escapeHTML(name)}</td>
      <td class="col-encoding">${encBadge}</td>
      <td class="col-version">${escapeHTML(version)}</td>
      <td class="col-profile">${escapeHTML(profileId || '–')}</td>
      <td class="col-ed">${escapeHTML(profileEd || '–')}</td>
      <td class="col-colour">${colourBadge}</td>
      <td class="col-source" title="${escapeHTML(source || '')}">${escapeHTML(source || '–')}</td>
      <td class="col-date">${escapeHTML(dateFormatted || '–')}</td>
      <td class="col-status">
        <span class="status-badge ${status}">${statusLabel}</span>
      </td>
    `;
  }

  function formatDate(d) {
    if (!d) return '';
    if (d.match(/^\d{8}$/)) {
      return `${d.slice(6, 8)}.${d.slice(4, 6)}.${d.slice(0, 4)}`;
    }
    return d;
  }

  function escapeHTML(str) {
    return String(str ?? '').replace(/[&<>'"/]/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '/': '&#47;' }[c] || c)
    );
  }
});
