// ── State ─────────────────────────────────────────────────────────────────────

let allServers = [];
let allUses = [];
let allRunning = [];
let editingId = null;
let sortState = { key: null, dir: 1 };

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadServers() {
  const res = await fetch('/api/servers');
  allServers = await res.json();
  filterAndRender();
  loadStats();
}

async function loadUses() {
  const res = await fetch('/api/uses');
  allUses = await res.json();
}

async function loadRunning() {
  const res = await fetch('/api/running');
  allRunning = await res.json();
}

async function loadStats() {
  const res = await fetch('/api/stats');
  const s = await res.json();
  document.getElementById('statTotal').textContent = s.total_servers;
  document.getElementById('statVcpus').textContent = s.total_vcpus || 0;
  document.getElementById('statMemory').innerHTML = `${s.total_memory_gb || 0}<span class="stat-unit">GB</span>`;
  document.getElementById('statDisk').innerHTML = `${s.total_disk_gb || 0}<span class="stat-unit">GB</span>`;
}

// ── Table rendering ───────────────────────────────────────────────────────────

function diskTotal(s) {
  return (s.disk0 || 0) + (s.disk1 || 0) + (s.disk_extra || 0);
}

function fmtDate(val) {
  if (!val) return '—';
  const parts = val.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return val;
}

function renderTable(servers) {
  const tbody = document.getElementById('tableBody');
  if (!servers.length) {
    tbody.innerHTML = `<tr><td colspan="14"><div class="empty-state"><div class="icon">◌</div><p>No s'han trobat servidors</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = servers.map(s => {
    const total = diskTotal(s);
    const usesBadges = s.uses && s.uses.length
      ? `<div class="uses-cell">${s.uses.map(u => `<span class="badge badge-use">${u.name}</span>`).join('')}</div>`
      : '<span style="color:var(--text-muted)">—</span>';
    const runningBadge = s.running
      ? `<span class="badge badge-running${s.running.delete_date ? ' retired' : ''}">${s.running.name}</span>`
      : '<span style="color:var(--text-muted)">—</span>';
    return `
    <tr>
      <td><span class="cell-name">${s.name}</span></td>
      <td class="cell-num">${s.vcpus}</td>
      <td class="cell-num">${s.memory}</td>
      <td class="cell-num ${s.disk0 === 0 ? 'zero' : ''}">${s.disk0}</td>
      <td class="cell-num ${s.disk1 === 0 ? 'zero' : ''}">${s.disk1 || '—'}</td>
      <td class="cell-num ${s.disk_extra === 0 ? 'zero' : ''}">${s.disk_extra || '—'}</td>
      <td class="cell-num"><strong>${total}</strong></td>
      <td>${s.service ? `<span class="badge badge-service">${s.service}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${runningBadge}</td>
      <td>${usesBadges}</td>
      <td>${s.equip ? `<span class="badge badge-equip">${s.equip}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
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
  const q = document.getElementById('searchInput').value.toLowerCase();
  let list = allServers.filter(s =>
    s.name.toLowerCase().includes(q) ||
    (s.service || '').toLowerCase().includes(q) ||
    (s.equip || '').toLowerCase().includes(q) ||
    (s.running?.name || '').toLowerCase().includes(q) ||
    (s.uses || []).some(u => u.name.toLowerCase().includes(q))
  );

  if (sortState.key) {
    list = [...list].sort((a, b) => {
      const va = sortState.key === 'disk_total' ? diskTotal(a) : (a[sortState.key] ?? '');
      const vb = sortState.key === 'disk_total' ? diskTotal(b) : (b[sortState.key] ?? '');
      if (typeof va === 'number') return (va - vb) * sortState.dir;
      return String(va).localeCompare(String(vb)) * sortState.dir;
    });
  }

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
  const keys = ['name','vcpus','memory','disk0','disk1','disk_extra','disk_total','data_alta','data_baixa'];
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

// ── Server form ───────────────────────────────────────────────────────────────

const FIELD_IDS = {
  name: 'f_name', service: 'f_service', equip: 'f_equip',
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

function populateRunningSelect(selectedId) {
  const sel = document.getElementById('f_running_id');
  sel.innerHTML = '<option value="">— No definit —</option>' +
    allRunning.map(r => {
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
  document.getElementById('f_equip').value = server?.equip || '';
  document.getElementById('f_data_alta').value = server?.data_alta || '';
  document.getElementById('f_data_baixa').value = server?.data_baixa || '';
  document.getElementById('f_vcpus').value = server?.vcpus || '';
  document.getElementById('f_memory').value = server?.memory || '';
  document.getElementById('f_disk0').value = server?.disk0 || '';
  document.getElementById('f_disk1').value = server?.disk1 || '';
  document.getElementById('f_disk_extra').value = server?.disk_extra || '';
  populateRunningSelect(server?.running?.id || null);
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
    name:       document.getElementById('f_name').value.trim(),
    service:    document.getElementById('f_service').value,
    equip:      document.getElementById('f_equip').value.trim(),
    data_alta:  document.getElementById('f_data_alta').value || null,
    data_baixa: document.getElementById('f_data_baixa').value || null,
    running_id: parseInt(document.getElementById('f_running_id').value) || null,
    vcpus:      parseInt(document.getElementById('f_vcpus').value) || 0,
    memory:     parseInt(document.getElementById('f_memory').value) || 0,
    disk0:      parseInt(document.getElementById('f_disk0').value) || 0,
    disk1:      parseInt(document.getElementById('f_disk1').value) || 0,
    disk_extra: parseInt(document.getElementById('f_disk_extra').value) || 0,
    use_ids:    getSelectedUseIds(),
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

// ── Running management ────────────────────────────────────────────────────────

let editingRunningId = null;
let expandedRunningId = null;
let editingPriceId = null;
const runningPricesCache = {};

function openRunningModal() {
  expandedRunningId = null;
  editingPriceId = null;
  cancelRunningEdit();
  document.getElementById('runningModalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('newRunningName').focus(), 100);
}

function closeRunningModal() {
  expandedRunningId = null;
  editingPriceId = null;
  cancelRunningEdit();
  document.getElementById('runningModalOverlay').classList.remove('open');
}

function handleRunningOverlayClick(e) {
  if (e.target === document.getElementById('runningModalOverlay')) closeRunningModal();
}

function renderRunningManager() {
  const list = document.getElementById('runningManagerList');
  if (!allRunning.length) {
    list.innerHTML = `<p style="font-family:var(--mono);font-size:0.8rem;color:var(--text-muted);text-align:center;padding:1rem">Cap running definit.</p>`;
    return;
  }
  list.innerHTML = allRunning.map(r => {
    const retired = !!r.delete_date;
    const isEditing = editingRunningId === r.id;
    const isExpanded = expandedRunningId === r.id;
    return `
    <div class="running-manager-entry">
      <div class="running-manager-row ${retired ? 'retired' : ''} ${isEditing ? 'editing' : ''} ${isExpanded ? 'has-panel' : ''}">
        <span class="r-name">${r.name}</span>
        <span class="r-date">Creació: ${fmtDate(r.create_date)}</span>
        <span class="r-date">${r.delete_date ? `Baixa: ${fmtDate(r.delete_date)}` : '<span style="color:var(--green)">Actiu</span>'}</span>
        <button class="r-prices-btn${isExpanded ? ' active' : ''}" onclick="toggleRunningPrices(${r.id})">Preus ${isExpanded ? '▴' : '▾'}</button>
        <button class="r-edit-btn" onclick="editRunningItem(${r.id})" title="Editar">✎</button>
        <button class="r-del-btn" onclick="deleteRunningItem(${r.id}, '${r.name}')" title="Eliminar">✕</button>
      </div>
      ${isExpanded ? `<div class="running-prices-panel" id="prices-panel-${r.id}"><p style="font-family:var(--mono);font-size:0.75rem;color:var(--text-muted);padding:0.4rem">Carregant...</p></div>` : ''}
    </div>`;
  }).join('');

  if (expandedRunningId !== null && runningPricesCache[expandedRunningId] !== undefined) {
    renderRunningPricesPanel(expandedRunningId);
  }
}

function editRunningItem(id) {
  const r = allRunning.find(r => r.id === id);
  if (!r) return;
  editingRunningId = id;
  document.getElementById('newRunningName').value = r.name;
  document.getElementById('newRunningCreate').value = r.create_date || '';
  document.getElementById('newRunningDelete').value = r.delete_date || '';
  document.getElementById('btnSaveRunning').textContent = '✓ Actualitzar';
  document.getElementById('btnCancelRunning').style.display = '';
  renderRunningManager();
  document.getElementById('newRunningName').focus();
}

function cancelRunningEdit() {
  editingRunningId = null;
  const nameEl    = document.getElementById('newRunningName');
  const createEl  = document.getElementById('newRunningCreate');
  const deleteEl  = document.getElementById('newRunningDelete');
  const saveBtn   = document.getElementById('btnSaveRunning');
  const cancelBtn = document.getElementById('btnCancelRunning');
  if (nameEl)    nameEl.value = '';
  if (createEl)  createEl.value = new Date().toISOString().slice(0, 10);
  if (deleteEl)  deleteEl.value = '';
  if (saveBtn)   saveBtn.textContent = '+ Afegir';
  if (cancelBtn) cancelBtn.style.display = 'none';
  renderRunningManager();
}

async function saveRunning() {
  if (editingRunningId) {
    await updateRunningEntry();
  } else {
    await createRunning();
  }
}

async function createRunning() {
  const name = document.getElementById('newRunningName').value.trim();
  if (!name) return;
  const create_date = document.getElementById('newRunningCreate').value || null;
  const delete_date = document.getElementById('newRunningDelete').value || null;
  const res = await fetch('/api/running', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, create_date, delete_date }),
  });
  const data = await res.json();
  if (!res.ok) {
    showToast(data.errors?.name || 'Error en crear', 'error');
    return;
  }
  cancelRunningEdit();
  await loadRunning();
  renderRunningManager();
  showToast(`"${name}" afegit ✓`, 'success');
}

async function updateRunningEntry() {
  const name = document.getElementById('newRunningName').value.trim();
  if (!name) return;
  const create_date = document.getElementById('newRunningCreate').value || null;
  const delete_date = document.getElementById('newRunningDelete').value || null;
  const id = editingRunningId;
  const res = await fetch(`/api/running/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, create_date, delete_date }),
  });
  const data = await res.json();
  if (!res.ok) {
    showToast(data.errors?.name || 'Error en actualitzar', 'error');
    return;
  }
  cancelRunningEdit();
  await loadRunning();
  renderRunningManager();
  await loadServers();
  showToast(`"${name}" actualitzat ✓`, 'success');
}

async function deleteRunningItem(id, name) {
  if (!confirm(`Eliminar el running "${name}"? Els servidors que l'usin quedaran sense running assignat.`)) return;
  const res = await fetch(`/api/running/${id}`, { method: 'DELETE' });
  if (res.ok) {
    if (editingRunningId === id) cancelRunningEdit();
    if (expandedRunningId === id) { expandedRunningId = null; editingPriceId = null; }
    delete runningPricesCache[id];
    await loadRunning();
    renderRunningManager();
    await loadServers();
    showToast(`"${name}" eliminat`, 'success');
  } else {
    showToast('Error en eliminar', 'error');
  }
}

// ── Running price management ──────────────────────────────────────────────────

async function toggleRunningPrices(id) {
  if (expandedRunningId === id) {
    expandedRunningId = null;
    editingPriceId = null;
    renderRunningManager();
    return;
  }
  expandedRunningId = id;
  editingPriceId = null;
  renderRunningManager();
  await refreshRunningPrices(id);
}

async function refreshRunningPrices(runningId) {
  const res = await fetch(`/api/running/${runningId}/prices`);
  runningPricesCache[runningId] = await res.json();
  renderRunningPricesPanel(runningId);
}

function fmtPrice(val) {
  const n = parseFloat(val);
  return isNaN(n) ? '0.0000' : n.toFixed(4);
}

function renderRunningPricesPanel(runningId) {
  const panel = document.getElementById(`prices-panel-${runningId}`);
  if (!panel) return;
  const prices = runningPricesCache[runningId] || [];

  const headers = ['€/vCPU', '€/GB Mem', '€/GB Disk', 'Inici', 'Fi', ''].map(h =>
    `<span class="price-header-cell">${h}</span>`).join('');

  const priceRows = prices.map(p => {
    if (editingPriceId === p.id) {
      return `
        <input type="number" step="0.0001" min="0" id="ep_vcpu_${p.id}" value="${p.price_vcpu}">
        <input type="number" step="0.0001" min="0" id="ep_mem_${p.id}" value="${p.price_mem}">
        <input type="number" step="0.0001" min="0" id="ep_disk_${p.id}" value="${p.price_disk}">
        <input type="date" id="ep_start_${p.id}" value="${p.start_date || ''}">
        <input type="date" id="ep_end_${p.id}" value="${p.end_date || ''}">
        <div class="price-actions">
          <button class="save" onclick="savePriceRow(${runningId}, ${p.id})" title="Guardar">✓</button>
          <button class="del" onclick="cancelPriceEdit(${runningId})" title="Cancel·lar">✕</button>
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
        <button class="edit" onclick="editPriceRow(${runningId}, ${p.id})" title="Editar">✎</button>
        <button class="del" onclick="deletePriceRow(${runningId}, ${p.id})" title="Eliminar">✕</button>
      </div>`;
  }).join('');

  const separator = prices.length ? '<div class="price-separator"></div>' : '';

  panel.innerHTML = `
    <div class="prices-grid">
      ${headers}
      ${priceRows}
      ${separator}
      <input type="number" step="0.0001" min="0" placeholder="0.0000" id="np_vcpu_${runningId}">
      <input type="number" step="0.0001" min="0" placeholder="0.0000" id="np_mem_${runningId}">
      <input type="number" step="0.0001" min="0" placeholder="0.0000" id="np_disk_${runningId}">
      <input type="date" id="np_start_${runningId}">
      <input type="date" id="np_end_${runningId}">
      <button class="price-add-btn" onclick="createRunningPrice(${runningId})">+</button>
    </div>`;
}

function editPriceRow(runningId, priceId) {
  editingPriceId = priceId;
  renderRunningPricesPanel(runningId);
}

function cancelPriceEdit(runningId) {
  editingPriceId = null;
  renderRunningPricesPanel(runningId);
}

async function savePriceRow(runningId, priceId) {
  const payload = {
    price_vcpu: parseFloat(document.getElementById(`ep_vcpu_${priceId}`).value) || 0,
    price_mem:  parseFloat(document.getElementById(`ep_mem_${priceId}`).value) || 0,
    price_disk: parseFloat(document.getElementById(`ep_disk_${priceId}`).value) || 0,
    start_date: document.getElementById(`ep_start_${priceId}`).value || null,
    end_date:   document.getElementById(`ep_end_${priceId}`).value || null,
  };
  const res = await fetch(`/api/running/${runningId}/prices/${priceId}`, {
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
  await refreshRunningPrices(runningId);
  showToast('Preu actualitzat ✓', 'success');
}

async function createRunningPrice(runningId) {
  const payload = {
    price_vcpu: parseFloat(document.getElementById(`np_vcpu_${runningId}`).value) || 0,
    price_mem:  parseFloat(document.getElementById(`np_mem_${runningId}`).value) || 0,
    price_disk: parseFloat(document.getElementById(`np_disk_${runningId}`).value) || 0,
    start_date: document.getElementById(`np_start_${runningId}`).value || null,
    end_date:   document.getElementById(`np_end_${runningId}`).value || null,
  };
  const res = await fetch(`/api/running/${runningId}/prices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const d = await res.json();
    showToast(Object.values(d.errors || {})[0] || 'Error en crear preu', 'error');
    return;
  }
  await refreshRunningPrices(runningId);
  showToast('Preu afegit ✓', 'success');
}

async function deletePriceRow(runningId, priceId) {
  if (!confirm('Eliminar aquest preu?')) return;
  const res = await fetch(`/api/running/${runningId}/prices/${priceId}`, { method: 'DELETE' });
  if (res.ok) {
    if (editingPriceId === priceId) editingPriceId = null;
    await refreshRunningPrices(runningId);
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
  document.getElementById('hwAddDate').value = today;
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
        <td><input type="date" id="hw_edit_date" value="${r.data_modificacio}"></td>
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
  const newDate = document.getElementById('hw_edit_date').value;
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
  const dateVal = document.getElementById('hwAddDate').value;
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
  const filterEquip   = document.getElementById('reportEquip').value;
  return data.filter(s => {
    if (filterService && s.service !== filterService) return false;
    if (filterEquip   && s.equip   !== filterEquip)   return false;
    return true;
  });
}

let reportData = [];

function openReportModal() {
  reportData = [];
  document.getElementById('reportModalOverlay').classList.add('open');
  document.getElementById('reportResults').innerHTML = '';
  document.getElementById('reportStats').innerHTML = '';
  document.getElementById('btnInvoice').style.display = 'none';
  document.getElementById('reportService').value = '';
  document.getElementById('reportEquip').innerHTML = '<option value="">Tots els equips</option>';
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('reportDate').value = today;
}

function closeReportModal() {
  document.getElementById('reportModalOverlay').classList.remove('open');
}

function handleReportOverlayClick(e) {
  if (e.target === document.getElementById('reportModalOverlay')) closeReportModal();
}

async function runReport() {
  const dateVal = document.getElementById('reportDate').value;
  if (!dateVal) { showToast('Selecciona una data', 'error'); return; }

  const res = await fetch(`/api/report/hardware?date=${dateVal}`);
  const data = await res.json();

  if (!res.ok) {
    showToast(data.error || 'Error en la consulta', 'error');
    return;
  }

  reportData = data;

  const equips = [...new Set(data.map(s => s.equip).filter(Boolean))].sort();
  const equipSel = document.getElementById('reportEquip');
  const prevEquip = equipSel.value;
  equipSel.innerHTML = '<option value="">Tots els equips</option>' +
    equips.map(e => `<option value="${e}"${e === prevEquip ? ' selected' : ''}>${e}</option>`).join('');

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
      <td>${s.running || '—'}</td>
      <td>${s.equip || '—'}</td>
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
          <th>Nom</th><th>Service</th><th>Running</th><th>Equip</th><th>Usos</th>
          <th class="num">vCPUs</th><th class="num">Mem (GB)</th>
          <th class="num">Disc (GB)</th><th>Hw Data</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  statsEl.innerHTML = `
    <span>${filtered.length} servidor${filtered.length !== 1 ? 's' : ''}</span>
    <span>${totalVcpus} vCPUs</span>
    <span>${totalMem} GB mem</span>
    <span>${totalDisk} GB disc</span>
    ${noHw ? `<span>${noHw} sense maquinari</span>` : ''}`;
}

// ── Invoice ───────────────────────────────────────────────────────────────────

let invoiceData = [];

async function openInvoiceModal() {
  const dateVal = document.getElementById('reportDate').value;
  document.getElementById('invoiceTitle').textContent = `Factura — ${fmtDate(dateVal)}`;
  document.getElementById('invoiceModalOverlay').classList.add('open');
  document.getElementById('invoiceResults').innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Carregant...</p>';
  document.getElementById('invoiceGrandTotal').innerHTML = '';

  const res = await fetch(`/api/report/invoice?date=${dateVal}`);
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
  const fmtC = v => v == null ? '<span class="invoice-no-price">—</span>' : v.toFixed(4);
  const fmtP = v => v == null ? '' : `€${v.toFixed(4)}/u`;

  const rows = invoiceData.map(s => {
    const noPrice = s.total == null;
    return `<tr>
      <td>${s.name}</td>
      <td>${s.service || '—'}</td>
      <td>${s.equip || '—'}</td>
      <td>
        ${s.running || '<span class="invoice-no-price">sense running</span>'}
        ${s.running && s.price_vcpu == null ? '<span class="invoice-price-hint">sense preu en aquesta data</span>' : ''}
      </td>
      <td class="num">${s.vcpus}<br><span class="invoice-price-hint">${fmtP(s.price_vcpu)}</span></td>
      <td class="num">${fmtC(s.cost_vcpu)}</td>
      <td class="num">${s.memory}<br><span class="invoice-price-hint">${fmtP(s.price_mem)}</span></td>
      <td class="num">${fmtC(s.cost_mem)}</td>
      <td class="num">${s.disk}<br><span class="invoice-price-hint">${fmtP(s.price_disk)}</span></td>
      <td class="num">${fmtC(s.cost_disk)}</td>
      <td class="num${noPrice ? '' : ' invoice-total-cell'}">${fmtC(s.total)}</td>
    </tr>`;
  }).join('');

  const grandTotal = invoiceData.reduce((sum, s) => sum + (s.total || 0), 0);
  const countPriced = invoiceData.filter(s => s.total != null).length;

  document.getElementById('invoiceResults').innerHTML = `
    <div class="report-table-wrap">
      <table>
        <thead><tr>
          <th>Nom</th><th>Service</th><th>Equip</th><th>Running</th>
          <th class="num">vCPUs</th><th class="num">Cost vCPU</th>
          <th class="num">Mem (GB)</th><th class="num">Cost Mem</th>
          <th class="num">Disc (GB)</th><th class="num">Cost Disc</th>
          <th class="num">Total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  document.getElementById('invoiceGrandTotal').innerHTML = `
    <span class="igt-label">Total factura</span>
    <span class="igt-value">${grandTotal.toFixed(4)}</span>
    ${countPriced < invoiceData.length
      ? `<span class="igt-label">(${invoiceData.length - countPriced} servidor${invoiceData.length - countPriced !== 1 ? 's' : ''} sense preu)</span>`
      : ''}`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = (type === 'success' ? '✓ ' : '✕ ') + msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Init ──────────────────────────────────────────────────────────────────────

Promise.all([loadUses(), loadRunning(), loadServers()]);
