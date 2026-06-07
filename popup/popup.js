(function() {
  'use strict';

  const STORAGE_KEYS = {
    LEADS: 'crm_leads',
    CONTACTS: 'crm_contacts',
    FOLLOW_UPS: 'crm_follow_ups',
    NOTES: 'crm_notes',
    TAGS: 'crm_tags',
    SETTINGS: 'crm_settings',
    SYNC_STATUS: 'crm_sync_status',
    FAVORITES: 'crm_favorites',
    ACTIVITIES: 'crm_activities'
  };

  const SYNC_STATE = {
    SYNCED: 'synced',
    DIRTY: 'dirty',
    PENDING: 'pending',
    ERROR: 'error'
  };

  const STAGE_OPTIONS = [
    { value: 'initial', label: '初步接触', color: '#9e9e9e' },
    { value: 'qualification', label: '需求确认', color: '#2196f3' },
    { value: 'proposal', label: '方案报价', color: '#ff9800' },
    { value: 'negotiation', label: '商务谈判', color: '#9c27b0' },
    { value: 'closing', label: '成交阶段', color: '#4caf50' },
    { value: 'closed_won', label: '已成交', color: '#2e7d32' },
    { value: 'closed_lost', label: '已流失', color: '#f44336' }
  ];

  const SOURCE_OPTIONS = [
    { value: 'website', label: '企业官网', icon: '🌐' },
    { value: 'email', label: '邮件', icon: '📧' },
    { value: 'linkedin', label: 'LinkedIn', icon: '💼' },
    { value: 'wechat', label: '微信', icon: '💬' },
    { value: 'exhibition', label: '展会', icon: '🎪' },
    { value: 'referral', label: '转介绍', icon: '🤝' },
    { value: 'cold_call', label: '陌拜', icon: '📞' },
    { value: 'social', label: '社交媒体', icon: '📱' },
    { value: 'other', label: '其他', icon: '📌' }
  ];

  const PRIORITY_OPTIONS = [
    { value: 'high', label: '高优先级' },
    { value: 'medium', label: '中优先级' },
    { value: 'low', label: '低优先级' }
  ];

  const FOLLOWUP_METHODS = {
    call: '电话',
    wechat: '微信',
    email: '邮件',
    meeting: '会议',
    visit: '上门拜访',
    other: '其他'
  };

  const NOTE_TYPE_LABELS = {
    communication: '沟通记录',
    meeting: '会议纪要',
    email: '邮件往来',
    call: '电话沟通',
    visit: '上门拜访',
    other: '其他'
  };

  let state = {
    leads: [],
    followUps: [],
    notes: [],
    favorites: [],
    settings: {},
    activities: [],
    syncStatus: {},
    currentView: 'dashboard',
    currentLead: null,
    selectedLeads: new Set(),
    pendingSaveLead: null,
    leadFilters: {
      search: '',
      stage: '',
      source: '',
      assignee: '',
      tag: '',
      priority: '',
      favorite: false,
      sortBy: 'createdAt'
    },
    followupFilter: 'upcoming'
  };

  function generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  function getTimestamp() {
    return new Date().toISOString();
  }

  function getStorage(key, defaultValue = null) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result[key] !== undefined ? result[key] : defaultValue);
      });
    });
  }

  function setStorage(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve();
      });
    });
  }

  async function loadData() {
    const [leads, followUps, notes, favorites, settings, activities, syncStatus] = await Promise.all([
      getStorage(STORAGE_KEYS.LEADS, []),
      getStorage(STORAGE_KEYS.FOLLOW_UPS, []),
      getStorage(STORAGE_KEYS.NOTES, []),
      getStorage(STORAGE_KEYS.FAVORITES, []),
      getStorage(STORAGE_KEYS.SETTINGS, {}),
      getStorage(STORAGE_KEYS.ACTIVITIES, []),
      getStorage(STORAGE_KEYS.SYNC_STATUS, {})
    ]);

    state.leads = leads;
    state.followUps = followUps;
    state.notes = notes;
    state.favorites = favorites;
    state.settings = settings;
    state.activities = activities;
    state.syncStatus = syncStatus;
  }

  async function saveLead(leadData) {
    const leads = state.leads;
    const now = getTimestamp();

    if (leadData.id) {
      const index = leads.findIndex(l => l.id === leadData.id);
      if (index !== -1) {
        leads[index] = {
          ...leads[index],
          ...leadData,
          updatedAt: now,
          syncState: SYNC_STATE.DIRTY
        };
      }
    } else {
      const newLead = {
        id: generateId('lead'),
        ...leadData,
        createdAt: now,
        updatedAt: now,
        syncState: SYNC_STATE.DIRTY,
        tags: leadData.tags || [],
        stage: leadData.stage || 'initial',
        priority: leadData.priority || 'medium',
        budget: leadData.budget || '',
        requirements: leadData.requirements || '',
        assignee: leadData.assignee || state.settings.defaultAssignee || '',
        source: leadData.source || state.settings.defaultSource || 'website',
        sourceUrl: leadData.sourceUrl || '',
        favorite: leadData.favorite || false
      };
      leads.unshift(newLead);
    }

    state.leads = leads;
    await setStorage(STORAGE_KEYS.LEADS, leads);
    await updateSyncStatus();
    await addActivity({
      type: leadData.id ? 'lead_updated' : 'lead_created',
      leadId: leadData.id || leads[0].id,
      details: leadData.id ? '更新了线索信息' : '创建了新线索'
    });

    return leads;
  }

  async function deleteLead(id) {
    const leads = state.leads.filter(l => l.id !== id);
    state.leads = leads;
    await setStorage(STORAGE_KEYS.LEADS, leads);
    await updateSyncStatus();
    return leads;
  }

  async function saveFollowUp(followUpData) {
    const followUps = state.followUps;
    const now = getTimestamp();

    if (followUpData.id) {
      const index = followUps.findIndex(f => f.id === followUpData.id);
      if (index !== -1) {
        followUps[index] = {
          ...followUps[index],
          ...followUpData,
          updatedAt: now,
          syncState: SYNC_STATE.DIRTY
        };
      }
    } else {
      const newFollowUp = {
        id: generateId('followup'),
        ...followUpData,
        completed: false,
        createdAt: now,
        updatedAt: now,
        syncState: SYNC_STATE.DIRTY
      };
      followUps.unshift(newFollowUp);

      if (followUpData.date) {
        const nextReminder = new Date(followUpData.date);
        if (nextReminder > new Date()) {
          chrome.runtime.sendMessage({
            type: 'SCHEDULE_REMINDER',
            followUpId: newFollowUp.id,
            date: followUpData.date
          });
        }
      }
    }

    state.followUps = followUps;
    await setStorage(STORAGE_KEYS.FOLLOW_UPS, followUps);
    await updateSyncStatus();

    if (followUpData.leadId) {
      await addActivity({
        type: 'followup_created',
        leadId: followUpData.leadId,
        details: `设置了跟进提醒：${followUpData.title || '未命名'}`
      });
    }

    return followUps;
  }

  async function saveNote(noteData) {
    const notes = state.notes;
    const now = getTimestamp();

    const newNote = {
      id: generateId('note'),
      ...noteData,
      createdAt: now,
      updatedAt: now,
      syncState: SYNC_STATE.DIRTY
    };
    notes.unshift(newNote);

    state.notes = notes;
    await setStorage(STORAGE_KEYS.NOTES, notes);
    await updateSyncStatus();

    if (noteData.leadId) {
      await addActivity({
        type: 'note_added',
        leadId: noteData.leadId,
        details: '添加了沟通纪要'
      });
    }

    return notes;
  }

  async function addActivity(activityData) {
    const activities = state.activities;
    const newActivity = {
      id: generateId('activity'),
      ...activityData,
      createdAt: getTimestamp()
    };
    activities.unshift(newActivity);
    if (activities.length > 200) {
      activities.length = 200;
    }
    state.activities = activities;
    await setStorage(STORAGE_KEYS.ACTIVITIES, activities);
    return activities;
  }

  async function removeFavorite(id) {
    const favorites = state.favorites.filter(f => f.id !== id);
    state.favorites = favorites;
    await setStorage(STORAGE_KEYS.FAVORITES, favorites);
    return favorites;
  }

  async function updateSyncStatus() {
    const allItems = [...state.leads, ...state.followUps, ...state.notes];
    const dirtyCount = allItems.filter(item => item.syncState === SYNC_STATE.DIRTY).length;

    const syncStatus = {
      lastSyncTime: null,
      pendingCount: dirtyCount,
      syncState: dirtyCount > 0 ? SYNC_STATE.DIRTY : SYNC_STATE.SYNCED
    };

    state.syncStatus = syncStatus;
    await setStorage(STORAGE_KEYS.SYNC_STATUS, syncStatus);
    updateSyncIndicator();
  }

  async function saveSettings(newSettings) {
    state.settings = { ...state.settings, ...newSettings };
    await setStorage(STORAGE_KEYS.SETTINGS, state.settings);
    return state.settings;
  }

  async function checkDuplicates(leadData, excludeId = null) {
    const duplicates = [];

    for (const lead of state.leads) {
      if (excludeId && lead.id === excludeId) continue;

      let score = 0;

      if (leadData.companyName && lead.companyName) {
        const company1 = leadData.companyName.toLowerCase().replace(/\s+/g, '');
        const company2 = lead.companyName.toLowerCase().replace(/\s+/g, '');
        if (company1 === company2) {
          score += 50;
        } else if (company1.includes(company2) || company2.includes(company1)) {
          score += 25;
        }
      }

      if (leadData.website && lead.website) {
        const web1 = leadData.website.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
        const web2 = lead.website.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
        if (web1 === web2) {
          score += 40;
        } else if (web1.includes(web2) || web2.includes(web1)) {
          score += 20;
        }
      }

      if (leadData.email && lead.email && leadData.email.toLowerCase() === lead.email.toLowerCase()) {
        score += 35;
      }

      if (leadData.phone && lead.phone && leadData.phone === lead.phone) {
        score += 30;
      }

      if (score >= 30) {
        duplicates.push({ lead, score, level: score >= 50 ? 'high' : score >= 30 ? 'medium' : 'low' });
      }
    }

    return duplicates.sort((a, b) => b.score - a.score);
  }

  async function batchAddTags(leadIds, tags) {
    const now = getTimestamp();

    const updated = state.leads.map(lead => {
      if (leadIds.includes(lead.id)) {
        const newTags = [...new Set([...(lead.tags || []), ...tags])];
        return {
          ...lead,
          tags: newTags,
          updatedAt: now,
          syncState: SYNC_STATE.DIRTY
        };
      }
      return lead;
    });

    state.leads = updated;
    await setStorage(STORAGE_KEYS.LEADS, updated);
    await updateSyncStatus();
    return updated;
  }

  async function batchUpdateStage(leadIds, stage) {
    const now = getTimestamp();

    const updated = state.leads.map(lead => {
      if (leadIds.includes(lead.id)) {
        return {
          ...lead,
          stage: stage,
          updatedAt: now,
          syncState: SYNC_STATE.DIRTY
        };
      }
      return lead;
    });

    state.leads = updated;
    await setStorage(STORAGE_KEYS.LEADS, updated);
    await updateSyncStatus();
    return updated;
  }

  async function batchDelete(leadIds) {
    const updated = state.leads.filter(lead => !leadIds.includes(lead.id));
    state.leads = updated;
    await setStorage(STORAGE_KEYS.LEADS, updated);
    await updateSyncStatus();
    return updated;
  }

  function exportThisWeeksLeads() {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const thisWeeksLeads = state.leads.filter(lead => {
      const created = new Date(lead.createdAt);
      return created >= weekStart;
    });

    const exportData = thisWeeksLeads.map(lead => ({
      '公司名称': lead.companyName || '',
      '联系人': lead.primaryContact || '',
      '职位': lead.contactTitle || '',
      '邮箱': lead.email || '',
      '电话': lead.phone || '',
      '网站': lead.website || '',
      '来源渠道': getSourceLabel(lead.source),
      '商机阶段': getStageLabel(lead.stage),
      '预算': lead.budget || '',
      '需求': lead.requirements || '',
      '标签': (lead.tags || []).join('、'),
      '负责人': lead.assignee || '',
      '创建时间': lead.createdAt || '',
      '更新时间': lead.updatedAt || ''
    }));

    return exportData;
  }

  function generateCSV(data) {
    if (!data || data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    for (const row of data) {
      const values = headers.map(header => {
        const val = row[header] || '';
        const escaped = String(val).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }

  function downloadCSV(data, filename) {
    const csv = generateCSV(data);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  function getStageColor(stage) {
    const found = STAGE_OPTIONS.find(s => s.value === stage);
    return found ? found.color : '#9e9e9e';
  }

  function getStageLabel(stage) {
    const found = STAGE_OPTIONS.find(s => s.value === stage);
    return found ? found.label : stage;
  }

  function getSourceLabel(source) {
    const found = SOURCE_OPTIONS.find(s => s.value === source);
    return found ? found.label : source;
  }

  function getSourceIcon(source) {
    const found = SOURCE_OPTIONS.find(s => s.value === source);
    return found ? found.icon : '📌';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `crm-toast crm-toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function updateSyncIndicator() {
    const indicator = document.getElementById('syncIndicator');
    const dot = indicator.querySelector('.crm-sync-dot');
    const text = indicator.querySelector('.crm-sync-text');

    if (state.syncStatus.syncState === SYNC_STATE.DIRTY || state.syncStatus.pendingCount > 0) {
      dot.className = 'crm-sync-dot dirty';
      text.textContent = `${state.syncStatus.pendingCount || 0} 条待同步`;
    } else {
      dot.className = 'crm-sync-dot synced';
      text.textContent = '已同步';
    }
  }

  function switchView(viewName) {
    state.currentView = viewName;

    document.querySelectorAll('.crm-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    document.querySelectorAll('.crm-view').forEach(view => {
      view.classList.remove('active');
    });

    const viewMap = {
      'dashboard': 'viewDashboard',
      'leads': 'viewLeads',
      'followups': 'viewFollowups',
      'notes': 'viewNotes',
      'favorites': 'viewFavorites',
      'settings': 'viewSettings'
    };

    const viewId = viewMap[viewName];
    if (viewId) {
      document.getElementById(viewId).classList.add('active');
    }

    if (viewName === 'dashboard') {
      renderDashboard();
    } else if (viewName === 'leads') {
      renderLeads();
    } else if (viewName === 'followups') {
      renderFollowUps();
    } else if (viewName === 'notes') {
      renderNotes();
    } else if (viewName === 'favorites') {
      renderFavorites();
    } else if (viewName === 'settings') {
      renderSettings();
    }
  }

  function getFilteredLeads() {
    let leads = [...state.leads];

    if (state.leadFilters.search) {
      const q = state.leadFilters.search.toLowerCase();
      leads = leads.filter(lead =>
        (lead.companyName && lead.companyName.toLowerCase().includes(q)) ||
        (lead.primaryContact && lead.primaryContact.toLowerCase().includes(q)) ||
        (lead.email && lead.email.toLowerCase().includes(q)) ||
        (lead.tags && lead.tags.some(t => t.toLowerCase().includes(q)))
      );
    }

    if (state.leadFilters.stage) {
      leads = leads.filter(lead => lead.stage === state.leadFilters.stage);
    }

    if (state.leadFilters.source) {
      leads = leads.filter(lead => lead.source === state.leadFilters.source);
    }

    if (state.leadFilters.assignee) {
      leads = leads.filter(lead => 
        (lead.assignee || '').toLowerCase() === state.leadFilters.assignee.toLowerCase()
      );
    }

    if (state.leadFilters.tag) {
      leads = leads.filter(lead => 
        lead.tags && lead.tags.some(t => t === state.leadFilters.tag)
      );
    }

    if (state.leadFilters.priority) {
      leads = leads.filter(lead => lead.priority === state.leadFilters.priority);
    }

    if (state.leadFilters.favorite) {
      leads = leads.filter(lead => lead.favorite === true);
    }

    if (state.leadFilters._thisWeekOnly) {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      leads = leads.filter(lead => new Date(lead.createdAt) >= weekStart);
    }

    const sortBy = state.leadFilters.sortBy;
    leads.sort((a, b) => {
      if (sortBy === 'companyName') {
        return (a.companyName || '').localeCompare(b.companyName || '');
      } else if (sortBy === 'updatedAt') {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      } else {
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });

    return leads;
  }

  function renderLeads() {
    const leads = getFilteredLeads();
    const grid = document.getElementById('leadsGrid');

    if (leads.length === 0) {
      grid.innerHTML = `
        <div class="crm-empty-state">
          <div class="crm-empty-icon">📋</div>
          <p>暂无线索，开始采集你的第一条线索吧！</p>
          <button class="crm-btn-primary" id="emptyAddBtn">+ 新建线索</button>
        </div>
      `;
      document.getElementById('emptyAddBtn')?.addEventListener('click', openLeadModal);
    } else {
      grid.innerHTML = leads.map(lead => `
        <div class="crm-lead-card ${state.selectedLeads.has(lead.id) ? 'selected' : ''}" data-id="${lead.id}">
          <input type="checkbox" class="crm-lead-card-checkbox" data-id="${lead.id}" ${state.selectedLeads.has(lead.id) ? 'checked' : ''}>
          <div class="crm-lead-card-head">
            <div class="crm-lead-company">
              <span class="crm-lead-fav" data-fav="${lead.id}">${lead.favorite ? '⭐' : '☆'}</span>
              <span class="crm-lead-name">${escapeHtml(lead.companyName || '未知公司')}</span>
            </div>
            <span class="crm-lead-stage" style="background: ${getStageColor(lead.stage)}">${getStageLabel(lead.stage)}</span>
          </div>
          <div class="crm-lead-contact">
            ${lead.primaryContact ? `<span>👤 ${escapeHtml(lead.primaryContact)}</span>` : ''}
            ${lead.contactTitle ? `<span class="crm-muted">${escapeHtml(lead.contactTitle)}</span>` : ''}
          </div>
          <div class="crm-lead-meta">
            <span class="crm-lead-meta-item">${getSourceIcon(lead.source)} ${getSourceLabel(lead.source)}</span>
            <span class="crm-lead-meta-item">📅 ${formatDate(lead.createdAt)}</span>
          </div>
          ${lead.tags && lead.tags.length > 0 ? `
            <div class="crm-lead-tags">
              ${lead.tags.slice(0, 3).map(tag => `<span class="crm-tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `).join('');

      grid.querySelectorAll('.crm-lead-card').forEach(card => {
        const leadId = card.dataset.id;

        card.addEventListener('click', (e) => {
          if (e.target.closest('.crm-lead-card-checkbox') || e.target.closest('.crm-lead-fav')) {
            return;
          }
          openLeadDetail(leadId);
        });

        const checkbox = card.querySelector('.crm-lead-card-checkbox');
        if (checkbox) {
          checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSelectLead(leadId, checkbox.checked);
          });
        }

        const favBtn = card.querySelector('.crm-lead-fav');
        if (favBtn) {
          favBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await toggleFavorite(leadId);
          });
        }
      });
    }

    document.getElementById('totalCount').textContent = leads.length;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekCount = leads.filter(l => new Date(l.createdAt) >= weekStart).length;
    document.getElementById('weekCount').textContent = weekCount;

    updateClearFiltersBtn();
    updateBatchActions();
  }

  function toggleSelectLead(id, checked) {
    if (checked) {
      state.selectedLeads.add(id);
    } else {
      state.selectedLeads.delete(id);
    }
    updateBatchActions();
  }

  function updateBatchActions() {
    const batchActions = document.getElementById('batchActions');
    const count = state.selectedLeads.size;

    if (count > 0) {
      batchActions.style.display = 'flex';
      batchActions.querySelector('.crm-selected-count').textContent = `已选 ${count} 条`;
    } else {
      batchActions.style.display = 'none';
    }
  }

  async function toggleFavorite(id) {
    const lead = state.leads.find(l => l.id === id);
    if (lead) {
      await saveLead({ id, favorite: !lead.favorite });
      renderLeads();
    }
  }

  function openLeadModal(leadId = null) {
    state.currentLead = leadId ? state.leads.find(l => l.id === leadId) : null;

    document.getElementById('leadModalTitle').textContent = leadId ? '编辑线索' : '新建线索';
    document.getElementById('leadId').value = leadId || '';

    if (state.currentLead) {
      document.getElementById('leadCompanyName').value = state.currentLead.companyName || '';
      document.getElementById('leadShortName').value = state.currentLead.shortName || '';
      document.getElementById('leadContact').value = state.currentLead.primaryContact || '';
      document.getElementById('leadTitle').value = state.currentLead.contactTitle || '';
      document.getElementById('leadPhone').value = state.currentLead.phone || '';
      document.getElementById('leadEmail').value = state.currentLead.email || '';
      document.getElementById('leadWebsite').value = state.currentLead.website || '';
      document.getElementById('leadAddress').value = state.currentLead.address || '';
      document.getElementById('leadSource').value = state.currentLead.source || 'website';
      document.getElementById('leadStage').value = state.currentLead.stage || 'initial';
      document.getElementById('leadBudget').value = state.currentLead.budget || '';
      document.getElementById('leadPriority').value = state.currentLead.priority || 'medium';
      document.getElementById('leadAssignee').value = state.currentLead.assignee || '';
      document.getElementById('leadIndustry').value = state.currentLead.industry || '';
      document.getElementById('leadSize').value = state.currentLead.companySize || '';
      document.getElementById('leadRequirements').value = state.currentLead.requirements || '';
      document.getElementById('leadTags').value = (state.currentLead.tags || []).join(', ');
      document.getElementById('leadFavorite').checked = state.currentLead.favorite || false;
    } else {
      document.getElementById('leadForm').reset();
      document.getElementById('leadSource').value = state.settings.defaultSource || 'website';
      document.getElementById('leadAssignee').value = state.settings.defaultAssignee || '';
    }

    switchDetailTab('info');
    document.getElementById('leadModal').classList.add('active');
  }

  function openLeadDetail(leadId) {
    openLeadModal(leadId);
    loadLeadDetailData(leadId);
  }

  function loadLeadDetailData(leadId) {
    loadFollowupHistory(leadId);
    loadNotesHistory(leadId);
    loadActivities(leadId);
    loadProfileData(leadId);
  }

  function loadProfileData(leadId) {
    const lead = state.leads.find(l => l.id === leadId);
    if (!lead) return;

    document.getElementById('profileFounded').value = lead.foundedYear || '';
    document.getElementById('profileCapital').value = lead.registeredCapital || '';
    document.getElementById('profileType').value = lead.companyType || '';
    document.getElementById('profileRegion').value = lead.region || '';
    document.getElementById('profileBusiness').value = lead.mainBusiness || '';
    document.getElementById('profileProducts').value = lead.mainProducts || '';
    document.getElementById('profileDecisionMaker').value = lead.decisionMaker || '';
    document.getElementById('profileDecisionProcess').value = lead.decisionProcess || '';
    document.getElementById('profileIntent').value = lead.intentLevel || 'medium';
    document.getElementById('profileValue').value = lead.customerValue || 'medium';
  }

  function loadFollowupHistory(leadId) {
    const followUps = state.followUps.filter(f => f.leadId === leadId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const container = document.getElementById('followupHistoryList');

    if (followUps.length === 0) {
      container.innerHTML = '<div class="crm-empty">暂无跟进记录</div>';
      return;
    }

    container.innerHTML = followUps.map(fu => `
      <div class="crm-history-followup ${fu.completed ? 'completed' : ''}">
        <div class="crm-history-head">
          <span class="crm-history-title">${escapeHtml(fu.title || '未命名跟进')}</span>
          <span class="crm-history-time">${fu.date ? formatDateTime(fu.date) : formatDate(fu.createdAt)}</span>
        </div>
        ${fu.content ? `<div class="crm-history-content">${escapeHtml(fu.content)}</div>` : ''}
      </div>
    `).join('');
  }

  function loadNotesHistory(leadId) {
    const notes = state.notes.filter(n => n.leadId === leadId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const container = document.getElementById('notesHistoryList');

    if (notes.length === 0) {
      container.innerHTML = '<div class="crm-empty">暂无沟通记录</div>';
      return;
    }

    container.innerHTML = notes.map(note => `
      <div class="crm-history-note">
        <div class="crm-history-head">
          <span class="crm-history-title">${NOTE_TYPE_LABELS[note.type] || '记录'}</span>
          <span class="crm-history-time">${formatDateTime(note.createdAt)}</span>
        </div>
        <div class="crm-history-content">${escapeHtml(note.content || '')}</div>
      </div>
    `).join('');
  }

  function loadActivities(leadId) {
    const activities = state.activities.filter(a => a.leadId === leadId)
      .slice(0, 50);

    const container = document.getElementById('activitiesList');

    if (activities.length === 0) {
      container.innerHTML = '<div class="crm-empty">暂无活动记录</div>';
      return;
    }

    const activityLabels = {
      lead_created: '创建线索',
      lead_updated: '更新线索',
      followup_created: '设置跟进',
      note_added: '添加纪要'
    };

    container.innerHTML = activities.map(act => `
      <div class="crm-activity-item">
        <div class="crm-activity-type">${activityLabels[act.type] || act.type} - ${escapeHtml(act.details || '')}</div>
        <div class="crm-activity-time">${formatDateTime(act.createdAt)}</div>
      </div>
    `).join('');
  }

  function switchDetailTab(tabName) {
    document.querySelectorAll('.crm-detail-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    document.querySelectorAll('.crm-detail-content').forEach(content => {
      content.classList.remove('active');
    });

    const tabMap = {
      'info': 'tabInfo',
      'profile': 'tabProfile',
      'followup': 'tabFollowup',
      'notes': 'tabNotes',
      'activities': 'tabActivities'
    };

    const contentId = tabMap[tabName];
    if (contentId) {
      document.getElementById(contentId).classList.add('active');
    }
  }

  async function handleSaveLead() {
    const companyName = document.getElementById('leadCompanyName').value.trim();
    if (!companyName) {
      showToast('请输入公司名称', 'error');
      return;
    }

    const tagsStr = document.getElementById('leadTags').value.trim();
    const tags = tagsStr ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(t => t) : [];

    const leadData = {
      id: document.getElementById('leadId').value || null,
      companyName: companyName,
      shortName: document.getElementById('leadShortName').value.trim(),
      primaryContact: document.getElementById('leadContact').value.trim(),
      contactTitle: document.getElementById('leadTitle').value.trim(),
      phone: document.getElementById('leadPhone').value.trim(),
      email: document.getElementById('leadEmail').value.trim(),
      website: document.getElementById('leadWebsite').value.trim(),
      address: document.getElementById('leadAddress').value.trim(),
      source: document.getElementById('leadSource').value,
      stage: document.getElementById('leadStage').value,
      budget: document.getElementById('leadBudget').value.trim(),
      priority: document.getElementById('leadPriority').value,
      assignee: document.getElementById('leadAssignee').value.trim(),
      industry: document.getElementById('leadIndustry').value.trim(),
      companySize: document.getElementById('leadSize').value,
      requirements: document.getElementById('leadRequirements').value.trim(),
      tags: tags,
      favorite: document.getElementById('leadFavorite').checked
    };

    const duplicates = await checkDuplicates(leadData, leadData.id);
    if (duplicates.length > 0) {
      showDuplicateModal(duplicates, leadData);
      return;
    }

    await doSaveLead(leadData);
  }

  async function doSaveLead(leadData) {
    await saveLead(leadData);
    showToast('线索保存成功！', 'success');
    closeModal('duplicateModal');
    closeModal('leadModal');
    state.pendingSaveLead = null;
    state.duplicateList = null;
    if (state.currentView === 'leads') {
      renderLeads();
    }
    if (state.currentView === 'dashboard') {
      renderDashboard();
    }
    updateFilterSelects();
  }

  function showDuplicateModal(duplicates, leadData) {
    state.pendingSaveLead = leadData;
    state.duplicateList = duplicates;

    const listEl = document.getElementById('duplicateList');

    const levelLabels = {
      high: { text: '高度相似', class: 'high' },
      medium: { text: '可能重复', class: 'medium' },
      low: { text: '轻度相似', class: 'low' }
    };

    listEl.innerHTML = duplicates.slice(0, 5).map((d, idx) => `
      <div class="crm-duplicate-item" data-lead-id="${d.lead.id}" data-index="${idx}">
        <div class="crm-duplicate-item-head">
          <span class="crm-duplicate-name">${escapeHtml(d.lead.companyName || '未知公司')}</span>
          <span class="crm-duplicate-score ${levelLabels[d.level].class}">${levelLabels[d.level].text} (${d.score}分)</span>
        </div>
        <div class="crm-duplicate-info">
          ${d.lead.primaryContact ? escapeHtml(d.lead.primaryContact) : ''}
          ${d.lead.contactTitle ? ` · ${escapeHtml(d.lead.contactTitle)}` : ''}
          ${d.lead.phone ? ` | 📞 ${escapeHtml(d.lead.phone)}` : ''}
        </div>
      </div>
    `).join('');

    document.getElementById('duplicateModal').classList.add('active');
  }

  function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
  }

  function renderFollowUps() {
    const container = document.getElementById('followupsContainer');
    let followUps = [...state.followUps];

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    if (state.followupFilter === 'upcoming') {
      followUps = followUps.filter(f => !f.completed && f.date && new Date(f.date) >= now)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    } else if (state.followupFilter === 'overdue') {
      followUps = followUps.filter(f => !f.completed && f.date && new Date(f.date) < now)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    } else if (state.followupFilter === 'today') {
      followUps = followUps.filter(f => {
        if (!f.date) return false;
        const date = new Date(f.date);
        return date >= todayStart && date <= todayEnd;
      }).sort((a, b) => new Date(a.date) - new Date(b.date));
    } else if (state.followupFilter === 'thisweek') {
      followUps = followUps.filter(f => {
        if (!f.date) return false;
        const date = new Date(f.date);
        return date >= weekStart && date <= weekEnd;
      }).sort((a, b) => new Date(a.date) - new Date(b.date));
    } else if (state.followupFilter === 'completed') {
      followUps = followUps.filter(f => f.completed)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    if (followUps.length === 0) {
      container.innerHTML = `
        <div class="crm-empty-state">
          <div class="crm-empty-icon">📅</div>
          <p>暂无跟进事项</p>
        </div>
      `;
      return;
    }

    container.innerHTML = followUps.map(fu => {
      const lead = state.leads.find(l => l.id === fu.leadId);
      const isOverdue = !fu.completed && fu.date && new Date(fu.date) < now;

      return `
        <div class="crm-followup-card ${fu.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}" data-id="${fu.id}">
          <div class="crm-followup-head">
            <span class="crm-followup-title">${escapeHtml(fu.title || '未命名跟进')}</span>
            <span class="crm-followup-date">${fu.date ? formatDateTime(fu.date) : '无日期'}</span>
          </div>
          <div class="crm-followup-company">${lead ? escapeHtml(lead.companyName) : '未关联客户'}</div>
          ${fu.content ? `<div class="crm-followup-content">${escapeHtml(fu.content)}</div>` : ''}
          <div class="crm-followup-actions">
            ${!fu.completed ? `<button class="crm-btn-secondary" data-complete="${fu.id}">✓ 标记完成</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-complete]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.complete;
        const fu = state.followUps.find(f => f.id === id);
        if (fu) {
          fu.completed = true;
          state.followUps = [...state.followUps];
          await setStorage(STORAGE_KEYS.FOLLOW_UPS, state.followUps);
          await updateSyncStatus();
          renderFollowUps();
          showToast('已标记完成', 'success');
        }
      });
    });
  }

  function renderNotes() {
    const container = document.getElementById('notesList');
    let notes = [...state.notes];

    const search = document.getElementById('noteSearch')?.value || '';
    if (search) {
      const q = search.toLowerCase();
      notes = notes.filter(n => n.content && n.content.toLowerCase().includes(q));
    }

    if (notes.length === 0) {
      container.innerHTML = `
        <div class="crm-empty-state">
          <div class="crm-empty-icon">📝</div>
          <p>暂无沟通记录</p>
        </div>
      `;
      return;
    }

    container.innerHTML = notes.map(note => {
      const lead = state.leads.find(l => l.id === note.leadId);

      return `
        <div class="crm-note-card">
          <div class="crm-note-head">
            <span class="crm-note-company">${lead ? escapeHtml(lead.companyName) : '未关联'}</span>
            <span class="crm-note-time">${formatDateTime(note.createdAt)}</span>
          </div>
          <span class="crm-note-type">${NOTE_TYPE_LABELS[note.type] || '记录'}</span>
          <div class="crm-note-content">${escapeHtml(note.content || '')}</div>
        </div>
      `;
    }).join('');
  }

  function renderFavorites() {
    const container = document.getElementById('favoritesList');
    const favorites = state.favorites;

    if (favorites.length === 0) {
      container.innerHTML = `
        <div class="crm-empty-state">
          <div class="crm-empty-icon">⭐</div>
          <p>暂无收藏的页面</p>
        </div>
      `;
      return;
    }

    container.innerHTML = favorites.map(fav => `
      <div class="crm-favorite-card" data-url="${escapeHtml(fav.url)}">
        <div class="crm-favorite-icon">${getSourceIcon(fav.source)}</div>
        <div class="crm-favorite-info">
          <div class="crm-favorite-title">${escapeHtml(fav.title || fav.url)}</div>
          <div class="crm-favorite-url">${escapeHtml(fav.url)}</div>
        </div>
        <span class="crm-favorite-delete" data-delete="${fav.id}">×</span>
      </div>
    `).join('');

    container.querySelectorAll('.crm-favorite-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-delete]')) return;
        const url = card.dataset.url;
        if (url) {
          chrome.tabs.create({ url });
        }
      });
    });

    container.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.delete;
        await removeFavorite(id);
        renderFavorites();
        showToast('已取消收藏', 'success');
      });
    });
  }

  function renderSettings() {
    const settings = state.settings;

    document.getElementById('autoDetect').checked = settings.autoDetect !== false;
    document.getElementById('reminderEnabled').checked = settings.reminderEnabled !== false;
    document.getElementById('defaultSource').value = settings.defaultSource || 'website';
    document.getElementById('defaultAssignee').value = settings.defaultAssignee || '';

    renderTeamMembers();
  }

  function renderTeamMembers() {
    const teamMembers = state.settings.teamMembers || [];
    const listEl = document.getElementById('teamList');

    if (teamMembers.length === 0) {
      listEl.innerHTML = '<div class="crm-empty">暂无团队成员</div>';
      return;
    }

    listEl.innerHTML = teamMembers.map((member, index) => `
      <div class="crm-team-member">
        <span>${escapeHtml(member)}</span>
        <span class="crm-team-member-remove" data-remove="${index}">×</span>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const index = parseInt(btn.dataset.remove);
        const members = [...(state.settings.teamMembers || [])];
        members.splice(index, 1);
        await saveSettings({ teamMembers: members });
        renderTeamMembers();
      });
    });
  }

  function generateVisitPlan() {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const thisWeekFollowUps = state.followUps.filter(f => {
      if (!f.date || f.completed) return false;
      const date = new Date(f.date);
      return date >= weekStart;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    if (thisWeekFollowUps.length === 0) {
      showToast('本周暂无拜访计划', 'info');
      return;
    }

    const visitData = thisWeekFollowUps.map(fu => {
      const lead = state.leads.find(l => l.id === fu.leadId);
      return {
        '日期': fu.date ? formatDate(fu.date) : '',
        '时间': fu.time || '',
        '客户公司': lead ? lead.companyName : '未关联',
        '联系人': lead ? (lead.primaryContact || '') : '',
        '联系电话': lead ? (lead.phone || '') : '',
        '地址': lead ? (lead.address || '') : '',
        '拜访目的': fu.title || '',
        '备注': fu.content || ''
      };
    });

    downloadCSV(visitData, `拜访清单_${formatDate(new Date())}.csv`);
    showToast('拜访清单已导出', 'success');
  }

  function initSelects() {
    const stageFilter = document.getElementById('stageFilter');
    if (stageFilter) {
      const currentValue = stageFilter.value;
      stageFilter.innerHTML = '<option value="">全部阶段</option>' +
        STAGE_OPTIONS.map(s =>
          `<option value="${s.value}" ${s.value === currentValue ? 'selected' : ''}>${s.label}</option>`
        ).join('');
    }

    const leadStage = document.getElementById('leadStage');
    if (leadStage) {
      const currentValue = leadStage.value;
      leadStage.innerHTML = STAGE_OPTIONS.map(s =>
        `<option value="${s.value}" ${s.value === currentValue ? 'selected' : ''}>${s.label}</option>`
      ).join('');
    }

    const sourceFilter = document.getElementById('sourceFilter');
    if (sourceFilter) {
      const currentValue = sourceFilter.value;
      sourceFilter.innerHTML = '<option value="">全部来源</option>' +
        SOURCE_OPTIONS.map(s =>
          `<option value="${s.value}" ${s.value === currentValue ? 'selected' : ''}>${s.icon} ${s.label}</option>`
        ).join('');
    }

    const sourceSelects = document.querySelectorAll('#leadSource, #defaultSource');
    sourceSelects.forEach(select => {
      const currentValue = select.value;
      select.innerHTML = SOURCE_OPTIONS.map(s =>
        `<option value="${s.value}" ${s.value === currentValue ? 'selected' : ''}>${s.icon} ${s.label}</option>`
      ).join('');
    });

    const priorityFilter = document.getElementById('priorityFilter');
    if (priorityFilter) {
      const currentValue = priorityFilter.value;
      priorityFilter.innerHTML = '<option value="">全部优先级</option>' +
        PRIORITY_OPTIONS.map(p =>
          `<option value="${p.value}" ${p.value === currentValue ? 'selected' : ''}>${p.label}</option>`
        ).join('');
    }

    const leadPriority = document.getElementById('leadPriority');
    if (leadPriority) {
      const currentValue = leadPriority.value;
      leadPriority.innerHTML = PRIORITY_OPTIONS.map(p =>
        `<option value="${p.value}" ${p.value === currentValue ? 'selected' : ''}>${p.label}</option>`
      ).join('');
    }

    const fupMethod = document.getElementById('fupMethod');
    if (fupMethod) {
      const currentValue = fupMethod.value;
      fupMethod.innerHTML = FOLLOWUP_METHODS ? Object.entries(FOLLOWUP_METHODS).map(([k, v]) =>
        `<option value="${k}" ${k === currentValue ? 'selected' : ''}>${v}</option>`
      ).join('') : '';
    }
  }

  function initEventListeners() {
    document.querySelectorAll('.crm-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        switchView(item.dataset.view);
      });
    });

    document.getElementById('addLeadBtn')?.addEventListener('click', () => openLeadModal());
    document.getElementById('emptyAddBtn')?.addEventListener('click', () => openLeadModal());
    document.getElementById('saveLeadBtn')?.addEventListener('click', handleSaveLead);
    document.getElementById('syncIndicator')?.addEventListener('click', openSyncModal);

    document.getElementById('syncAllBtn')?.addEventListener('click', markAllSynced);

    document.getElementById('dashAddLeadBtn')?.addEventListener('click', () => openLeadModal());
    document.getElementById('dashExportBtn')?.addEventListener('click', () => {
      const data = exportThisWeeksLeads();
      if (data.length === 0) {
        showToast('本周暂无线索可导出', 'info');
        return;
      }
      downloadCSV(data, `本周线索_${formatDate(new Date())}.csv`);
      showToast('导出成功', 'success');
    });

    document.getElementById('exportBtn')?.addEventListener('click', () => {
      const data = exportThisWeeksLeads();
      if (data.length === 0) {
        showToast('本周暂无线索可导出', 'info');
        return;
      }
      downloadCSV(data, `本周线索_${formatDate(new Date())}.csv`);
      showToast('导出成功', 'success');
    });

    document.getElementById('leadSearch')?.addEventListener('input', (e) => {
      state.leadFilters.search = e.target.value;
      updateClearFiltersBtn();
      renderLeads();
    });

    document.getElementById('stageFilter')?.addEventListener('change', (e) => {
      state.leadFilters.stage = e.target.value;
      updateClearFiltersBtn();
      renderLeads();
    });

    document.getElementById('sourceFilter')?.addEventListener('change', (e) => {
      state.leadFilters.source = e.target.value;
      updateClearFiltersBtn();
      renderLeads();
    });

    document.getElementById('sortBy')?.addEventListener('change', (e) => {
      state.leadFilters.sortBy = e.target.value;
      renderLeads();
    });

    document.getElementById('assigneeFilter')?.addEventListener('change', (e) => {
      state.leadFilters.assignee = e.target.value;
      updateClearFiltersBtn();
      renderLeads();
    });

    document.getElementById('tagFilter')?.addEventListener('change', (e) => {
      state.leadFilters.tag = e.target.value;
      updateClearFiltersBtn();
      renderLeads();
    });

    document.getElementById('priorityFilter')?.addEventListener('change', (e) => {
      state.leadFilters.priority = e.target.value;
      updateClearFiltersBtn();
      renderLeads();
    });

    document.getElementById('favoriteFilter')?.addEventListener('change', (e) => {
      state.leadFilters.favorite = e.target.checked;
      updateClearFiltersBtn();
      renderLeads();
    });

    document.getElementById('clearFiltersBtn')?.addEventListener('click', clearAllFilters);

    document.getElementById('batchTagBtn')?.addEventListener('click', async () => {
      const tagStr = prompt('请输入要添加的标签（多个标签用逗号分隔）：');
      if (tagStr) {
        const tags = tagStr.split(/[,，]/).map(t => t.trim()).filter(t => t);
        if (tags.length > 0) {
          await batchAddTags([...state.selectedLeads], tags);
          state.selectedLeads.clear();
          renderLeads();
          showToast(`已为 ${tags.length > 1 ? tags.length : ''}条线索添加标签`, 'success');
        }
      }
    });

    document.getElementById('batchStageBtn')?.addEventListener('click', async () => {
      const stage = prompt('请输入目标阶段（initial/qualification/proposal/negotiation/closing/closed_won/closed_lost）：');
      if (stage && STAGE_OPTIONS.some(s => s.value === stage)) {
        await batchUpdateStage([...state.selectedLeads], stage);
        state.selectedLeads.clear();
        renderLeads();
        showToast('批量更新阶段成功', 'success');
      } else {
        showToast('请输入有效的阶段值', 'error');
      }
    });

    document.getElementById('batchDeleteBtn')?.addEventListener('click', async () => {
      if (confirm(`确定要删除选中的 ${state.selectedLeads.size} 条线索吗？此操作不可恢复。`)) {
        await batchDelete([...state.selectedLeads]);
        state.selectedLeads.clear();
        renderLeads();
        showToast('批量删除成功', 'success');
      }
    });

    document.querySelectorAll('.crm-followup-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        state.followupFilter = tab.dataset.filter;
        document.querySelectorAll('.crm-followup-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.filter === state.followupFilter);
        });
        renderFollowUps();
      });
    });

    document.getElementById('addFollowUpBtn')?.addEventListener('click', openAddFollowUpModal);

    document.getElementById('saveFollowUpBtn')?.addEventListener('click', handleSaveFollowUpFromModal);

    document.getElementById('visitPlanBtn')?.addEventListener('click', generateVisitPlan);

    document.getElementById('noteSearch')?.addEventListener('input', renderNotes);

    document.getElementById('addTeamBtn')?.addEventListener('click', async () => {
      const input = document.getElementById('newTeamMember');
      const name = input.value.trim();
      if (name) {
        const members = [...(state.settings.teamMembers || []), name];
        await saveSettings({ teamMembers: members });
        input.value = '';
        renderTeamMembers();
        showToast('成员添加成功', 'success');
      }
    });

    document.getElementById('autoDetect')?.addEventListener('change', async (e) => {
      await saveSettings({ autoDetect: e.target.checked });
    });

    document.getElementById('reminderEnabled')?.addEventListener('change', async (e) => {
      await saveSettings({ reminderEnabled: e.target.checked });
    });

    document.getElementById('defaultSource')?.addEventListener('change', async (e) => {
      await saveSettings({ defaultSource: e.target.value });
    });

    document.getElementById('defaultAssignee')?.addEventListener('change', async (e) => {
      await saveSettings({ defaultAssignee: e.target.value });
    });

    document.getElementById('exportAllBtn')?.addEventListener('click', () => {
      const allData = {
        leads: state.leads,
        followUps: state.followUps,
        notes: state.notes,
        favorites: state.favorites,
        settings: state.settings,
        activities: state.activities,
        exportedAt: getTimestamp()
      };
      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `CRM数据备份_${formatDate(new Date())}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showToast('数据导出成功', 'success');
    });

    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (data.leads) {
            state.leads = data.leads;
            await setStorage(STORAGE_KEYS.LEADS, data.leads);
          }
          if (data.followUps) {
            state.followUps = data.followUps;
            await setStorage(STORAGE_KEYS.FOLLOW_UPS, data.followUps);
          }
          if (data.notes) {
            state.notes = data.notes;
            await setStorage(STORAGE_KEYS.NOTES, data.notes);
          }
          if (data.favorites) {
            state.favorites = data.favorites;
            await setStorage(STORAGE_KEYS.FAVORITES, data.favorites);
          }
          if (data.settings) {
            state.settings = data.settings;
            await setStorage(STORAGE_KEYS.SETTINGS, data.settings);
          }
          if (data.activities) {
            state.activities = data.activities;
            await setStorage(STORAGE_KEYS.ACTIVITIES, data.activities);
          }
          await updateSyncStatus();
          renderLeads();
          renderSettings();
          showToast('数据导入成功', 'success');
        } catch (err) {
          showToast('导入失败，请检查文件格式', 'error');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    document.getElementById('clearDataBtn').addEventListener('click', async () => {
      if (confirm('确定要清空所有数据吗？此操作不可恢复，请先导出备份！')) {
        if (confirm('再次确认：所有线索、跟进、记录都将被删除，确定吗？')) {
          state.leads = [];
          state.followUps = [];
          state.notes = [];
          state.favorites = [];
          state.activities = [];
          await Promise.all([
            setStorage(STORAGE_KEYS.LEADS, []),
            setStorage(STORAGE_KEYS.FOLLOW_UPS, []),
            setStorage(STORAGE_KEYS.NOTES, []),
            setStorage(STORAGE_KEYS.FAVORITES, []),
            setStorage(STORAGE_KEYS.ACTIVITIES, [])
          ]);
          await updateSyncStatus();
          renderLeads();
          renderFavorites();
          showToast('数据已清空', 'success');
        }
      }
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.crm-modal-overlay');
        if (modal) {
          modal.classList.remove('active');
        }
      });
    });

    document.querySelectorAll('.crm-detail-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        switchDetailTab(tab.dataset.tab);
      });
    });

    document.getElementById('addQuickFollowupBtn').addEventListener('click', async () => {
      const leadId = document.getElementById('leadId').value;
      if (!leadId) {
        showToast('请先保存线索', 'error');
        return;
      }

      const title = document.getElementById('quickFollowupTitle').value.trim();
      const date = document.getElementById('quickFollowupDate').value;
      const time = document.getElementById('quickFollowupTime').value;
      const content = document.getElementById('quickFollowupContent').value.trim();

      if (!title) {
        showToast('请输入跟进主题', 'error');
        return;
      }
      if (!date) {
        showToast('请选择跟进日期', 'error');
        return;
      }

      let dateTime = date;
      if (time) {
        dateTime = `${date}T${time}:00`;
      }

      await saveFollowUp({
        leadId: leadId,
        title: title,
        date: dateTime,
        time: time,
        content: content
      });

      document.getElementById('quickFollowupTitle').value = '';
      document.getElementById('quickFollowupContent').value = '';
      loadFollowupHistory(leadId);
      showToast('跟进已添加', 'success');
    });

    document.getElementById('addQuickNoteBtn').addEventListener('click', async () => {
      const leadId = document.getElementById('leadId').value;
      if (!leadId) {
        showToast('请先保存线索', 'error');
        return;
      }

      const content = document.getElementById('quickNoteContent').value.trim();
      const type = document.getElementById('quickNoteType').value;

      if (!content) {
        showToast('请输入记录内容', 'error');
        return;
      }

      await saveNote({
        leadId: leadId,
        content: content,
        type: type
      });

      document.getElementById('quickNoteContent').value = '';
      loadNotesHistory(leadId);
      showToast('记录已保存', 'success');
    });

    document.getElementById('saveProfileBtn').addEventListener('click', async () => {
      const leadId = document.getElementById('leadId').value;
      if (!leadId) {
        showToast('请先保存线索', 'error');
        return;
      }

      const profileData = {
        id: leadId,
        foundedYear: document.getElementById('profileFounded').value.trim(),
        registeredCapital: document.getElementById('profileCapital').value.trim(),
        companyType: document.getElementById('profileType').value.trim(),
        region: document.getElementById('profileRegion').value.trim(),
        mainBusiness: document.getElementById('profileBusiness').value.trim(),
        mainProducts: document.getElementById('profileProducts').value.trim(),
        decisionMaker: document.getElementById('profileDecisionMaker').value.trim(),
        decisionProcess: document.getElementById('profileDecisionProcess').value.trim(),
        intentLevel: document.getElementById('profileIntent').value,
        customerValue: document.getElementById('profileValue').value
      };

      await saveLead(profileData);
      showToast('客户画像已保存', 'success');
    });

    document.getElementById('viewDuplicateDetailBtn').addEventListener('click', handleViewDuplicateDetail);

    document.getElementById('continueSaveBtn').addEventListener('click', handleContinueSave);
  }

  async function init() {
    await loadData();
    initSelects();
    initFilterSelects();
    initEventListeners();
    switchView('dashboard');
    updateSyncIndicator();
    renderDashboard();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        if (changes[STORAGE_KEYS.LEADS]) {
          state.leads = changes[STORAGE_KEYS.LEADS].newValue || [];
          if (state.currentView === 'leads') {
            renderLeads();
          }
          if (state.currentView === 'dashboard') {
            renderDashboard();
          }
          updateFilterSelects();
        }
        if (changes[STORAGE_KEYS.FOLLOW_UPS]) {
          state.followUps = changes[STORAGE_KEYS.FOLLOW_UPS].newValue || [];
          if (state.currentView === 'followups') {
            renderFollowUps();
          }
          if (state.currentView === 'dashboard') {
            renderDashboard();
          }
        }
        if (changes[STORAGE_KEYS.NOTES]) {
          state.notes = changes[STORAGE_KEYS.NOTES].newValue || [];
          if (state.currentView === 'notes') {
            renderNotes();
          }
        }
        if (changes[STORAGE_KEYS.SYNC_STATUS]) {
          state.syncStatus = changes[STORAGE_KEYS.SYNC_STATUS].newValue || {};
          updateSyncIndicator();
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  function renderDashboard() {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const newLeads = state.leads.filter(l => new Date(l.createdAt) >= weekStart).length;
    const favorites = state.leads.filter(l => l.favorite).length;

    const upcoming = state.followUps.filter(f => !f.completed && f.date && new Date(f.date) >= now).length;
    const overdue = state.followUps.filter(f => !f.completed && f.date && new Date(f.date) < now).length;

    document.getElementById('statNewLeads').textContent = newLeads;
    document.getElementById('statUpcoming').textContent = upcoming;
    document.getElementById('statOverdue').textContent = overdue;
    document.getElementById('statFavorites').textContent = favorites;

    const stageData = {};
    STAGE_OPTIONS.forEach(s => {
      stageData[s.value] = { label: s.label, color: s.color, count: 0 };
    });
    state.leads.forEach(lead => {
      if (stageData[lead.stage]) {
        stageData[lead.stage].count++;
      }
    });

    const maxStageCount = Math.max(...Object.values(stageData).map(s => s.count), 1);
    const stageHtml = STAGE_OPTIONS.map(s => {
      const data = stageData[s.value];
      const percent = (data.count / maxStageCount) * 100;
      return `
        <div class="crm-distribution-item" data-stage="${s.value}">
          <span class="crm-distribution-label">${data.label}</span>
          <div class="crm-distribution-bar">
            <div class="crm-distribution-fill" style="width: ${percent}%; background: ${data.color}"></div>
          </div>
          <span class="crm-distribution-count">${data.count}</span>
        </div>
      `;
    }).join('');
    document.getElementById('stageDistribution').innerHTML = stageHtml;

    document.querySelectorAll('#stageDistribution .crm-distribution-item').forEach(item => {
      item.addEventListener('click', () => {
        state.leadFilters.stage = item.dataset.stage;
        document.getElementById('stageFilter').value = item.dataset.stage;
        switchView('leads');
      });
    });

    const sourceData = {};
    SOURCE_OPTIONS.forEach(s => {
      sourceData[s.value] = { label: s.label, icon: s.icon, count: 0 };
    });
    state.leads.forEach(lead => {
      if (sourceData[lead.source]) {
        sourceData[lead.source].count++;
      }
    });

    const maxSourceCount = Math.max(...Object.values(sourceData).map(s => s.count), 1);
    const sourceHtml = SOURCE_OPTIONS.map(s => {
      const data = sourceData[s.value];
      const percent = (data.count / maxSourceCount) * 100;
      return `
        <div class="crm-distribution-item" data-source="${s.value}">
          <span class="crm-distribution-label">${data.icon} ${data.label}</span>
          <div class="crm-distribution-bar">
            <div class="crm-distribution-fill" style="width: ${percent}%; background: #667eea"></div>
          </div>
          <span class="crm-distribution-count">${data.count}</span>
        </div>
      `;
    }).join('');
    document.getElementById('sourceDistribution').innerHTML = sourceHtml;

    document.querySelectorAll('#sourceDistribution .crm-distribution-item').forEach(item => {
      item.addEventListener('click', () => {
        state.leadFilters.source = item.dataset.source;
        document.getElementById('sourceFilter').value = item.dataset.source;
        switchView('leads');
      });
    });

    document.querySelectorAll('.crm-stat-card[data-stat]').forEach(card => {
      card.onclick = () => {
        const stat = card.dataset.stat;
        if (stat === 'newLeads') {
          state.leadFilters = {
            search: '',
            stage: '',
            source: '',
            assignee: '',
            tag: '',
            priority: '',
            favorite: false,
            sortBy: 'createdAt',
            _thisWeekOnly: true
          };
          document.getElementById('leadSearch').value = '';
          document.getElementById('stageFilter').value = '';
          document.getElementById('sourceFilter').value = '';
          document.getElementById('assigneeFilter').value = '';
          document.getElementById('tagFilter').value = '';
          document.getElementById('priorityFilter').value = '';
          document.getElementById('favoriteFilter').checked = false;
          updateFilterSelects();
          updateClearFiltersBtn();
          switchView('leads');
        } else if (stat === 'upcoming') {
          state.followupFilter = 'upcoming';
          document.querySelectorAll('.crm-followup-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.filter === 'upcoming');
          });
          switchView('followups');
        } else if (stat === 'overdue') {
          state.followupFilter = 'overdue';
          document.querySelectorAll('.crm-followup-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.filter === 'overdue');
          });
          switchView('followups');
        } else if (stat === 'favorites') {
          state.leadFilters.favorite = true;
          document.getElementById('favoriteFilter').checked = true;
          updateClearFiltersBtn();
          switchView('leads');
        }
      };
    });
  }

  function initFilterSelects() {
    updateFilterSelects();
  }

  function updateFilterSelects() {
    const assignees = [...new Set(state.leads.map(l => l.assignee).filter(a => a))].sort();
    const assigneeSelect = document.getElementById('assigneeFilter');
    if (assigneeSelect) {
      const currentValue = assigneeSelect.value;
      assigneeSelect.innerHTML = '<option value="">全部负责人</option>' +
        assignees.map(a => `<option value="${escapeHtml(a)}" ${a === currentValue ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('');
    }

    const allTags = new Set();
    state.leads.forEach(l => {
      if (l.tags) {
        l.tags.forEach(t => allTags.add(t));
      }
    });
    const tagSelect = document.getElementById('tagFilter');
    if (tagSelect) {
      const currentValue = tagSelect.value;
      tagSelect.innerHTML = '<option value="">全部标签</option>' +
        [...allTags].sort().map(t => `<option value="${escapeHtml(t)}" ${t === currentValue ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
    }
  }

  function updateClearFiltersBtn() {
    const hasFilters = state.leadFilters.search ||
      state.leadFilters.stage ||
      state.leadFilters.source ||
      state.leadFilters.assignee ||
      state.leadFilters.tag ||
      state.leadFilters.priority ||
      state.leadFilters.favorite ||
      state.leadFilters._thisWeekOnly;

    const btn = document.getElementById('clearFiltersBtn');
    if (btn) {
      btn.style.display = hasFilters ? 'block' : 'none';
    }
  }

  function clearAllFilters() {
    state.leadFilters = {
      search: '',
      stage: '',
      source: '',
      assignee: '',
      tag: '',
      priority: '',
      favorite: false,
      sortBy: state.leadFilters.sortBy,
      _thisWeekOnly: false
    };

    document.getElementById('leadSearch').value = '';
    document.getElementById('stageFilter').value = '';
    document.getElementById('sourceFilter').value = '';
    document.getElementById('assigneeFilter').value = '';
    document.getElementById('tagFilter').value = '';
    document.getElementById('priorityFilter').value = '';
    document.getElementById('favoriteFilter').checked = false;

    updateClearFiltersBtn();
    renderLeads();
  }

  function openSyncModal() {
    renderSyncDetails();
    document.getElementById('syncModal').classList.add('active');
  }

  function renderSyncDetails() {
    const dirtyLeads = state.leads.filter(l => l.syncState === SYNC_STATE.DIRTY);
    const dirtyFollowUps = state.followUps.filter(f => f.syncState === SYNC_STATE.DIRTY);
    const dirtyNotes = state.notes.filter(n => n.syncState === SYNC_STATE.DIRTY);

    const total = dirtyLeads.length + dirtyFollowUps.length + dirtyNotes.length;
    document.getElementById('syncTotalCount').textContent = total;
    document.getElementById('syncLeadCount').textContent = dirtyLeads.length;
    document.getElementById('syncFollowupCount').textContent = dirtyFollowUps.length;
    document.getElementById('syncNoteCount').textContent = dirtyNotes.length;

    const leadItemsEl = document.getElementById('syncLeadItems');
    if (dirtyLeads.length === 0) {
      leadItemsEl.innerHTML = '<div class="crm-empty">暂无待同步</div>';
    } else {
      leadItemsEl.innerHTML = dirtyLeads.map(l => `
        <div class="crm-sync-item">
          <span class="crm-sync-item-title" title="${escapeHtml(l.companyName || '')}">${escapeHtml(l.companyName || '未知')}</span>
          <span class="crm-sync-item-time">${formatDate(l.updatedAt)}</span>
          <button class="crm-sync-item-action" data-sync-lead="${l.id}">已同步</button>
        </div>
      `).join('');

      leadItemsEl.querySelectorAll('[data-sync-lead]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.syncLead;
          await markLeadSynced(id);
          renderSyncDetails();
          updateSyncIndicator();
        });
      });
    }

    const followupItemsEl = document.getElementById('syncFollowupItems');
    if (dirtyFollowUps.length === 0) {
      followupItemsEl.innerHTML = '<div class="crm-empty">暂无待同步</div>';
    } else {
      followupItemsEl.innerHTML = dirtyFollowUps.map(f => {
        const lead = state.leads.find(l => l.id === f.leadId);
        return `
          <div class="crm-sync-item">
            <span class="crm-sync-item-title" title="${escapeHtml(f.title || '')}">${escapeHtml(f.title || '未命名')}</span>
            <span class="crm-sync-item-time">${lead ? escapeHtml(lead.companyName) : ''}</span>
            <button class="crm-sync-item-action" data-sync-followup="${f.id}">已同步</button>
          </div>
        `;
      }).join('');

      followupItemsEl.querySelectorAll('[data-sync-followup]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.syncFollowup;
          await markFollowUpSynced(id);
          renderSyncDetails();
          updateSyncIndicator();
        });
      });
    }

    const noteItemsEl = document.getElementById('syncNoteItems');
    if (dirtyNotes.length === 0) {
      noteItemsEl.innerHTML = '<div class="crm-empty">暂无待同步</div>';
    } else {
      noteItemsEl.innerHTML = dirtyNotes.map(n => {
        const lead = state.leads.find(l => l.id === n.leadId);
        const content = (n.content || '').substring(0, 20);
        return `
          <div class="crm-sync-item">
            <span class="crm-sync-item-title" title="${escapeHtml(n.content || '')}">${escapeHtml(content || '无内容')}...</span>
            <span class="crm-sync-item-time">${lead ? escapeHtml(lead.companyName) : ''}</span>
            <button class="crm-sync-item-action" data-sync-note="${n.id}">已同步</button>
          </div>
        `;
      }).join('');

      noteItemsEl.querySelectorAll('[data-sync-note]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.syncNote;
          await markNoteSynced(id);
          renderSyncDetails();
          updateSyncIndicator();
        });
      });
    }
  }

  async function markLeadSynced(id) {
    const leads = state.leads.map(l => {
      if (l.id === id) {
        return { ...l, syncState: SYNC_STATE.SYNCED };
      }
      return l;
    });
    state.leads = leads;
    await setStorage(STORAGE_KEYS.LEADS, leads);
    await updateSyncStatus();
  }

  async function markFollowUpSynced(id) {
    const followUps = state.followUps.map(f => {
      if (f.id === id) {
        return { ...f, syncState: SYNC_STATE.SYNCED };
      }
      return f;
    });
    state.followUps = followUps;
    await setStorage(STORAGE_KEYS.FOLLOW_UPS, followUps);
    await updateSyncStatus();
  }

  async function markNoteSynced(id) {
    const notes = state.notes.map(n => {
      if (n.id === id) {
        return { ...n, syncState: SYNC_STATE.SYNCED };
      }
      return n;
    });
    state.notes = notes;
    await setStorage(STORAGE_KEYS.NOTES, notes);
    await updateSyncStatus();
  }

  async function markAllSynced() {
    const leads = state.leads.map(l => ({ ...l, syncState: SYNC_STATE.SYNCED }));
    const followUps = state.followUps.map(f => ({ ...f, syncState: SYNC_STATE.SYNCED }));
    const notes = state.notes.map(n => ({ ...n, syncState: SYNC_STATE.SYNCED }));

    state.leads = leads;
    state.followUps = followUps;
    state.notes = notes;

    await Promise.all([
      setStorage(STORAGE_KEYS.LEADS, leads),
      setStorage(STORAGE_KEYS.FOLLOW_UPS, followUps),
      setStorage(STORAGE_KEYS.NOTES, notes)
    ]);

    await updateSyncStatus();
    renderSyncDetails();
    showToast('全部已标记为已同步', 'success');
  }

  function openAddFollowUpModal() {
    const leadSelect = document.getElementById('fupLead');
    leadSelect.innerHTML = '<option value="">请选择客户</option>' +
      state.leads.map(l => `<option value="${l.id}">${escapeHtml(l.companyName)}</option>`).join('');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('fupDate').value = formatDate(tomorrow.toISOString());
    document.getElementById('fupTime').value = '10:00';
    document.getElementById('fupTitle').value = '';
    document.getElementById('fupContent').value = '';
    document.getElementById('fupMethod').value = 'call';

    document.getElementById('addFollowUpModal').classList.add('active');
  }

  async function handleSaveFollowUpFromModal() {
    const leadId = document.getElementById('fupLead').value;
    const title = document.getElementById('fupTitle').value.trim();
    const date = document.getElementById('fupDate').value;
    const time = document.getElementById('fupTime').value;
    const method = document.getElementById('fupMethod').value;
    const content = document.getElementById('fupContent').value.trim();

    if (!leadId) {
      showToast('请选择客户', 'error');
      return;
    }
    if (!title) {
      showToast('请输入跟进主题', 'error');
      return;
    }
    if (!date) {
      showToast('请选择跟进日期', 'error');
      return;
    }

    let dateTime = date;
    if (time) {
      dateTime = `${date}T${time}:00`;
    }

    await saveFollowUp({
      leadId: leadId,
      title: title,
      date: dateTime,
      time: time,
      method: method,
      content: content
    });

    closeModal('addFollowUpModal');
    showToast('跟进创建成功', 'success');

    if (state.currentView === 'followups') {
      renderFollowUps();
    }
    if (state.currentView === 'dashboard') {
      renderDashboard();
    }
  }

  async function handleContinueSave() {
    if (state.pendingSaveLead) {
      await doSaveLead(state.pendingSaveLead);
      state.pendingSaveLead = null;
    }
  }

  function handleViewDuplicateDetail() {
    if (state.duplicateList && state.duplicateList.length > 0) {
      const leadId = state.duplicateList[0].lead.id;
      closeModal('duplicateModal');
      closeModal('leadModal');
      openLeadDetail(leadId);
    }
  }

})();
