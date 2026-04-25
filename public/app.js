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

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = (type === 'success' ? '✓ ' : '✕ ') + msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Init ──────────────────────────────────────────────────────────────────────

Promise.all([loadUses(), loadRunning(), loadServers()]);
