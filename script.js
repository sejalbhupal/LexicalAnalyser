// ============================================================
//  script.js
//  ------------------------------------------------------------
//  All frontend behavior for LexiScan. Plain vanilla JavaScript,
//  no frameworks. Organized into small focused sections:
//    1. State
//    2. DOM references
//    3. Theme switching
//    4. Hero token-stream demo animation
//    5. Editor (typing, line numbers, upload, drag & drop)
//    6. Analyze flow (calls the Express backend)
//    7. Rendering results (stats, token table, symbol table, errors)
//    8. Table search / sort / filter
//    9. Report downloads (JSON / TXT / CSV)
//   10. History panel
//   11. Modal, toasts, keyboard shortcuts
// ============================================================

(() => {
  'use strict';

  // ---------------------------------------------------------
  // 1. STATE
  // ---------------------------------------------------------
  const state = {
    lastResult: null,      // most recent /analyze JSON response
    sortKey: 'line',
    sortDir: 'asc',
    activeTab: 'tokens'
  };

  // ---------------------------------------------------------
  // 2. DOM REFERENCES
  // ---------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const sourceInput   = $('#sourceInput');
  const editorGutter  = $('#editorGutter');
  const dropZone      = $('#dropZone');
  const dropOverlay   = $('#dropOverlay');
  const fileInput     = $('#fileInput');
  const editorFilename = $('#editorFilename');

  const analyzeBtn    = $('#analyzeBtn');
  const analyzeLabel  = $('#analyzeLabel');
  const analyzeSpinner = $('#analyzeSpinner');
  const clearBtn       = $('#clearBtn');
  const sampleBtn       = $('#sampleBtn');
  const heroSampleBtn    = $('#heroSampleBtn');
  const copyBtn            = $('#copyBtn');

  const tokenTableBody  = $('#tokenTableBody');
  const symbolTableBody = $('#symbolTableBody');
  const errorList        = $('#errorList');
  const errorTabBadge     = $('#errorTabBadge');

  const tokenSearch     = $('#tokenSearch');
  const tokenTypeFilter = $('#tokenTypeFilter');

  const downloadBtn   = $('#downloadBtn');
  const downloadMenu  = $('#downloadMenu');

  const historyList        = $('#historyList');
  const refreshHistoryBtn  = $('#refreshHistoryBtn');

  const themeToggle = $('#themeToggle');
  const iconMoon = $('#iconMoon');
  const iconSun  = $('#iconSun');

  const aboutBtn = $('#aboutBtn');
  const aboutModalBackdrop = $('#aboutModalBackdrop');
  const aboutModalClose = $('#aboutModalClose');

  const toastContainer = $('#toastContainer');

  // ---------------------------------------------------------
  // 3. THEME SWITCHING (persisted in localStorage)
  // ---------------------------------------------------------
  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    iconMoon.style.display = theme === 'dark' ? 'block' : 'none';
    iconSun.style.display  = theme === 'dark' ? 'none' : 'block';
    localStorage.setItem('lexiscan-theme', theme);
  }

  (function initTheme() {
    const saved = localStorage.getItem('lexiscan-theme');
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(saved || (prefersLight ? 'light' : 'dark'));
  })();

  themeToggle.addEventListener('click', () => {
    const current = document.body.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  // ---------------------------------------------------------
  // 4. HERO TOKEN-STREAM DEMO ANIMATION
  //    Small illustrative animation: chips fly in one by one
  //    to show, at a glance, what tokenizing looks like.
  // ---------------------------------------------------------
  function renderHeroDemo() {
    const demoTokens = [
      { text: 'int',   color: 'var(--tok-keyword)' },
      { text: 'total', color: 'var(--tok-identifier)' },
      { text: '=',     color: 'var(--tok-operator)' },
      { text: '42',    color: 'var(--tok-number)' },
      { text: ';',     color: 'var(--tok-delimiter)' }
    ];
    const container = $('#tokenStream');
    container.innerHTML = '';
    demoTokens.forEach((t, i) => {
      const chip = document.createElement('span');
      chip.className = 'token-chip';
      chip.style.color = t.color;
      chip.style.animationDelay = `${i * 0.15 + 0.2}s`;
      chip.textContent = t.text;
      container.appendChild(chip);
    });
  }
  renderHeroDemo();

  // ---------------------------------------------------------
  // 5. EDITOR: line numbers, sample code, upload, drag & drop
  // ---------------------------------------------------------
  const SAMPLE_CODE = `#include <iostream>
using namespace std;

/* Computes the average of three
   numbers and prints the result */
int main() {
    int a = 10, b = 20, c = 30;
    float average = 0.0;
    bool passed = true;

    average = (a + b + c) / 3.0;

    if (average >= 20 && passed == true) {
        cout << "Passed! Average: " << average << endl;
    } else if (average < 20 || !passed) {
        cout << "Failed" << endl;
    }

    for (int i = 0; i < 5; i++) {
        a += i;
    }

    return 0;
}
`;

  function updateGutter() {
    const lineCount = sourceInput.value.split('\n').length;
    let out = '';
    for (let i = 1; i <= lineCount; i++) out += i + '\n';
    editorGutter.textContent = out;
    editorGutter.scrollTop = sourceInput.scrollTop;
  }
  sourceInput.addEventListener('input', updateGutter);
  sourceInput.addEventListener('scroll', () => { editorGutter.scrollTop = sourceInput.scrollTop; });
  updateGutter();

  function loadSample() {
    sourceInput.value = SAMPLE_CODE;
    editorFilename.style.display = 'none';
    updateGutter();
    showToast('Sample code loaded.', 'success');
  }
  sampleBtn.addEventListener('click', loadSample);
  heroSampleBtn.addEventListener('click', () => {
    loadSample();
    document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
  });

  copyBtn.addEventListener('click', async () => {
    if (!sourceInput.value.trim()) {
      showToast('Nothing to copy yet.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(sourceInput.value);
      showToast('Source copied to clipboard.', 'success');
    } catch {
      showToast('Could not access clipboard.', 'error');
    }
  });

  clearBtn.addEventListener('click', () => {
    sourceInput.value = '';
    pendingUploadFile = null;
    editorFilename.style.display = 'none';
    updateGutter();
    resetResults();
  });

  // ---- file upload (click) ----
  let pendingUploadFile = null; // File object, sent as-is if the user used upload/drop

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) loadFileIntoEditor(file);
  });

  function loadFileIntoEditor(file) {
    pendingUploadFile = file;
    editorFilename.textContent = file.name;
    editorFilename.style.display = 'block';

    const reader = new FileReader();
    reader.onload = (e) => {
      sourceInput.value = e.target.result;
      updateGutter();
    };
    reader.readAsText(file);
  }

  // ---- drag & drop ----
  ['dragenter', 'dragover'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });
  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) loadFileIntoEditor(file);
  });

  // Editing the textarea by hand invalidates the "pending upload file"
  // association (we should analyze whatever text is actually present).
  sourceInput.addEventListener('input', () => {
    if (pendingUploadFile) {
      pendingUploadFile = null;
    }
  });

  // ---------------------------------------------------------
  // 6. ANALYZE FLOW
  // ---------------------------------------------------------
  async function analyze() {
    const code = sourceInput.value;
    if (!code.trim()) {
      showToast('Paste or upload some source code first.', 'error');
      return;
    }

    setAnalyzing(true);
    try {
      let response;
      if (pendingUploadFile) {
        const formData = new FormData();
        formData.append('file', pendingUploadFile);
        response = await fetch('/analyze', { method: 'POST', body: formData });
      } else {
        response = await fetch('/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, filename: 'pasted-code.cpp' })
        });
      }

      const result = await response.json();
      if (!response.ok || result.ok === false) {
        throw new Error(result.error || 'Analysis failed.');
      }

      state.lastResult = result;
      renderResult(result);
      showToast('Analysis complete.', 'success');
      loadHistory();
    } catch (err) {
      showToast(err.message || 'Something went wrong contacting the server.', 'error');
    } finally {
      setAnalyzing(false);
    }
  }

  function setAnalyzing(isAnalyzing) {
    analyzeBtn.disabled = isAnalyzing;
    analyzeLabel.style.display = isAnalyzing ? 'none' : 'inline';
    analyzeSpinner.style.display = isAnalyzing ? 'inline-block' : 'none';
  }

  analyzeBtn.addEventListener('click', analyze);

  // ---------------------------------------------------------
  // 7. RENDERING RESULTS
  // ---------------------------------------------------------
  function resetResults() {
    state.lastResult = null;
    $$('.stat-card__value').forEach(el => el.textContent = '0');
    tokenTableBody.innerHTML = '<tr class="empty-row"><td colspan="3">No tokens yet — analyze some source code to see results here.</td></tr>';
    symbolTableBody.innerHTML = '<tr class="empty-row"><td colspan="4">No identifiers yet.</td></tr>';
    errorList.innerHTML = '<p class="empty-note">No lexical errors yet.</p>';
    errorTabBadge.style.display = 'none';
  }

  function renderResult(result) {
    renderStats(result.statistics);
    renderTokenTypeFilterOptions(result.tokens);
    renderTokenTable(result.tokens);
    renderSymbolTable(result.symbolTable);
    renderErrors(result.errors);
  }

  function renderStats(stats) {
    if (!stats) return;
    Object.keys(stats).forEach(key => {
      const card = document.querySelector(`.stat-card[data-stat="${key}"] .stat-card__value`);
      if (card) card.textContent = stats[key];
    });
  }

  function typeToClass(type) {
    return 'type-' + type.replace(/\s+/g, '-').replace(/\//g, '-');
  }

  function renderTokenTypeFilterOptions(tokens) {
    const types = Array.from(new Set(tokens.map(t => t.type))).sort();
    const current = tokenTypeFilter.value;
    tokenTypeFilter.innerHTML = '<option value="">All types</option>' +
      types.map(t => `<option value="${t}">${t}</option>`).join('');
    if (types.includes(current)) tokenTypeFilter.value = current;
  }

  function getFilteredSortedTokens() {
    if (!state.lastResult) return [];
    let tokens = state.lastResult.tokens.slice();

    const query = tokenSearch.value.trim().toLowerCase();
    const typeFilter = tokenTypeFilter.value;

    if (query) {
      tokens = tokens.filter(t =>
        t.lexeme.toLowerCase().includes(query) || t.type.toLowerCase().includes(query));
    }
    if (typeFilter) {
      tokens = tokens.filter(t => t.type === typeFilter);
    }

    tokens.sort((a, b) => {
      let av = a[state.sortKey], bv = b[state.sortKey];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return state.sortDir === 'asc' ? -1 : 1;
      if (av > bv) return state.sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return tokens;
  }

  function renderTokenTable() {
    const tokens = getFilteredSortedTokens();
    if (!state.lastResult) return;

    if (tokens.length === 0) {
      tokenTableBody.innerHTML = '<tr class="empty-row"><td colspan="3">No tokens match your filter.</td></tr>';
      return;
    }

    tokenTableBody.innerHTML = tokens.map(t => `
      <tr>
        <td><span class="type-badge ${typeToClass(t.type)}">${escapeHtml(t.type)}</span></td>
        <td>${escapeHtml(t.lexeme)}</td>
        <td>${t.line}</td>
      </tr>
    `).join('');
  }

  function renderSymbolTable(symbolTable) {
    if (!symbolTable || symbolTable.length === 0) {
      symbolTableBody.innerHTML = '<tr class="empty-row"><td colspan="4">No identifiers found.</td></tr>';
      return;
    }
    symbolTableBody.innerHTML = symbolTable.map(s => `
      <tr>
        <td>${s.id}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${s.firstLine}</td>
        <td>${s.occurrences}</td>
      </tr>
    `).join('');
  }

  function renderErrors(errors) {
    if (!errors || errors.length === 0) {
      errorList.innerHTML = '<p class="empty-note">No lexical errors detected. Nice and clean!</p>';
      errorTabBadge.style.display = 'none';
      return;
    }
    errorTabBadge.style.display = 'inline-block';
    errorTabBadge.textContent = errors.length;
    errorList.innerHTML = errors.map(e => `
      <div class="error-item">
        <span class="error-item__line">Line ${e.line}</span>
        <span class="error-item__msg">${escapeHtml(e.message)}</span>
      </div>
    `).join('');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------------------------------------------------------
  // 8. TABLE SEARCH / SORT / FILTER
  // ---------------------------------------------------------
  tokenSearch.addEventListener('input', () => renderTokenTable());
  tokenTypeFilter.addEventListener('change', () => renderTokenTable());

  $$('#tokenTable thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort');
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'asc';
      }
      renderTokenTable();
    });
  });

  // ---- tabs ----
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const name = tab.getAttribute('data-tab');
      $$('.tab').forEach(t => t.classList.remove('tab--active'));
      tab.classList.add('tab--active');
      $$('.tab-panel').forEach(p => p.classList.remove('tab-panel--active'));
      $(`#tab-${name}`).classList.add('tab-panel--active');
      state.activeTab = name;
    });
  });

  // ---------------------------------------------------------
  // 9. REPORT DOWNLOADS (JSON / TXT / CSV) — built client-side
  //    from the last analysis result, no extra backend calls.
  // ---------------------------------------------------------
  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    downloadMenu.classList.toggle('open');
  });
  document.addEventListener('click', () => downloadMenu.classList.remove('open'));

  $$('#downloadMenu button').forEach(btn => {
    btn.addEventListener('click', () => {
      const format = btn.getAttribute('data-format');
      downloadReport(format);
      downloadMenu.classList.remove('open');
    });
  });

  function downloadReport(format) {
    if (!state.lastResult) {
      showToast('Run an analysis first.', 'error');
      return;
    }
    const result = state.lastResult;
    let content, mime, filename;

    if (format === 'json') {
      content = JSON.stringify(result, null, 2);
      mime = 'application/json';
      filename = 'lexiscan-report.json';
    } else if (format === 'csv') {
      const rows = [['Token Type', 'Lexeme', 'Line']];
      result.tokens.forEach(t => rows.push([t.type, t.lexeme, t.line]));
      content = rows.map(r => r.map(csvEscape).join(',')).join('\n');
      mime = 'text/csv';
      filename = 'lexiscan-report.csv';
    } else {
      content = buildTxtReport(result);
      mime = 'text/plain';
      filename = 'lexiscan-report.txt';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${format.toUpperCase()} report downloaded.`, 'success');
  }

  function csvEscape(value) {
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }

  function buildTxtReport(result) {
    let out = 'LEXISCAN — LEXICAL ANALYSIS REPORT\n';
    out += '='.repeat(50) + '\n\n';
    out += 'TOKEN TABLE\n' + '-'.repeat(50) + '\n';
    result.tokens.forEach(t => {
      out += `${t.type.padEnd(28)} ${String(t.lexeme).padEnd(20)} Line ${t.line}\n`;
    });
    out += '\nSTATISTICS\n' + '-'.repeat(50) + '\n';
    Object.entries(result.statistics || {}).forEach(([k, v]) => {
      out += `${k.padEnd(20)}: ${v}\n`;
    });
    out += '\nLEXICAL ERRORS\n' + '-'.repeat(50) + '\n';
    if (!result.errors || result.errors.length === 0) {
      out += 'No lexical errors detected.\n';
    } else {
      result.errors.forEach(e => { out += `Line ${e.line}: ${e.message}\n`; });
    }
    return out;
  }

  // ---------------------------------------------------------
  // 10. HISTORY PANEL
  // ---------------------------------------------------------
  async function loadHistory() {
    try {
      const res = await fetch('/history');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      if (data.history.length === 0) {
        historyList.innerHTML = '<p class="empty-note">No saved analyses yet. Run an analysis to see it appear here.</p>';
        return;
      }

      historyList.innerHTML = data.history.map(h => `
        <div class="history-item" data-file="${escapeHtml(h.filename)}">
          <span class="history-item__name">${escapeHtml(h.filename)}</span>
          <span class="history-item__time">${new Date(h.savedAt).toLocaleString()}</span>
        </div>
      `).join('');

      $$('.history-item').forEach(item => {
        item.addEventListener('click', () => loadHistoryItem(item.getAttribute('data-file')));
      });
    } catch (err) {
      historyList.innerHTML = `<p class="empty-note">Could not load history: ${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadHistoryItem(filename) {
    try {
      const res = await fetch(`/history/${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error('Report not found.');
      const result = await res.json();
      state.lastResult = result;
      renderResult(result);
      showToast(`Loaded report: ${filename}`, 'success');
      document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  refreshHistoryBtn.addEventListener('click', loadHistory);
  loadHistory();

  // ---------------------------------------------------------
  // 11. MODAL, TOASTS, KEYBOARD SHORTCUTS
  // ---------------------------------------------------------
  function openAbout() { aboutModalBackdrop.classList.add('open'); }
  function closeAbout() { aboutModalBackdrop.classList.remove('open'); }
  aboutBtn.addEventListener('click', openAbout);
  aboutModalClose.addEventListener('click', closeAbout);
  aboutModalBackdrop.addEventListener('click', (e) => { if (e.target === aboutModalBackdrop) closeAbout(); });

  function showToast(message, kind = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast--${kind}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3800);
  }

  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === 'Enter') {
      e.preventDefault();
      analyze();
    } else if (ctrl && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      tokenSearch.focus();
    } else if (ctrl && e.key === 'Backspace' && document.activeElement !== sourceInput) {
      e.preventDefault();
      clearBtn.click();
    } else if (e.key === 'Escape') {
      closeAbout();
      downloadMenu.classList.remove('open');
    }
  });

})();
