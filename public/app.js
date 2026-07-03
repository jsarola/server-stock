// ── State ─────────────────────────────────────────────────────────────────────

let allServers = [];
let allUses = [];
let allTeams = [];
let allEnvironments = [];
let editingId = null;
let sortState = { key: null, dir: 1 };
let onlyActive = false;
let managementMenuOpen = false;
let currentTheme = 'dark';

function applyTheme(theme) {
  currentTheme = theme === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light-theme', currentTheme === 'light');
  const icon = document.getElementById('themeToggleIcon');
  if (icon) icon.textContent = currentTheme === 'light' ? '◑' : '◐';
}

function toggleTheme() {
  applyTheme(currentTheme === 'light' ? 'dark' : 'light');
  window.localStorage.setItem('theme', currentTheme);
}

function initTheme() {
  const savedTheme = window.localStorage.getItem('theme');
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(savedTheme || (prefersLight ? 'light' : 'dark'));
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadServers() {
  const res = await fetch('/api/servers');
  allServers = await res.json();
  filterAndRender();
}

async function loadUses() {
  const res = await fetch('/api/uses');
  allUses = await res.json();
  populateFilterOptions();
}

async function loadTeams() {
  const res = await fetch('/api/teams');
  allTeams = await res.json();
  populateFilterOptions();
}

async function loadEnvironments() {
  const res = await fetch('/api/environments');
  allEnvironments = await res.json();
  populateFilterOptions();
}

function loadStats(servers = allServers) {
  const totals = servers.reduce((acc, server) => {
    acc.total_servers += 1;
    acc.total_vcpus += server.vcpus || 0;
    acc.total_memory_gb += server.memory || 0;
    acc.total_disk_gb += diskTotal(server);
    return acc;
  }, {
    total_servers: 0,
    total_vcpus: 0,
    total_memory_gb: 0,
    total_disk_gb: 0,
  });

  document.getElementById('statTotal').textContent = totals.total_servers;
  document.getElementById('statVcpus').textContent = fmt2(totals.total_vcpus);
  document.getElementById('statMemory').innerHTML = `${fmt2(totals.total_memory_gb)}<span class="stat-unit">GB</span>`;
  document.getElementById('statDisk').innerHTML = `${fmt2(totals.total_disk_gb)}<span class="stat-unit">GB</span>`;
}

// ── Table rendering ───────────────────────────────────────────────────────────

function diskTotal(s) {
  return (s.disk0 || 0) + (s.disk1 || 0) + (s.disk_extra || 0);
}

function isoToDisplayDate(val) {
  if (!val) return '';
  const text = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.replaceAll('-', '/');
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) return text;
  return text;
}

function normalizeDateMask(val) {
  const digits = String(val || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}/${digits.slice(4)}`;
  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6, 8)}`;
}

function toApiDate(val) {
  if (!val) return '';
  const text = String(val).trim();
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.replaceAll('-', '/');
  return text;
}

function normalizeComparableDate(val) {
  return toApiDate(val).replaceAll('-', '/');
}

function isCompleteDateValue(val) {
  return /^\d{4}\/\d{2}\/\d{2}$/.test(normalizeComparableDate(val));
}

function fmtDate(val) {
  if (!val) return '—';
  return isoToDisplayDate(val);
}

function setDateFieldValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = isoToDisplayDate(value);
}

function initDateInputs(root = document) {
  root.querySelectorAll('input[data-date-format="yyyy/mm/dd"]').forEach(input => {
    if (input.dataset.dateMaskReady === '1') return;
    input.dataset.dateMaskReady = '1';
    input.autocomplete = 'off';
    input.addEventListener('input', () => {
      input.value = normalizeDateMask(input.value);
    });
    input.addEventListener('blur', () => {
      input.value = normalizeDateMask(input.value);
    });
    input.value = isoToDisplayDate(input.value);
  });
}

function fmt2(val) {
  return Number(val || 0).toFixed(2);
}

function compareNumberFilter(actual, op, rawValue) {
  if (!op || rawValue === '') return true;
  const expected = Number(rawValue);
  if (Number.isNaN(expected)) return true;
  if (op === '>') return actual > expected;
  if (op === '<') return actual < expected;
  if (op === '=') return actual === expected;
  return true;
}

function compareDateFilter(actual, op, expected) {
  if (!op || !expected || !actual) return !op || !expected;
  const actualValue = normalizeComparableDate(actual);
  const expectedValue = normalizeComparableDate(expected);
  if (!isCompleteDateValue(actualValue) || !isCompleteDateValue(expectedValue)) return true;
  if (op === '>') return actualValue > expectedValue;
  if (op === '<') return actualValue < expectedValue;
  if (op === '=') return actualValue === expectedValue;
  return true;
}

function getFilterState() {
  return {
    text: document.getElementById('searchInput').value.toLowerCase().trim(),
    service: document.getElementById('filterService').value,
    environment: document.getElementById('filterEnvironment').value,
    use: document.getElementById('filterUse').value,
    team: document.getElementById('filterTeam').value,
    vcpusOp: document.getElementById('filterVcpusOp').value,
    vcpusValue: document.getElementById('filterVcpusValue').value,
    memoryOp: document.getElementById('filterMemoryOp').value,
    memoryValue: document.getElementById('filterMemoryValue').value,
    diskOp: document.getElementById('filterDiskOp').value,
    diskValue: document.getElementById('filterDiskValue').value,
    dataAltaOp: document.getElementById('filterDataAltaOp').value,
    dataAltaValue: document.getElementById('filterDataAltaValue').value,
  };
}

function populateSelectOptions(selectId, options, defaultLabel) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = `<option value="">${defaultLabel}</option>` +
    options.map(option => `<option value="${option}">${option}</option>`).join('');
  select.value = options.includes(currentValue) ? currentValue : '';
}

function populateFilterOptions() {
  populateSelectOptions('filterService', [...SERVICE_OPTIONS], 'Tots');
  populateSelectOptions('filterEnvironment', allEnvironments.map(r => r.name).sort((a, b) => a.localeCompare(b)), 'Tots');
  populateSelectOptions('filterUse', allUses.map(u => u.name).sort((a, b) => a.localeCompare(b)), 'Tots');
  populateSelectOptions('filterTeam', allTeams.map(t => t.name).sort((a, b) => a.localeCompare(b)), 'Tots');
}

function toggleOnlyActive() {
  onlyActive = !onlyActive;
  document.getElementById('btnOnlyActive').classList.toggle('active', onlyActive);
  filterAndRender();
}

function resetAllFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterService').value = '';
  document.getElementById('filterEnvironment').value = '';
  document.getElementById('filterUse').value = '';
  document.getElementById('filterTeam').value = '';
  document.getElementById('filterVcpusOp').value = '';
  document.getElementById('filterVcpusValue').value = '';
  document.getElementById('filterMemoryOp').value = '';
  document.getElementById('filterMemoryValue').value = '';
  document.getElementById('filterDiskOp').value = '';
  document.getElementById('filterDiskValue').value = '';
  document.getElementById('filterDataAltaOp').value = '';
  document.getElementById('filterDataAltaValue').value = '';
  onlyActive = false;
  document.getElementById('btnOnlyActive').classList.remove('active');
  filterAndRender();
}

function toggleManagementMenu(event) {
  if (event) event.stopPropagation();
  managementMenuOpen = !managementMenuOpen;
  const dropdown = document.getElementById('menuDropdown');
  const trigger = document.getElementById('menuTrigger');
  dropdown.classList.toggle('open', managementMenuOpen);
  trigger.setAttribute('aria-expanded', managementMenuOpen ? 'true' : 'false');
}

function closeManagementMenu() {
  managementMenuOpen = false;
  const dropdown = document.getElementById('menuDropdown');
  const trigger = document.getElementById('menuTrigger');
  if (dropdown) dropdown.classList.remove('open');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

function renderTable(servers) {
  const tbody = document.getElementById('tableBody');
  if (!servers.length) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><div class="icon">◌</div><p>No s'han trobat servidors</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = servers.map(s => {
    const total = diskTotal(s);
    const usesBadges = s.uses && s.uses.length
      ? `<div class="uses-cell">${s.uses.map(u => `<span class="badge badge-use">${u.name}</span>`).join('')}</div>`
      : '<span style="color:var(--text-muted)">—</span>';
    const environmentBadge = s.environment
      ? `<span class="badge badge-running${s.environment.delete_date ? ' retired' : ''}">${s.environment.name}</span>`
      : '<span style="color:var(--text-muted)">—</span>';
    return `
    <tr>
      <td><span class="cell-name">${s.name}</span></td>
      <td class="cell-num">${s.vcpus}</td>
      <td class="cell-num">${s.memory}</td>
      <td class="cell-num"><strong>${total}</strong></td>
      <td>${s.service ? `<span class="badge badge-service">${s.service}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${environmentBadge}</td>
      <td>${usesBadges}</td>
      <td>${s.team ? `<span class="badge badge-equip">${s.team.name}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td style="font-family:var(--mono);font-size:0.8rem;color:var(--text-muted)">${fmtDate(s.data_alta)}</td>
      <td style="font-family:var(--mono);font-size:0.8rem;color:${s.data_baixa ? 'var(--yellow)' : 'var(--text-muted)'}">${fmtDate(s.data_baixa)}</td>
      <td>
        <div class="actions">
          <button class="icon-btn edit" onclick="editServer(${s.id})" title="Editar">✎</button>
          <button class="icon-btn icon-btn-hw" onclick="openHwHistoryModal(${s.id}, '${s.name.replace(/'/g, "\\'")}')" title="Historial maquinari">HW</button>
          <button class="icon-btn delete" onclick="deleteServer(${s.id}, '${s.name}')" title="Eliminar">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Filter & sort ─────────────────────────────────────────────────────────────

function filterAndRender() {
  const filters = getFilterState();
  let list = allServers.filter(s => {
    const matchesText = !filters.text ||
      s.name.toLowerCase().includes(filters.text) ||
      (s.service || '').toLowerCase().includes(filters.text) ||
      (s.team?.name || '').toLowerCase().includes(filters.text) ||
      (s.environment?.name || '').toLowerCase().includes(filters.text) ||
      (s.uses || []).some(u => u.name.toLowerCase().includes(filters.text));

    if (!matchesText) return false;
    if (onlyActive && s.data_baixa) return false;
    if (filters.service && s.service !== filters.service) return false;
    if (filters.environment && (s.environment?.name || '') !== filters.environment) return false;
    if (filters.team && (s.team?.name || '') !== filters.team) return false;
    if (filters.use && !(s.uses || []).some(u => u.name === filters.use)) return false;
    if (!compareNumberFilter(s.vcpus || 0, filters.vcpusOp, filters.vcpusValue)) return false;
    if (!compareNumberFilter(s.memory || 0, filters.memoryOp, filters.memoryValue)) return false;
    if (!compareNumberFilter(diskTotal(s), filters.diskOp, filters.diskValue)) return false;
    if (!compareDateFilter(s.data_alta, filters.dataAltaOp, filters.dataAltaValue)) return false;

    return true;
  });

  if (sortState.key) {
    list = [...list].sort((a, b) => {
      const va = sortState.key === 'disk_total' ? diskTotal(a) : (a[sortState.key] ?? '');
      const vb = sortState.key === 'disk_total' ? diskTotal(b) : (b[sortState.key] ?? '');
      if (typeof va === 'number') return (va - vb) * sortState.dir;
      return String(va).localeCompare(String(vb)) * sortState.dir;
    });
  }

  loadStats(list);
  renderTable(list);
}

function sortBy(key) {
  if (sortState.key === key) {
    sortState.dir *= -1;
  } else {
    sortState.key = key;
    sortState.dir = 1;
  }
  updateSortHeaders();
  filterAndRender();
  document.getElementById('btnResetSort').style.display = '';
}

function resetSort() {
  sortState = { key: null, dir: 1 };
  updateSortHeaders();
  filterAndRender();
  document.getElementById('btnResetSort').style.display = 'none';
}

function updateSortHeaders() {
  const keys = ['name','vcpus','memory','disk_total','data_alta','data_baixa'];
  keys.forEach(k => {
    const el = document.getElementById(`si_${k}`);
    const th = el?.closest('th');
    if (!el || !th) return;
    if (sortState.key === k) {
      el.textContent = sortState.dir === 1 ? '▲' : '▼';
      th.classList.add('sort-active');
    } else {
      el.textContent = '⇅';
      th.classList.remove('sort-active');
    }
  });
}

const SERVICE_OPTIONS = ['Testing', 'Production', 'Staging', 'Development'];

// ── Server form ───────────────────────────────────────────────────────────────

const FIELD_IDS = {
  name: 'f_name', service: 'f_service',
  vcpus: 'f_vcpus', memory: 'f_memory',
  disk0: 'f_disk0', disk1: 'f_disk1', disk_extra: 'f_disk_extra',
  data_alta: 'f_data_alta', data_baixa: 'f_data_baixa',
};

function clearFieldErrors() {
  Object.values(FIELD_IDS).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('field-error');
    const msg = el?.parentElement?.querySelector('.field-error-msg');
    if (msg) msg.remove();
  });
}

function showFieldErrors(errors) {
  Object.entries(errors).forEach(([field, msg]) => {
    const id = FIELD_IDS[field];
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('field-error');
    const span = document.createElement('span');
    span.className = 'field-error-msg';
    span.textContent = msg;
    el.parentElement.appendChild(span);
  });
  const firstErr = Object.keys(errors).map(f => FIELD_IDS[f]).find(Boolean);
  if (firstErr) document.getElementById(firstErr)?.focus();
}

function populateTeamSelect(selectedId) {
  const sel = document.getElementById('f_team_id');
  sel.innerHTML = '<option value="">— No definit —</option>' +
    allTeams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  sel.value = selectedId || '';
}

function populateEnvironmentSelect(selectedId) {
  const sel = document.getElementById('f_environment_id');
  sel.innerHTML = '<option value="">— No definit —</option>' +
    allEnvironments.map(r => {
      const label = r.delete_date ? `${r.name} [retirat]` : r.name;
      return `<option value="${r.id}">${label}</option>`;
    }).join('');
  sel.value = selectedId || '';
}

function renderUsesChecklist(selectedIds) {
  const container = document.getElementById('f_uses_list');
  if (!allUses.length) {
    container.classList.add('empty-hint');
    container.innerHTML = '';
    return;
  }
  container.classList.remove('empty-hint');
  container.innerHTML = allUses.map(u => {
    const checked = selectedIds.includes(u.id);
    return `
      <label class="use-check-item ${checked ? 'selected' : ''}" onclick="toggleUseItem(this, ${u.id})">
        <input type="checkbox" ${checked ? 'checked' : ''} onclick="event.stopPropagation()">
        ${u.name}
      </label>`;
  }).join('');
}

function toggleUseItem(label, useId) {
  const cb = label.querySelector('input[type="checkbox"]');
  cb.checked = !cb.checked;
  label.classList.toggle('selected', cb.checked);
}

function getSelectedUseIds() {
  return Array.from(document.querySelectorAll('#f_uses_list input[type="checkbox"]:checked'))
    .map(cb => {
      const label = cb.closest('.use-check-item');
      const m = (label.getAttribute('onclick') || '').match(/toggleUseItem\(this,\s*(\d+)\)/);
      return m ? parseInt(m[1]) : null;
    }).filter(Boolean);
}

function openModal(server = null) {
  editingId = server ? server.id : null;
  document.getElementById('modalTitle').textContent = server ? `Editar: ${server.name}` : 'Nou Servidor';
  document.getElementById('f_name').value = server?.name || '';
  document.getElementById('f_service').value = server?.service || '';
  setDateFieldValue('f_data_alta', server?.data_alta || '');
  setDateFieldValue('f_data_baixa', server?.data_baixa || '');
  document.getElementById('f_vcpus').value = server?.vcpus || '';
  document.getElementById('f_memory').value = server?.memory || '';
  document.getElementById('f_disk0').value = server?.disk0 || '';
  document.getElementById('f_disk1').value = server?.disk1 || '';
  document.getElementById('f_disk_extra').value = server?.disk_extra || '';
  populateTeamSelect(server?.team?.id || null);
  populateEnvironmentSelect(server?.environment?.id || null);
  renderUsesChecklist(server ? (server.uses || []).map(u => u.id) : []);
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('f_name').focus(), 100);
}

function closeModal() {
  clearFieldErrors();
  document.getElementById('modalOverlay').classList.remove('open');
  editingId = null;
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

async function saveServer() {
  clearFieldErrors();

  const payload = {
    name:           document.getElementById('f_name').value.trim(),
    service:        document.getElementById('f_service').value,
    team_id:        parseInt(document.getElementById('f_team_id').value) || null,
    data_alta:      toApiDate(document.getElementById('f_data_alta').value) || null,
    data_baixa:     toApiDate(document.getElementById('f_data_baixa').value) || null,
    environment_id: parseInt(document.getElementById('f_environment_id').value) || null,
    vcpus:          parseInt(document.getElementById('f_vcpus').value) || 0,
    memory:         parseInt(document.getElementById('f_memory').value) || 0,
    disk0:          parseInt(document.getElementById('f_disk0').value) || 0,
    disk1:          parseInt(document.getElementById('f_disk1').value) || 0,
    disk_extra:     parseInt(document.getElementById('f_disk_extra').value) || 0,
    use_ids:        getSelectedUseIds(),
  };

  const url = editingId ? `/api/servers/${editingId}` : '/api/servers';
  const method = editingId ? 'PUT' : 'POST';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    showFieldErrors(data.errors || { name: data.error || 'Error desconegut' });
    showToast('Corregeix els errors del formulari', 'error');
    return;
  }

  closeModal();
  showToast(editingId ? 'Servidor actualitzat ✓' : 'Servidor creat ✓', 'success');
  await loadServers();
}

function editServer(id) {
  const server = allServers.find(s => s.id === id);
  if (server) openModal(server);
}

async function deleteServer(id, name) {
  if (!confirm(`Eliminar el servidor "${name}"?`)) return;
  const res = await fetch(`/api/servers/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showToast(`"${name}" eliminat`, 'success');
    await loadServers();
  } else {
    showToast('Error en eliminar', 'error');
  }
}

// ── Uses management ───────────────────────────────────────────────────────────

function openUsesModal() {
  renderUsesManager();
  document.getElementById('usesModalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('newUseName').focus(), 100);
}

function closeUsesModal() {
  document.getElementById('usesModalOverlay').classList.remove('open');
  document.getElementById('newUseName').value = '';
}

function handleUsesOverlayClick(e) {
  if (e.target === document.getElementById('usesModalOverlay')) closeUsesModal();
}

function renderUsesManager() {
  const list = document.getElementById('usesManagerList');
  if (!allUses.length) {
    list.innerHTML = `<p style="font-family:var(--mono);font-size:0.8rem;color:var(--text-muted);text-align:center;padding:1rem">Cap ús definit.</p>`;
    return;
  }
  list.innerHTML = allUses.map(u => `
    <div class="use-manager-row">
      <span>${u.name}</span>
      <button class="use-del-btn" onclick="deleteUseItem(${u.id}, '${u.name}')" title="Eliminar">✕</button>
    </div>`).join('');
}

async function createUse() {
  const input = document.getElementById('newUseName');
  const name = input.value.trim();
  if (!name) return;
  const res = await fetch('/api/uses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) {
    showToast(data.errors?.name || 'Error en crear', 'error');
    return;
  }
  input.value = '';
  await loadUses();
  renderUsesManager();
  showToast(`"${name}" afegit ✓`, 'success');
}

async function deleteUseItem(id, name) {
  if (!confirm(`Eliminar l'ús "${name}"? Es desassignarà de tots els servidors.`)) return;
  const res = await fetch(`/api/uses/${id}`, { method: 'DELETE' });
  if (res.ok) {
    await loadUses();
    renderUsesManager();
    await loadServers();
    showToast(`"${name}" eliminat`, 'success');
  } else {
    showToast('Error en eliminar', 'error');
  }
}

// ── Teams management ──────────────────────────────────────────────────────────

let editingTeamId = null;

function openTeamsModal() {
  editingTeamId = null;
  renderTeamsManager();
  document.getElementById('teamsModalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('newTeamName').focus(), 100);
}

function closeTeamsModal() {
  editingTeamId = null;
  document.getElementById('teamsModalOverlay').classList.remove('open');
  document.getElementById('newTeamName').value = '';
}

function handleTeamsOverlayClick(e) {
  if (e.target === document.getElementById('teamsModalOverlay')) closeTeamsModal();
}

function renderTeamsManager() {
  const list = document.getElementById('teamsManagerList');
  if (!allTeams.length) {
    list.innerHTML = `<p style="font-family:var(--mono);font-size:0.8rem;color:var(--text-muted);text-align:center;padding:1rem">Cap team definit.</p>`;
    return;
  }
  list.innerHTML = allTeams.map(t => `
    <div class="use-manager-row">
      <span>${t.name}</span>
      <div style="display:flex;gap:0.4rem">
        <button class="use-del-btn" onclick="editTeamItem(${t.id}, '${t.name.replace(/'/g, "\\'")}')" title="Editar" style="background:var(--accent)">✎</button>
        <button class="use-del-btn" onclick="deleteTeamItem(${t.id}, '${t.name.replace(/'/g, "\\'")}')" title="Eliminar">✕</button>
      </div>
    </div>`).join('');
}

function editTeamItem(id, name) {
  editingTeamId = id;
  document.getElementById('newTeamName').value = name;
  document.getElementById('btnSaveTeam').textContent = '✓ Actualitzar';
  document.getElementById('btnCancelTeam').style.display = '';
  document.getElementById('newTeamName').focus();
}

function cancelTeamEdit() {
  editingTeamId = null;
  document.getElementById('newTeamName').value = '';
  document.getElementById('btnSaveTeam').textContent = '+ Afegir';
  document.getElementById('btnCancelTeam').style.display = 'none';
}

async function saveTeam() {
  const input = document.getElementById('newTeamName');
  const name = input.value.trim();
  if (!name) return;

  if (editingTeamId) {
    const res = await fetch(`/api/teams/${editingTeamId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.errors?.name || 'Error en actualitzar', 'error'); return; }
    cancelTeamEdit();
    await loadTeams();
    renderTeamsManager();
    await loadServers();
    showToast(`"${name}" actualitzat ✓`, 'success');
  } else {
    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.errors?.name || 'Error en crear', 'error'); return; }
    input.value = '';
    await loadTeams();
    renderTeamsManager();
    showToast(`"${name}" afegit ✓`, 'success');
  }
}

async function deleteTeamItem(id, name) {
  if (!confirm(`Eliminar el team "${name}"? Els servidors que l'usin quedaran sense team assignat.`)) return;
  const res = await fetch(`/api/teams/${id}`, { method: 'DELETE' });
  if (res.ok) {
    if (editingTeamId === id) cancelTeamEdit();
    await loadTeams();
    renderTeamsManager();
    await loadServers();
    showToast(`"${name}" eliminat`, 'success');
  } else {
    showToast('Error en eliminar', 'error');
  }
}

// ── Environments management ───────────────────────────────────────────────────

let editingEnvironmentId = null;
let expandedEnvironmentId = null;
let editingPriceId = null;
const environmentPricesCache = {};

function openEnvironmentsModal() {
  expandedEnvironmentId = null;
  editingPriceId = null;
  cancelEnvironmentEdit();
  document.getElementById('environmentsModalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('newEnvironmentName').focus(), 100);
}

function closeEnvironmentsModal() {
  expandedEnvironmentId = null;
  editingPriceId = null;
  cancelEnvironmentEdit();
  document.getElementById('environmentsModalOverlay').classList.remove('open');
}

function handleEnvironmentsOverlayClick(e) {
  if (e.target === document.getElementById('environmentsModalOverlay')) closeEnvironmentsModal();
}

function renderEnvironmentsManager() {
  const list = document.getElementById('environmentsManagerList');
  if (!allEnvironments.length) {
    list.innerHTML = `<p style="font-family:var(--mono);font-size:0.8rem;color:var(--text-muted);text-align:center;padding:1rem">Cap entorn definit.</p>`;
    return;
  }
  list.innerHTML = allEnvironments.map(r => {
    const retired = !!r.delete_date;
    const isEditing = editingEnvironmentId === r.id;
    const isExpanded = expandedEnvironmentId === r.id;
    return `
    <div class="running-manager-entry">
      <div class="running-manager-row ${retired ? 'retired' : ''} ${isEditing ? 'editing' : ''} ${isExpanded ? 'has-panel' : ''}">
        <span class="r-name">${r.name}</span>
        <span class="r-date">Creació: ${fmtDate(r.create_date)}</span>
        <span class="r-date">${r.delete_date ? `Baixa: ${fmtDate(r.delete_date)}` : '<span style="color:var(--green)">Actiu</span>'}</span>
        <button class="r-prices-btn${isExpanded ? ' active' : ''}" onclick="toggleEnvironmentPrices(${r.id})">Preus ${isExpanded ? '▴' : '▾'}</button>
        <button class="r-edit-btn" onclick="editEnvironmentItem(${r.id})" title="Editar">✎</button>
        <button class="r-del-btn" onclick="deleteEnvironmentItem(${r.id}, '${r.name}')" title="Eliminar">✕</button>
      </div>
      ${isExpanded ? `<div class="running-prices-panel" id="prices-panel-${r.id}"><p style="font-family:var(--mono);font-size:0.75rem;color:var(--text-muted);padding:0.4rem">Carregant...</p></div>` : ''}
    </div>`;
  }).join('');

  if (expandedEnvironmentId !== null && environmentPricesCache[expandedEnvironmentId] !== undefined) {
    renderEnvironmentPricesPanel(expandedEnvironmentId);
  }
}

function editEnvironmentItem(id) {
  const r = allEnvironments.find(r => r.id === id);
  if (!r) return;
  editingEnvironmentId = id;
  document.getElementById('newEnvironmentName').value = r.name;
  setDateFieldValue('newEnvironmentCreate', r.create_date || '');
  setDateFieldValue('newEnvironmentDelete', r.delete_date || '');
  document.getElementById('btnSaveEnvironment').textContent = '✓ Actualitzar';
  document.getElementById('btnCancelEnvironment').style.display = '';
  renderEnvironmentsManager();
  document.getElementById('newEnvironmentName').focus();
}

function cancelEnvironmentEdit() {
  editingEnvironmentId = null;
  const nameEl    = document.getElementById('newEnvironmentName');
  const createEl  = document.getElementById('newEnvironmentCreate');
  const deleteEl  = document.getElementById('newEnvironmentDelete');
  const saveBtn   = document.getElementById('btnSaveEnvironment');
  const cancelBtn = document.getElementById('btnCancelEnvironment');
  if (nameEl)    nameEl.value = '';
  if (createEl)  createEl.value = isoToDisplayDate(new Date().toISOString().slice(0, 10));
  if (deleteEl)  deleteEl.value = '';
  if (saveBtn)   saveBtn.textContent = '+ Afegir';
  if (cancelBtn) cancelBtn.style.display = 'none';
  renderEnvironmentsManager();
}

async function saveEnvironment() {
  if (editingEnvironmentId) {
    await updateEnvironmentEntry();
  } else {
    await createEnvironment();
  }
}

async function createEnvironment() {
  const name = document.getElementById('newEnvironmentName').value.trim();
  if (!name) return;
  const create_date = toApiDate(document.getElementById('newEnvironmentCreate').value) || null;
  const delete_date = toApiDate(document.getElementById('newEnvironmentDelete').value) || null;
  const res = await fetch('/api/environments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, create_date, delete_date }),
  });
  const data = await res.json();
  if (!res.ok) {
    showToast(data.errors?.name || 'Error en crear', 'error');
    return;
  }
  cancelEnvironmentEdit();
  await loadEnvironments();
  renderEnvironmentsManager();
  showToast(`"${name}" afegit ✓`, 'success');
}

async function updateEnvironmentEntry() {
  const name = document.getElementById('newEnvironmentName').value.trim();
  if (!name) return;
  const create_date = toApiDate(document.getElementById('newEnvironmentCreate').value) || null;
  const delete_date = toApiDate(document.getElementById('newEnvironmentDelete').value) || null;
  const id = editingEnvironmentId;
  const res = await fetch(`/api/environments/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, create_date, delete_date }),
  });
  const data = await res.json();
  if (!res.ok) {
    showToast(data.errors?.name || 'Error en actualitzar', 'error');
    return;
  }
  cancelEnvironmentEdit();
  await loadEnvironments();
  renderEnvironmentsManager();
  await loadServers();
  showToast(`"${name}" actualitzat ✓`, 'success');
}

async function deleteEnvironmentItem(id, name) {
  if (!confirm(`Eliminar l'entorn "${name}"? Els servidors que l'usin quedaran sense entorn assignat.`)) return;
  const res = await fetch(`/api/environments/${id}`, { method: 'DELETE' });
  if (res.ok) {
    if (editingEnvironmentId === id) cancelEnvironmentEdit();
    if (expandedEnvironmentId === id) { expandedEnvironmentId = null; editingPriceId = null; }
    delete environmentPricesCache[id];
    await loadEnvironments();
    renderEnvironmentsManager();
    await loadServers();
    showToast(`"${name}" eliminat`, 'success');
  } else {
    showToast('Error en eliminar', 'error');
  }
}

// ── Environment price management ──────────────────────────────────────────────

async function toggleEnvironmentPrices(id) {
  if (expandedEnvironmentId === id) {
    expandedEnvironmentId = null;
    editingPriceId = null;
    renderEnvironmentsManager();
    return;
  }
  expandedEnvironmentId = id;
  editingPriceId = null;
  renderEnvironmentsManager();
  await refreshEnvironmentPrices(id);
}

async function refreshEnvironmentPrices(environmentId) {
  const res = await fetch(`/api/environments/${environmentId}/prices`);
  environmentPricesCache[environmentId] = await res.json();
  renderEnvironmentPricesPanel(environmentId);
}

function fmtPrice(val) {
  const n = parseFloat(val);
  return isNaN(n) ? '0.0000' : n.toFixed(4);
}

function renderEnvironmentPricesPanel(environmentId) {
  const panel = document.getElementById(`prices-panel-${environmentId}`);
  if (!panel) return;
  const prices = environmentPricesCache[environmentId] || [];

  const headers = ['€/vCPU', '€/GB Mem', '€/GB Disk', 'Inici', 'Fi', ''].map(h =>
    `<span class="price-header-cell">${h}</span>`).join('');

  const priceRows = prices.map(p => {
    if (editingPriceId === p.id) {
      return `
        <input type="number" step="0.0001" min="0" id="ep_vcpu_${p.id}" value="${p.price_vcpu}">
        <input type="number" step="0.0001" min="0" id="ep_mem_${p.id}" value="${p.price_mem}">
        <input type="number" step="0.0001" min="0" id="ep_disk_${p.id}" value="${p.price_disk}">
        <input type="text" data-date-format="yyyy/mm/dd" inputmode="numeric" maxlength="10" placeholder="yyyy/mm/dd" id="ep_start_${p.id}" value="${isoToDisplayDate(p.start_date || '')}">
        <input type="text" data-date-format="yyyy/mm/dd" inputmode="numeric" maxlength="10" placeholder="yyyy/mm/dd" id="ep_end_${p.id}" value="${isoToDisplayDate(p.end_date || '')}">
        <div class="price-actions">
          <button class="save" onclick="savePriceRow(${environmentId}, ${p.id})" title="Guardar">✓</button>
          <button class="del" onclick="cancelPriceEdit(${environmentId})" title="Cancel·lar">✕</button>
        </div>`;
    }
    const endSpan = p.end_date
      ? `<span class="price-cell">${fmtDate(p.end_date)}</span>`
      : `<span class="price-cell" style="color:var(--green)">Actual</span>`;
    return `
      <span class="price-cell">${fmtPrice(p.price_vcpu)}</span>
      <span class="price-cell">${fmtPrice(p.price_mem)}</span>
      <span class="price-cell">${fmtPrice(p.price_disk)}</span>
      <span class="price-cell">${fmtDate(p.start_date)}</span>
      ${endSpan}
      <div class="price-actions">
        <button class="edit" onclick="editPriceRow(${environmentId}, ${p.id})" title="Editar">✎</button>
        <button class="del" onclick="deletePriceRow(${environmentId}, ${p.id})" title="Eliminar">✕</button>
      </div>`;
  }).join('');

  const separator = prices.length ? '<div class="price-separator"></div>' : '';

  panel.innerHTML = `
    <div class="prices-grid">
      ${headers}
      ${priceRows}
      ${separator}
      <input type="number" step="0.0001" min="0" placeholder="0.0000" id="np_vcpu_${environmentId}">
      <input type="number" step="0.0001" min="0" placeholder="0.0000" id="np_mem_${environmentId}">
      <input type="number" step="0.0001" min="0" placeholder="0.0000" id="np_disk_${environmentId}">
      <input type="text" data-date-format="yyyy/mm/dd" inputmode="numeric" maxlength="10" placeholder="yyyy/mm/dd" id="np_start_${environmentId}">
      <input type="text" data-date-format="yyyy/mm/dd" inputmode="numeric" maxlength="10" placeholder="yyyy/mm/dd" id="np_end_${environmentId}">
      <button class="price-add-btn" onclick="createEnvironmentPrice(${environmentId})">+</button>
    </div>`;

  initDateInputs(panel);
}

function editPriceRow(environmentId, priceId) {
  editingPriceId = priceId;
  renderEnvironmentPricesPanel(environmentId);
}

function cancelPriceEdit(environmentId) {
  editingPriceId = null;
  renderEnvironmentPricesPanel(environmentId);
}

async function savePriceRow(environmentId, priceId) {
  const payload = {
    price_vcpu: parseFloat(document.getElementById(`ep_vcpu_${priceId}`).value) || 0,
    price_mem:  parseFloat(document.getElementById(`ep_mem_${priceId}`).value) || 0,
    price_disk: parseFloat(document.getElementById(`ep_disk_${priceId}`).value) || 0,
    start_date: toApiDate(document.getElementById(`ep_start_${priceId}`).value) || null,
    end_date:   toApiDate(document.getElementById(`ep_end_${priceId}`).value) || null,
  };
  const res = await fetch(`/api/environments/${environmentId}/prices/${priceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const d = await res.json();
    showToast(Object.values(d.errors || {})[0] || 'Error en actualitzar', 'error');
    return;
  }
  editingPriceId = null;
  await refreshEnvironmentPrices(environmentId);
  showToast('Preu actualitzat ✓', 'success');
}

async function createEnvironmentPrice(environmentId) {
  const payload = {
    price_vcpu: parseFloat(document.getElementById(`np_vcpu_${environmentId}`).value) || 0,
    price_mem:  parseFloat(document.getElementById(`np_mem_${environmentId}`).value) || 0,
    price_disk: parseFloat(document.getElementById(`np_disk_${environmentId}`).value) || 0,
    start_date: toApiDate(document.getElementById(`np_start_${environmentId}`).value) || null,
    end_date:   toApiDate(document.getElementById(`np_end_${environmentId}`).value) || null,
  };
  const res = await fetch(`/api/environments/${environmentId}/prices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const d = await res.json();
    showToast(Object.values(d.errors || {})[0] || 'Error en crear preu', 'error');
    return;
  }
  await refreshEnvironmentPrices(environmentId);
  showToast('Preu afegit ✓', 'success');
}

async function deletePriceRow(environmentId, priceId) {
  if (!confirm('Eliminar aquest preu?')) return;
  const res = await fetch(`/api/environments/${environmentId}/prices/${priceId}`, { method: 'DELETE' });
  if (res.ok) {
    if (editingPriceId === priceId) editingPriceId = null;
    await refreshEnvironmentPrices(environmentId);
    showToast('Preu eliminat', 'success');
  } else {
    showToast('Error en eliminar', 'error');
  }
}

// ── Hardware history ──────────────────────────────────────────────────────────

let hwHistoryServerId = null;
let hwHistoryRecords = [];
let editingHwDate = null;

function openHwHistoryModal(serverId, serverName) {
  hwHistoryServerId = serverId;
  editingHwDate = null;
  document.getElementById('hwHistoryTitle').textContent = `Historial Maquinari — ${serverName}`;
  document.getElementById('hwHistoryOverlay').classList.add('open');
  const today = new Date().toISOString().slice(0, 10);
  setDateFieldValue('hwAddDate', today);
  document.getElementById('hwAddVcpus').value = '';
  document.getElementById('hwAddMemory').value = '';
  document.getElementById('hwAddDisk0').value = '';
  document.getElementById('hwAddDisk1').value = '';
  document.getElementById('hwAddDiskExtra').value = '';
  loadHwHistory();
}

function closeHwHistoryModal() {
  document.getElementById('hwHistoryOverlay').classList.remove('open');
  hwHistoryServerId = null;
  editingHwDate = null;
}

function handleHwHistoryOverlayClick(e) {
  if (e.target === document.getElementById('hwHistoryOverlay')) closeHwHistoryModal();
}

async function loadHwHistory() {
  const res = await fetch(`/api/servers/${hwHistoryServerId}/history`);
  hwHistoryRecords = await res.json();
  renderHwHistory();
}

function renderHwHistory() {
  const tbody = document.getElementById('hwHistoryBody');
  if (!hwHistoryRecords.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:1.5rem">Cap registre de maquinari</td></tr>`;
    return;
  }
  tbody.innerHTML = hwHistoryRecords.map(r => {
    const total = diskTotal(r);
    if (editingHwDate === r.data_modificacio) {
      return `<tr class="editing">
        <td><input type="text" data-date-format="yyyy/mm/dd" inputmode="numeric" maxlength="10" placeholder="yyyy/mm/dd" id="hw_edit_date" value="${isoToDisplayDate(r.data_modificacio)}"></td>
        <td class="num"><input type="number" id="hw_edit_vcpus" min="0" value="${r.vcpus}"></td>
        <td class="num"><input type="number" id="hw_edit_memory" min="0" value="${r.memory}"></td>
        <td class="num"><input type="number" id="hw_edit_disk0" min="0" value="${r.disk0}"></td>
        <td class="num"><input type="number" id="hw_edit_disk1" min="0" value="${r.disk1}"></td>
        <td class="num"><input type="number" id="hw_edit_disk_extra" min="0" value="${r.disk_extra}"></td>
        <td class="num">—</td>
        <td class="actions-cell">
          <button class="hw-btn save" onclick="saveHwRow('${r.data_modificacio}')">✓</button>
          <button class="hw-btn" onclick="cancelHwEdit()">✕</button>
        </td>
      </tr>`;
    }
    return `<tr>
      <td style="font-family:var(--mono);font-size:0.8rem">${fmtDate(r.data_modificacio)}</td>
      <td class="num">${r.vcpus}</td>
      <td class="num">${r.memory}</td>
      <td class="num">${r.disk0}</td>
      <td class="num">${r.disk1 || '—'}</td>
      <td class="num">${r.disk_extra || '—'}</td>
      <td class="num"><strong>${total}</strong></td>
      <td class="actions-cell">
        <button class="hw-btn edit" onclick="editHwRow('${r.data_modificacio}')">✎</button>
        <button class="hw-btn del" onclick="deleteHwRow('${r.data_modificacio}')">✕</button>
      </td>
    </tr>`;
  }).join('');

  initDateInputs(tbody);
}

function editHwRow(date) {
  editingHwDate = date;
  renderHwHistory();
}

function cancelHwEdit() {
  editingHwDate = null;
  renderHwHistory();
}

async function saveHwRow(originalDate) {
  const newDate = toApiDate(document.getElementById('hw_edit_date').value);
  if (!newDate) { showToast('La data és obligatòria', 'error'); return; }
  const payload = {
    data_modificacio: newDate,
    vcpus:      parseInt(document.getElementById('hw_edit_vcpus').value) || 0,
    memory:     parseInt(document.getElementById('hw_edit_memory').value) || 0,
    disk0:      parseInt(document.getElementById('hw_edit_disk0').value) || 0,
    disk1:      parseInt(document.getElementById('hw_edit_disk1').value) || 0,
    disk_extra: parseInt(document.getElementById('hw_edit_disk_extra').value) || 0,
  };
  const res = await fetch(`/api/servers/${hwHistoryServerId}/history/${originalDate}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const d = await res.json();
    showToast(d.error || 'Error en guardar', 'error');
    return;
  }
  editingHwDate = null;
  showToast('Registre actualitzat ✓');
  await Promise.all([loadHwHistory(), loadServers()]);
}

async function createHwSnapshot() {
  const dateVal = toApiDate(document.getElementById('hwAddDate').value);
  if (!dateVal) { showToast('La data és obligatòria', 'error'); return; }
  const payload = {
    data_modificacio: dateVal,
    vcpus:      parseInt(document.getElementById('hwAddVcpus').value) || 0,
    memory:     parseInt(document.getElementById('hwAddMemory').value) || 0,
    disk0:      parseInt(document.getElementById('hwAddDisk0').value) || 0,
    disk1:      parseInt(document.getElementById('hwAddDisk1').value) || 0,
    disk_extra: parseInt(document.getElementById('hwAddDiskExtra').value) || 0,
  };
  const res = await fetch(`/api/servers/${hwHistoryServerId}/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const d = await res.json();
    showToast(d.error || 'Error en crear', 'error');
    return;
  }
  document.getElementById('hwAddVcpus').value = '';
  document.getElementById('hwAddMemory').value = '';
  document.getElementById('hwAddDisk0').value = '';
  document.getElementById('hwAddDisk1').value = '';
  document.getElementById('hwAddDiskExtra').value = '';
  showToast('Registre afegit ✓');
  await Promise.all([loadHwHistory(), loadServers()]);
}

async function deleteHwRow(date) {
  if (!confirm(`Eliminar el registre del ${fmtDate(date)}?`)) return;
  const res = await fetch(`/api/servers/${hwHistoryServerId}/history/${date}`, { method: 'DELETE' });
  if (!res.ok) { showToast('Error en eliminar', 'error'); return; }
  showToast('Registre eliminat');
  await Promise.all([loadHwHistory(), loadServers()]);
}

// ── Hardware report ───────────────────────────────────────────────────────────

function applyActiveFilters(data) {
  const filterService = document.getElementById('reportService').value;
  const filterUse     = document.getElementById('reportUse').value;
  const filterTeam    = document.getElementById('reportTeam').value;
  return data.filter(s => {
    if (filterService && s.service !== filterService) return false;
    if (filterUse && !(s.uses || []).includes(filterUse)) return false;
    if (filterTeam    && s.team    !== filterTeam)    return false;
    return true;
  });
}

let reportData = [];

function populateReportSelect(selectId, values, defaultLabel) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = `<option value="">${defaultLabel}</option>` +
    values.map(value => `<option value="${value}">${value}</option>`).join('');
  select.value = values.includes(currentValue) ? currentValue : '';
}

function syncReportFilterOptions() {
  const service = document.getElementById('reportService').value;
  const useSelect = document.getElementById('reportUse');

  const useValues = [...new Set(
    reportData
      .filter(s => !service || s.service === service)
      .flatMap(s => s.uses || [])
  )].sort((a, b) => a.localeCompare(b));

  populateReportSelect('reportUse', useValues, 'Tots els uses');

  const selectedUse = useSelect.value;
  const teamValues = [...new Set(
    reportData
      .filter(s => !service || s.service === service)
      .filter(s => !selectedUse || (s.uses || []).includes(selectedUse))
      .map(s => s.team)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  populateReportSelect('reportTeam', teamValues, 'Tots els teams');
}

function handleReportFilterChange() {
  syncReportFilterOptions();
  applyReportFilters();
}

function openReportModal() {
  reportData = [];
  document.getElementById('reportModalOverlay').classList.add('open');
  document.getElementById('reportResults').innerHTML = '';
  document.getElementById('reportStats').innerHTML = '';
  document.getElementById('btnInvoice').style.display = 'none';
  document.getElementById('reportService').value = '';
  document.getElementById('reportUse').innerHTML = '<option value="">Tots els uses</option>';
  document.getElementById('reportTeam').innerHTML = '<option value="">Tots els teams</option>';
  const today = new Date().toISOString().slice(0, 10);
  setDateFieldValue('reportDate', today);
}

function closeReportModal() {
  document.getElementById('reportModalOverlay').classList.remove('open');
}

function handleReportOverlayClick(e) {
  if (e.target === document.getElementById('reportModalOverlay')) closeReportModal();
}

async function runReport() {
  const dateVal = toApiDate(document.getElementById('reportDate').value);
  if (!dateVal) { showToast('Selecciona una data', 'error'); return; }
  if (!isCompleteDateValue(dateVal)) { showToast('La data ha de tenir format yyyy/mm/dd', 'error'); return; }

  const res = await fetch(`/api/report/hardware?date=${encodeURIComponent(dateVal)}`);
  const data = await res.json();

  if (!res.ok) {
    showToast(data.error || 'Error en la consulta', 'error');
    return;
  }

  reportData = data;
  syncReportFilterOptions();
  applyReportFilters();
}

function applyReportFilters() {
  const resultsEl = document.getElementById('reportResults');
  const statsEl = document.getElementById('reportStats');
  const btnInvoice = document.getElementById('btnInvoice');

  if (!reportData.length) {
    resultsEl.innerHTML = '<div class="empty-state" style="padding:2rem 0"><p>Cap servidor actiu en aquesta data</p></div>';
    statsEl.innerHTML = '';
    btnInvoice.style.display = 'none';
    return;
  }

  const filtered = applyActiveFilters(reportData);

  if (!filtered.length) {
    resultsEl.innerHTML = '<div class="empty-state" style="padding:2rem 0"><p>Cap servidor coincideix amb els filtres</p></div>';
    statsEl.innerHTML = '';
    btnInvoice.style.display = 'none';
    return;
  }
  btnInvoice.style.display = '';

  let totalVcpus = 0, totalMem = 0, totalDisk = 0, noHw = 0;
  filtered.forEach(s => {
    if (s.vcpus == null) { noHw++; return; }
    totalVcpus += s.vcpus || 0;
    totalMem += s.memory || 0;
    totalDisk += diskTotal(s);
  });

  const fmtNum = v => v == null ? '<span class="report-no-hw">—</span>' : v;

  const rows = filtered.map(s => {
    const disk = s.vcpus != null ? diskTotal(s) : null;
    return `<tr>
      <td>${s.name}</td>
      <td>${s.service || '—'}</td>
      <td>${s.environment || '—'}</td>
      <td>${s.team || '—'}</td>
      <td>${s.uses.length ? s.uses.join(', ') : '—'}</td>
      <td class="num">${fmtNum(s.vcpus)}</td>
      <td class="num">${fmtNum(s.memory)}</td>
      <td class="num">${disk != null ? disk : '<span class="report-no-hw">—</span>'}</td>
      <td>${s.hw_date ? fmtDate(s.hw_date) : '<span class="report-no-hw">sense hw</span>'}</td>
    </tr>`;
  }).join('');

  resultsEl.innerHTML = `
    <div class="report-table-wrap">
      <table>
        <thead><tr>
          <th>Nom</th><th>Service</th><th>Entorn</th><th>Team</th><th>Usos</th>
          <th class="num">vCPUs</th><th class="num">Mem (GB)</th>
          <th class="num">Disc (GB)</th><th>Hw Data</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  statsEl.innerHTML = `
    <span>${filtered.length} servidor${filtered.length !== 1 ? 's' : ''}</span>
    <span>${fmt2(totalVcpus)} vCPUs</span>
    <span>${fmt2(totalMem)} GB mem</span>
    <span>${fmt2(totalDisk)} GB disc</span>
    ${noHw ? `<span>${noHw} sense maquinari</span>` : ''}`;
}

// ── Invoice ───────────────────────────────────────────────────────────────────

let invoiceData = [];

async function openInvoiceModal() {
  const dateVal = toApiDate(document.getElementById('reportDate').value);
  if (!isCompleteDateValue(dateVal)) { showToast('La data ha de tenir format yyyy/mm/dd', 'error'); return; }
  document.getElementById('invoiceTitle').textContent = `Factura — ${fmtDate(dateVal)}`;
  document.getElementById('invoiceModalOverlay').classList.add('open');
  document.getElementById('invoiceResults').innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Carregant...</p>';
  document.getElementById('invoiceGrandTotal').innerHTML = '';
  document.getElementById('btnInvoiceCsv').style.display = 'none';

  const res = await fetch(`/api/report/invoice?date=${encodeURIComponent(dateVal)}`);
  const data = await res.json();
  if (!res.ok) { showToast(data.error || 'Error en la factura', 'error'); return; }

  invoiceData = applyActiveFilters(data);

  renderInvoice();
}

function closeInvoiceModal() {
  document.getElementById('invoiceModalOverlay').classList.remove('open');
}

function handleInvoiceOverlayClick(e) {
  if (e.target === document.getElementById('invoiceModalOverlay')) closeInvoiceModal();
}

function renderInvoice() {
  const fmtC = v => v == null ? '<span class="invoice-no-price">—</span>' : fmt2(v);
  const fmtP = v => v == null ? '' : `€${v.toFixed(4)}/u`;

  const rows = invoiceData.map(s => {
    const noPrice = s.total == null;
    return `<tr>
      <td>${s.name}</td>
      <td>${s.service || '—'}</td>
      <td>${s.team || '—'}</td>
      <td>
        ${s.environment || '<span class="invoice-no-price">sense entorn</span>'}
        ${s.environment && s.price_vcpu == null ? '<span class="invoice-price-hint">sense preu en aquesta data</span>' : ''}
      </td>
      <td class="num">${fmt2(s.vcpus)}<br><span class="invoice-price-hint">${fmtP(s.price_vcpu)}</span></td>
      <td class="num">${fmtC(s.cost_vcpu)}</td>
      <td class="num">${fmt2(s.memory)}<br><span class="invoice-price-hint">${fmtP(s.price_mem)}</span></td>
      <td class="num">${fmtC(s.cost_mem)}</td>
      <td class="num">${fmt2(s.disk)}<br><span class="invoice-price-hint">${fmtP(s.price_disk)}</span></td>
      <td class="num">${fmtC(s.cost_disk)}</td>
      <td class="num${noPrice ? '' : ' invoice-total-cell'}">${fmtC(s.total)}</td>
    </tr>`;
  }).join('');

  const grandTotal = invoiceData.reduce((sum, s) => sum + (s.total || 0), 0);
  const countPriced = invoiceData.filter(s => s.total != null).length;
  const totals = invoiceData.reduce((acc, s) => {
    acc.vcpus += s.vcpus || 0;
    acc.costVcpu += s.cost_vcpu || 0;
    acc.memory += s.memory || 0;
    acc.costMem += s.cost_mem || 0;
    acc.disk += s.disk || 0;
    acc.costDisk += s.cost_disk || 0;
    acc.total += s.total || 0;
    return acc;
  }, {
    vcpus: 0,
    costVcpu: 0,
    memory: 0,
    costMem: 0,
    disk: 0,
    costDisk: 0,
    total: 0,
  });

  const totalsRow = `
    <tr class="invoice-totals-row">
      <td colspan="4">Totals</td>
      <td class="num">${fmt2(totals.vcpus)}</td>
      <td class="num">${fmt2(totals.costVcpu)}</td>
      <td class="num">${fmt2(totals.memory)}</td>
      <td class="num">${fmt2(totals.costMem)}</td>
      <td class="num">${fmt2(totals.disk)}</td>
      <td class="num">${fmt2(totals.costDisk)}</td>
      <td class="num invoice-total-cell">${fmt2(totals.total)}</td>
    </tr>`;

  document.getElementById('invoiceResults').innerHTML = `
    <div class="report-table-wrap">
      <table>
        <thead><tr>
          <th>Nom</th><th>Service</th><th>Team</th><th>Entorn</th>
          <th class="num">vCPUs</th><th class="num">Cost vCPU</th>
          <th class="num">Mem (GB)</th><th class="num">Cost Mem</th>
          <th class="num">Disc (GB)</th><th class="num">Cost Disc</th>
          <th class="num">Total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>${totalsRow}</tfoot>
      </table>
    </div>`;

  document.getElementById('invoiceGrandTotal').innerHTML = `
    <span class="igt-label">Total factura</span>
    <span class="igt-value">${fmt2(grandTotal)}</span>
    ${countPriced < invoiceData.length
      ? `<span class="igt-label">(${invoiceData.length - countPriced} servidor${invoiceData.length - countPriced !== 1 ? 's' : ''} sense preu)</span>`
      : ''}`;

  document.getElementById('btnInvoiceCsv').style.display = invoiceData.length ? '' : 'none';
}

function escapeCsvValue(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadInvoiceCsv() {
  if (!invoiceData.length) return;

  const headers = ['Nom', 'Service', 'Team', 'Entorn', 'vCPUs', 'Cost vCPU', 'Mem (GB)', 'Cost Mem', 'Disc (GB)', 'Cost Disc', 'Total'];
  const rows = invoiceData.map(s => [
    s.name,
    s.service || '',
    s.team || '',
    s.environment || '',
    fmt2(s.vcpus),
    fmt2(s.cost_vcpu),
    fmt2(s.memory),
    fmt2(s.cost_mem),
    fmt2(s.disk),
    fmt2(s.cost_disk),
    fmt2(s.total),
  ]);

  const totals = invoiceData.reduce((acc, s) => {
    acc.vcpus += s.vcpus || 0;
    acc.costVcpu += s.cost_vcpu || 0;
    acc.memory += s.memory || 0;
    acc.costMem += s.cost_mem || 0;
    acc.disk += s.disk || 0;
    acc.costDisk += s.cost_disk || 0;
    acc.total += s.total || 0;
    return acc;
  }, { vcpus: 0, costVcpu: 0, memory: 0, costMem: 0, disk: 0, costDisk: 0, total: 0 });

  rows.push(['Totals', '', '', '', fmt2(totals.vcpus), fmt2(totals.costVcpu), fmt2(totals.memory), fmt2(totals.costMem), fmt2(totals.disk), fmt2(totals.costDisk), fmt2(totals.total)]);

  const csv = [headers, ...rows]
    .map(row => row.map(escapeCsvValue).join(';'))
    .join('\n');

  const dateVal = (normalizeComparableDate(document.getElementById('reportDate').value) || 'factura').replaceAll('/', '-');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `factura-${dateVal}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = (type === 'success' ? '✓ ' : '✕ ') + msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

document.addEventListener('click', e => {
  const dropdown = document.getElementById('menuDropdown');
  if (!managementMenuOpen || !dropdown) return;
  if (!dropdown.contains(e.target)) closeManagementMenu();
});

// ── Init ──────────────────────────────────────────────────────────────────────

initTheme();
initDateInputs();
Promise.all([loadUses(), loadTeams(), loadEnvironments(), loadServers()]);
