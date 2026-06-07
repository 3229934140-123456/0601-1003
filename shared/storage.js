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

async function getStorage(key, defaultValue = null) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] !== undefined ? result[key] : defaultValue);
    });
  });
}

async function setStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolve();
    });
  });
}

function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getTimestamp() {
  return new Date().toISOString();
}

async function getLeads() {
  return await getStorage(STORAGE_KEYS.LEADS, []);
}

async function getLeadById(id) {
  const leads = await getLeads();
  return leads.find(lead => lead.id === id) || null;
}

async function saveLead(leadData) {
  const leads = await getLeads();
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
      assignee: leadData.assignee || '',
      source: leadData.source || 'website',
      sourceUrl: leadData.sourceUrl || '',
      favorite: leadData.favorite || false
    };
    leads.unshift(newLead);
  }

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
  const leads = await getLeads();
  const filtered = leads.filter(lead => lead.id !== id);
  await setStorage(STORAGE_KEYS.LEADS, filtered);
  await updateSyncStatus();
  return filtered;
}

async function getContacts() {
  return await getStorage(STORAGE_KEYS.CONTACTS, []);
}

async function saveContact(contactData) {
  const contacts = await getContacts();
  const now = getTimestamp();

  if (contactData.id) {
    const index = contacts.findIndex(c => c.id === contactData.id);
    if (index !== -1) {
      contacts[index] = {
        ...contacts[index],
        ...contactData,
        updatedAt: now,
        syncState: SYNC_STATE.DIRTY
      };
    }
  } else {
    const newContact = {
      id: generateId('contact'),
      ...contactData,
      createdAt: now,
      updatedAt: now,
      syncState: SYNC_STATE.DIRTY
    };
    contacts.unshift(newContact);
  }

  await setStorage(STORAGE_KEYS.CONTACTS, contacts);
  await updateSyncStatus();
  return contacts;
}

async function getFollowUps() {
  return await getStorage(STORAGE_KEYS.FOLLOW_UPS, []);
}

async function getFollowUpsByLeadId(leadId) {
  const followUps = await getFollowUps();
  return followUps.filter(f => f.leadId === leadId).sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function saveFollowUp(followUpData) {
  const followUps = await getFollowUps();
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
  }

  await setStorage(STORAGE_KEYS.FOLLOW_UPS, followUps);
  await updateSyncStatus();

  if (followUpData.date && !followUpData.id) {
    const nextReminder = new Date(followUpData.date);
    if (nextReminder > new Date()) {
      chrome.runtime.sendMessage({
        type: 'SCHEDULE_REMINDER',
        followUpId: followUpData.id || followUps[0].id,
        date: followUpData.date
      });
    }
  }

  await addActivity({
    type: 'followup_created',
    leadId: followUpData.leadId,
    details: `设置了跟进提醒：${followUpData.title || followUpData.content || '未命名'}`
  });

  return followUps;
}

async function getNotes() {
  return await getStorage(STORAGE_KEYS.NOTES, []);
}

async function getNotesByLeadId(leadId) {
  const notes = await getNotes();
  return notes.filter(n => n.leadId === leadId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function saveNote(noteData) {
  const notes = await getNotes();
  const now = getTimestamp();

  if (noteData.id) {
    const index = notes.findIndex(n => n.id === noteData.id);
    if (index !== -1) {
      notes[index] = {
        ...notes[index],
        ...noteData,
        updatedAt: now,
        syncState: SYNC_STATE.DIRTY
      };
    }
  } else {
    const newNote = {
      id: generateId('note'),
      ...noteData,
      createdAt: now,
      updatedAt: now,
      syncState: SYNC_STATE.DIRTY
    };
    notes.unshift(newNote);
  }

  await setStorage(STORAGE_KEYS.NOTES, notes);
  await updateSyncStatus();

  await addActivity({
    type: 'note_added',
    leadId: noteData.leadId,
    details: `添加了沟通纪要`
  });

  return notes;
}

async function getActivities() {
  return await getStorage(STORAGE_KEYS.ACTIVITIES, []);
}

async function addActivity(activityData) {
  const activities = await getActivities();
  const newActivity = {
    id: generateId('activity'),
    ...activityData,
    createdAt: getTimestamp()
  };
  activities.unshift(newActivity);
  if (activities.length > 200) {
    activities.length = 200;
  }
  await setStorage(STORAGE_KEYS.ACTIVITIES, activities);
  return activities;
}

async function getFavorites() {
  return await getStorage(STORAGE_KEYS.FAVORITES, []);
}

async function addFavorite(favoriteData) {
  const favorites = await getFavorites();
  const exists = favorites.find(f => f.url === favoriteData.url);
  if (!exists) {
    const newFavorite = {
      id: generateId('fav'),
      ...favoriteData,
      createdAt: getTimestamp()
    };
    favorites.unshift(newFavorite);
    await setStorage(STORAGE_KEYS.FAVORITES, favorites);
  }
  return favorites;
}

async function removeFavorite(id) {
  const favorites = await getFavorites();
  const filtered = favorites.filter(f => f.id !== id);
  await setStorage(STORAGE_KEYS.FAVORITES, filtered);
  return filtered;
}

async function getSyncStatus() {
  return await getStorage(STORAGE_KEYS.SYNC_STATUS, {
    lastSyncTime: null,
    pendingCount: 0,
    syncState: SYNC_STATE.SYNCED
  });
}

async function updateSyncStatus() {
  const leads = await getLeads();
  const contacts = await getContacts();
  const followUps = await getFollowUps();
  const notes = await getNotes();

  const allItems = [...leads, ...contacts, ...followUps, ...notes];
  const dirtyCount = allItems.filter(item => item.syncState === SYNC_STATE.DIRTY).length;

  const syncStatus = {
    lastSyncTime: null,
    pendingCount: dirtyCount,
    syncState: dirtyCount > 0 ? SYNC_STATE.DIRTY : SYNC_STATE.SYNCED
  };

  await setStorage(STORAGE_KEYS.SYNC_STATUS, syncStatus);
  return syncStatus;
}

async function checkDuplicates(leadData, excludeId = null) {
  const leads = await getLeads();
  const duplicates = [];

  for (const lead of leads) {
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
  const leads = await getLeads();
  const now = getTimestamp();

  const updated = leads.map(lead => {
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

  await setStorage(STORAGE_KEYS.LEADS, updated);
  await updateSyncStatus();
  return updated;
}

async function exportThisWeeksLeads() {
  const leads = await getLeads();
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const thisWeeksLeads = leads.filter(lead => {
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
    '来源渠道': SOURCE_OPTIONS.find(s => s.value === lead.source)?.label || lead.source || '',
    '商机阶段': STAGE_OPTIONS.find(s => s.value === lead.stage)?.label || lead.stage || '',
    '预算': lead.budget || '',
    '需求': lead.requirements || '',
    '标签': (lead.tags || []).join('、'),
    '负责人': lead.assignee || '',
    '创建时间': lead.createdAt || '',
    '更新时间': lead.updatedAt || ''
  }));

  return exportData;
}

async function getSettings() {
  return await getStorage(STORAGE_KEYS.SETTINGS, {
    autoDetect: true,
    reminderEnabled: true,
    defaultAssignee: '',
    defaultSource: 'website',
    teamMembers: []
  });
}

async function saveSettings(settings) {
  await setStorage(STORAGE_KEYS.SETTINGS, settings);
  return settings;
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STORAGE_KEYS,
    SYNC_STATE,
    STAGE_OPTIONS,
    SOURCE_OPTIONS,
    getStorage,
    setStorage,
    generateId,
    getTimestamp,
    getLeads,
    getLeadById,
    saveLead,
    deleteLead,
    getContacts,
    saveContact,
    getFollowUps,
    getFollowUpsByLeadId,
    saveFollowUp,
    getNotes,
    getNotesByLeadId,
    saveNote,
    getActivities,
    addActivity,
    getFavorites,
    addFavorite,
    removeFavorite,
    getSyncStatus,
    updateSyncStatus,
    checkDuplicates,
    batchAddTags,
    exportThisWeeksLeads,
    getSettings,
    saveSettings,
    generateCSV,
    downloadCSV,
    formatDate,
    formatDateTime,
    getStageColor,
    getStageLabel,
    getSourceLabel,
    getSourceIcon
  };
}
