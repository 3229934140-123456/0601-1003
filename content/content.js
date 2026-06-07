(function() {
  'use strict';

  if (window.hasCRMFloatPanel) return;
  window.hasCRMFloatPanel = true;

  const STORAGE_KEYS = {
    LEADS: 'crm_leads',
    CONTACTS: 'crm_contacts',
    FOLLOW_UPS: 'crm_follow_ups',
    NOTES: 'crm_notes',
    SYNC_STATUS: 'crm_sync_status',
    FAVORITES: 'crm_favorites',
    ACTIVITIES: 'crm_activities',
    SETTINGS: 'crm_settings'
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

  function generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  function getTimestamp() {
    return new Date().toISOString();
  }

  function detectSource() {
    const url = window.location.href;
    const hostname = window.location.hostname;

    if (hostname.includes('linkedin.com')) return 'linkedin';
    if (hostname.includes('mail.') || hostname.includes('outlook.') || hostname.includes('gmail.')) return 'email';
    if (hostname.includes('weixin.qq.com') || hostname.includes('work.weixin')) return 'wechat';
    if (hostname.includes('facebook.com') || hostname.includes('twitter.com') || hostname.includes('x.com')) return 'social';
    return 'website';
  }

  function extractPageInfo() {
    const info = {
      url: window.location.href,
      title: document.title || '',
      source: detectSource()
    };

    const metaTags = document.querySelectorAll('meta');
    metaTags.forEach(meta => {
      const name = meta.getAttribute('name') || meta.getAttribute('property') || '';
      const content = meta.getAttribute('content') || '';
      if (name.toLowerCase().includes('description') && !info.description) {
        info.description = content;
      }
      if (name.toLowerCase().includes('og:title')) {
        info.ogTitle = content;
      }
      if (name.toLowerCase().includes('og:description')) {
        info.ogDescription = content;
      }
      if (name.toLowerCase().includes('og:site_name')) {
        info.siteName = content;
      }
    });

    const hostname = window.location.hostname;
    info.website = hostname;

    const title = info.siteName || info.ogTitle || document.title || '';
    const companyName = title.replace(/[|—-].*$/, '').trim();
    if (companyName && companyName.length < 100) {
      info.companyName = companyName;
    }

    const emails = [];
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const bodyText = document.body.innerText || '';
    const matches = bodyText.match(emailRegex);
    if (matches) {
      matches.forEach(email => {
        if (!emails.includes(email) && !email.includes('example') && !email.includes('noreply')) {
          emails.push(email);
        }
      });
      if (emails.length > 0) {
        info.email = emails[0];
        info.allEmails = emails;
      }
    }

    const phones = [];
    const phoneRegex = /(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}/g;
    const phoneMatches = bodyText.match(phoneRegex);
    if (phoneMatches) {
      phoneMatches.forEach(phone => {
        const cleanPhone = phone.replace(/[-\s]/g, '');
        if (!phones.includes(cleanPhone)) {
          phones.push(cleanPhone);
        }
      });
      if (phones.length > 0) {
        info.phone = phones[0];
        info.allPhones = phones;
      }
    }

    return info;
  }

  let panelState = {
    isOpen: false,
    activeTab: 'capture',
    detectedInfo: null,
    selectedLead: null,
    quickNote: '',
    leads: []
  };

  function loadLeads() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS.LEADS, (result) => {
        panelState.leads = result[STORAGE_KEYS.LEADS] || [];
        resolve(panelState.leads);
      });
    });
  }

  function saveLead(leadData) {
    return new Promise(async (resolve) => {
      const leads = await loadLeads();
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

      chrome.storage.local.set({ [STORAGE_KEYS.LEADS]: leads }, () => {
        panelState.leads = leads;
        resolve(leads);
      });
    });
  }

  function saveNote(noteData) {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS.NOTES, (result) => {
        const notes = result[STORAGE_KEYS.NOTES] || [];
        const now = getTimestamp();
        const newNote = {
          id: generateId('note'),
          ...noteData,
          createdAt: now,
          updatedAt: now,
          syncState: SYNC_STATE.DIRTY
        };
        notes.unshift(newNote);
        chrome.storage.local.set({ [STORAGE_KEYS.NOTES]: notes }, () => {
          resolve(notes);
        });
      });
    });
  }

  function saveFollowUp(followUpData) {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS.FOLLOW_UPS, (result) => {
        const followUps = result[STORAGE_KEYS.FOLLOW_UPS] || [];
        const now = getTimestamp();
        const newFollowUp = {
          id: generateId('followup'),
          ...followUpData,
          completed: false,
          createdAt: now,
          updatedAt: now,
          syncState: SYNC_STATE.DIRTY
        };
        followUps.unshift(newFollowUp);
        chrome.storage.local.set({ [STORAGE_KEYS.FOLLOW_UPS]: followUps }, () => {
          resolve(followUps);

          if (followUpData.date) {
            chrome.runtime.sendMessage({
              type: 'SCHEDULE_REMINDER',
              followUpId: newFollowUp.id,
              date: followUpData.date
            });
          }
        });
      });
    });
  }

  function checkDuplicates(leadData, excludeId = null) {
    return new Promise(async (resolve) => {
      const leads = await loadLeads();
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

      resolve(duplicates.sort((a, b) => b.score - a.score));
    });
  }

  function addFavorite(favoriteData) {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS.FAVORITES, (result) => {
        const favorites = result[STORAGE_KEYS.FAVORITES] || [];
        const exists = favorites.find(f => f.url === favoriteData.url);
        if (!exists) {
          const newFavorite = {
            id: generateId('fav'),
            ...favoriteData,
            createdAt: getTimestamp()
          };
          favorites.unshift(newFavorite);
          chrome.storage.local.set({ [STORAGE_KEYS.FAVORITES]: favorites }, () => {
            resolve(favorites);
          });
        } else {
          resolve(favorites);
        }
      });
    });
  }

  function createFloatPanel() {
    const panel = document.createElement('div');
    panel.id = 'crm-float-panel';
    panel.className = 'crm-float-panel';
    panel.innerHTML = `
      <div class="crm-panel-toggle" id="crmPanelToggle">
        <span class="crm-toggle-icon">📋</span>
        <span class="crm-toggle-badge" id="crmToggleBadge" style="display:none;">0</span>
      </div>
      <div class="crm-panel-content" id="crmPanelContent">
        <div class="crm-panel-header">
          <div class="crm-panel-title">
            <span>📊</span>
            <span>CRM 线索管家</span>
          </div>
          <div class="crm-panel-close" id="crmPanelClose">×</div>
        </div>
        <div class="crm-panel-tabs">
          <div class="crm-tab active" data-tab="capture">
            <span>🎯</span>
            <span>采集</span>
          </div>
          <div class="crm-tab" data-tab="leads">
            <span>📇</span>
            <span>线索</span>
          </div>
          <div class="crm-tab" data-tab="notes">
            <span>📝</span>
            <span>记录</span>
          </div>
          <div class="crm-tab" data-tab="followup">
            <span>⏰</span>
            <span>跟进</span>
          </div>
        </div>
        <div class="crm-panel-body">
          <div class="crm-tab-content active" id="crmTabCapture">
            <div class="crm-section">
              <div class="crm-section-title">
                <span>🔍</span>
                <span>页面信息</span>
              </div>
              <div class="crm-detected-info" id="crmDetectedInfo">
                <div class="crm-loading">正在检测页面信息...</div>
              </div>
            </div>
            <div class="crm-section">
              <div class="crm-section-title">
                <span>📝</span>
                <span>快速录入</span>
              </div>
              <form id="crmQuickForm" class="crm-form">
                <div class="crm-form-group">
                  <label>公司名称 *</label>
                  <input type="text" id="crmCompanyName" placeholder="请输入公司名称" />
                </div>
                <div class="crm-form-row">
                  <div class="crm-form-group">
                    <label>联系人</label>
                    <input type="text" id="crmPrimaryContact" placeholder="联系人姓名" />
                  </div>
                  <div class="crm-form-group">
                    <label>职位</label>
                    <input type="text" id="crmContactTitle" placeholder="职位" />
                  </div>
                </div>
                <div class="crm-form-row">
                  <div class="crm-form-group">
                    <label>电话</label>
                    <input type="tel" id="crmPhone" placeholder="联系电话" />
                  </div>
                  <div class="crm-form-group">
                    <label>邮箱</label>
                    <input type="email" id="crmEmail" placeholder="邮箱地址" />
                  </div>
                </div>
                <div class="crm-form-group">
                  <label>网站</label>
                  <input type="text" id="crmWebsite" placeholder="公司官网" />
                </div>
                <div class="crm-form-row">
                  <div class="crm-form-group">
                    <label>来源渠道</label>
                    <select id="crmSource">
                      ${SOURCE_OPTIONS.map(s => `<option value="${s.value}">${s.icon} ${s.label}</option>`).join('')}
                    </select>
                  </div>
                  <div class="crm-form-group">
                    <label>商机阶段</label>
                    <select id="crmStage">
                      ${STAGE_OPTIONS.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}
                    </select>
                  </div>
                </div>
                <div class="crm-form-row">
                  <div class="crm-form-group">
                    <label>预算</label>
                    <input type="text" id="crmBudget" placeholder="预估预算" />
                  </div>
                  <div class="crm-form-group">
                    <label>优先级</label>
                    <select id="crmPriority">
                      <option value="high">🔴 高</option>
                      <option value="medium" selected>🟡 中</option>
                      <option value="low">🟢 低</option>
                    </select>
                  </div>
                </div>
                <div class="crm-form-group">
                  <label>需求描述</label>
                  <textarea id="crmRequirements" rows="3" placeholder="简要描述客户需求..."></textarea>
                </div>
                <div class="crm-form-group">
                  <label>标签（逗号分隔）</label>
                  <input type="text" id="crmTags" placeholder="如：潜在客户, 重点跟进" />
                </div>
                <div id="crmDuplicateWarning" class="crm-duplicate-warning" style="display:none;">
                  <div class="crm-warning-title">⚠️ 发现疑似重复客户</div>
                  <div id="crmDuplicateList"></div>
                </div>
                <div class="crm-form-actions">
                  <button type="button" class="crm-btn-secondary" id="crmClearBtn">清空</button>
                  <button type="submit" class="crm-btn-primary" id="crmSaveBtn">💾 保存线索</button>
                </div>
              </form>
            </div>
            <div class="crm-section">
              <div class="crm-section-title">
                <span>⭐</span>
                <span>快捷操作</span>
              </div>
              <div class="crm-quick-actions">
                <button class="crm-quick-btn" id="crmFavBtn">
                  <span>📌</span>
                  <span>收藏页面</span>
                </button>
                <button class="crm-quick-btn" id="crmRefreshBtn">
                  <span>🔄</span>
                  <span>重新检测</span>
                </button>
              </div>
            </div>
          </div>
          <div class="crm-tab-content" id="crmTabLeads">
            <div class="crm-section">
              <div class="crm-section-title">
                <span>🔍</span>
                <span>搜索线索</span>
              </div>
              <input type="text" id="crmLeadSearch" class="crm-search-input" placeholder="搜索公司、联系人..." />
            </div>
            <div class="crm-section">
              <div class="crm-section-title">
                <span>📋</span>
                <span>最近线索</span>
                <span class="crm-badge" id="crmLeadCount">0</span>
              </div>
              <div class="crm-leads-list" id="crmLeadsList">
                <div class="crm-empty">暂无线索，快去采集吧！</div>
              </div>
            </div>
          </div>
          <div class="crm-tab-content" id="crmTabNotes">
            <div class="crm-section">
              <div class="crm-section-title">
                <span>✍️</span>
                <span>快捷记录</span>
              </div>
              <div class="crm-quick-note">
                <select id="crmNoteLead">
                  <option value="">-- 选择关联线索 --</option>
                </select>
                <textarea id="crmNoteContent" rows="4" placeholder="记录沟通内容、会议纪要、客户反馈..."></textarea>
                <button class="crm-btn-primary crm-full-width" id="crmSaveNoteBtn">💾 保存记录</button>
              </div>
            </div>
            <div class="crm-section">
              <div class="crm-section-title">
                <span>📜</span>
                <span>最近记录</span>
              </div>
              <div id="crmRecentNotes" class="crm-recent-notes">
                <div class="crm-empty">暂无记录</div>
              </div>
            </div>
          </div>
          <div class="crm-tab-content" id="crmTabFollowup">
            <div class="crm-section">
              <div class="crm-section-title">
                <span>📅</span>
                <span>设置跟进</span>
              </div>
              <form id="crmFollowUpForm" class="crm-form">
                <div class="crm-form-group">
                  <label>选择客户</label>
                  <select id="crmFollowUpLead">
                    <option value="">-- 选择线索 --</option>
                  </select>
                </div>
                <div class="crm-form-group">
                  <label>跟进主题</label>
                  <input type="text" id="crmFollowUpTitle" placeholder="如：发送产品资料" />
                </div>
                <div class="crm-form-row">
                  <div class="crm-form-group">
                    <label>日期</label>
                    <input type="date" id="crmFollowUpDate" />
                  </div>
                  <div class="crm-form-group">
                    <label>时间</label>
                    <input type="time" id="crmFollowUpTime" />
                  </div>
                </div>
                <div class="crm-form-group">
                  <label>跟进内容</label>
                  <textarea id="crmFollowUpContent" rows="3" placeholder="跟进内容或备注..."></textarea>
                </div>
                <button type="submit" class="crm-btn-primary crm-full-width">⏰ 设置提醒</button>
              </form>
            </div>
            <div class="crm-section">
              <div class="crm-section-title">
                <span>📋</span>
                <span>待跟进</span>
              </div>
              <div id="crmUpcomingFollowUps" class="crm-followups-list">
                <div class="crm-empty">暂无待跟进事项</div>
              </div>
            </div>
          </div>
        </div>
        <div class="crm-panel-footer">
          <div class="crm-sync-status" id="crmSyncStatus">
            <span class="crm-sync-dot synced"></span>
            <span>已同步</span>
          </div>
          <div class="crm-footer-actions">
            <button class="crm-mini-btn" id="crmOpenPopupBtn">🔗 打开面板</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    initPanelEvents();
    loadDetectedInfo();
    loadLeadsList();
    updateSyncStatus();
    updateLeadCount();
  }

  function initPanelEvents() {
    const toggle = document.getElementById('crmPanelToggle');
    const close = document.getElementById('crmPanelClose');
    const content = document.getElementById('crmPanelContent');

    toggle.addEventListener('click', () => {
      panelState.isOpen = !panelState.isOpen;
      if (panelState.isOpen) {
        content.classList.add('open');
        toggle.classList.add('active');
      } else {
        content.classList.remove('open');
        toggle.classList.remove('active');
      }
    });

    close.addEventListener('click', () => {
      panelState.isOpen = false;
      content.classList.remove('open');
      toggle.classList.remove('active');
    });

    const tabs = document.querySelectorAll('.crm-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        switchTab(tabName);
      });
    });

    const form = document.getElementById('crmQuickForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSaveLead();
    });

    document.getElementById('crmClearBtn').addEventListener('click', clearForm);
    document.getElementById('crmFavBtn').addEventListener('click', handleAddFavorite);
    document.getElementById('crmRefreshBtn').addEventListener('click', loadDetectedInfo);
    document.getElementById('crmSaveNoteBtn').addEventListener('click', handleSaveNote);
    document.getElementById('crmFollowUpForm').addEventListener('submit', (e) => {
      e.preventDefault();
      handleSaveFollowUp();
    });

    document.getElementById('crmLeadSearch').addEventListener('input', (e) => {
      filterLeads(e.target.value);
    });

    document.getElementById('crmOpenPopupBtn').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
    });

    document.getElementById('crmCompanyName').addEventListener('blur', checkDuplicateOnInput);
    document.getElementById('crmWebsite').addEventListener('blur', checkDuplicateOnInput);
    document.getElementById('crmEmail').addEventListener('blur', checkDuplicateOnInput);

    let isDragging = false;
    let startX, startY, startLeft, startTop;
    const header = document.querySelector('.crm-panel-header');

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.crm-panel-close')) return;
      isDragging = true;
      const panel = document.getElementById('crmPanelContent');
      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = startLeft + 'px';
      panel.style.top = startTop + 'px';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const panel = document.getElementById('crmPanelContent');
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      panel.style.left = (startLeft + dx) + 'px';
      panel.style.top = (startTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  function switchTab(tabName) {
    panelState.activeTab = tabName;

    document.querySelectorAll('.crm-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    document.querySelectorAll('.crm-tab-content').forEach(content => {
      content.classList.remove('active');
    });

    const tabContentMap = {
      'capture': 'crmTabCapture',
      'leads': 'crmTabLeads',
      'notes': 'crmTabNotes',
      'followup': 'crmTabFollowup'
    };

    const contentId = tabContentMap[tabName];
    if (contentId) {
      document.getElementById(contentId).classList.add('active');
    }

    if (tabName === 'leads') {
      loadLeadsList();
    } else if (tabName === 'notes') {
      loadNotesTabData();
    } else if (tabName === 'followup') {
      loadFollowUpTabData();
    }
  }

  function loadDetectedInfo() {
    const info = extractPageInfo();
    panelState.detectedInfo = info;

    const container = document.getElementById('crmDetectedInfo');
    if (info.companyName || info.email || info.phone) {
      let html = '<div class="crm-detected-items">';
      if (info.companyName) {
        html += `<div class="crm-detected-item" data-field="companyName" data-value="${escapeHtml(info.companyName)}">
          <span class="crm-detected-label">公司</span>
          <span class="crm-detected-value">${escapeHtml(info.companyName)}</span>
          <button class="crm-use-btn">使用</button>
        </div>`;
      }
      if (info.email) {
        html += `<div class="crm-detected-item" data-field="email" data-value="${escapeHtml(info.email)}">
          <span class="crm-detected-label">邮箱</span>
          <span class="crm-detected-value">${escapeHtml(info.email)}</span>
          <button class="crm-use-btn">使用</button>
        </div>`;
      }
      if (info.phone) {
        html += `<div class="crm-detected-item" data-field="phone" data-value="${escapeHtml(info.phone)}">
          <span class="crm-detected-label">电话</span>
          <span class="crm-detected-value">${escapeHtml(info.phone)}</span>
          <button class="crm-use-btn">使用</button>
        </div>`;
      }
      html += '</div>';
      html += '<button class="crm-btn-secondary crm-full-width crm-use-all-btn" id="crmUseAllBtn">✨ 一键填入全部</button>';
      container.innerHTML = html;

      document.querySelectorAll('.crm-use-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const item = e.target.closest('.crm-detected-item');
          const field = item.dataset.field;
          const value = item.dataset.value;
          fillField(field, value);
        });
      });

      document.getElementById('crmUseAllBtn').addEventListener('click', () => {
        if (info.companyName) fillField('companyName', info.companyName);
        if (info.email) fillField('email', info.email);
        if (info.phone) fillField('phone', info.phone);
        if (info.website) fillField('website', info.website);
      });
    } else {
      container.innerHTML = '<div class="crm-empty">未检测到可识别的公司信息</div>';
    }

    document.getElementById('crmSource').value = info.source || 'website';
    document.getElementById('crmWebsite').value = info.website || '';
  }

  function fillField(field, value) {
    const fieldMap = {
      'companyName': 'crmCompanyName',
      'email': 'crmEmail',
      'phone': 'crmPhone',
      'website': 'crmWebsite'
    };

    const inputId = fieldMap[field];
    if (inputId) {
      const input = document.getElementById(inputId);
      if (input) {
        input.value = value;
        input.focus();
        input.classList.add('crm-highlight');
        setTimeout(() => input.classList.remove('crm-highlight'), 1000);
      }
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function clearForm() {
    document.getElementById('crmQuickForm').reset();
    document.getElementById('crmDuplicateWarning').style.display = 'none';
  }

  async function handleSaveLead() {
    const companyName = document.getElementById('crmCompanyName').value.trim();
    if (!companyName) {
      showToast('请输入公司名称', 'error');
      return;
    }

    const tagsStr = document.getElementById('crmTags').value.trim();
    const tags = tagsStr ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(t => t) : [];

    const leadData = {
      companyName: companyName,
      primaryContact: document.getElementById('crmPrimaryContact').value.trim(),
      contactTitle: document.getElementById('crmContactTitle').value.trim(),
      phone: document.getElementById('crmPhone').value.trim(),
      email: document.getElementById('crmEmail').value.trim(),
      website: document.getElementById('crmWebsite').value.trim(),
      source: document.getElementById('crmSource').value,
      stage: document.getElementById('crmStage').value,
      budget: document.getElementById('crmBudget').value.trim(),
      priority: document.getElementById('crmPriority').value,
      requirements: document.getElementById('crmRequirements').value.trim(),
      tags: tags,
      sourceUrl: window.location.href
    };

    await saveLead(leadData);
    showToast('线索保存成功！', 'success');
    clearForm();
    loadLeadsList();
    updateLeadCount();
    updateSyncStatus();
  }

  async function checkDuplicateOnInput() {
    const companyName = document.getElementById('crmCompanyName').value.trim();
    const website = document.getElementById('crmWebsite').value.trim();
    const email = document.getElementById('crmEmail').value.trim();

    if (!companyName && !website && !email) {
      document.getElementById('crmDuplicateWarning').style.display = 'none';
      return;
    }

    const duplicates = await checkDuplicates({ companyName, website, email });

    if (duplicates.length > 0) {
      const warningEl = document.getElementById('crmDuplicateWarning');
      const listEl = document.getElementById('crmDuplicateList');

      warningEl.style.display = 'block';

      const levelLabels = {
        high: { text: '高度相似', class: 'high' },
        medium: { text: '可能重复', class: 'medium' },
        low: { text: '轻度相似', class: 'low' }
      };

      listEl.innerHTML = duplicates.slice(0, 3).map(d => `
        <div class="crm-duplicate-item">
          <div class="crm-duplicate-header">
            <span class="crm-duplicate-name">${escapeHtml(d.lead.companyName || '未知公司')}</span>
            <span class="crm-duplicate-score ${levelLabels[d.level].class}">${levelLabels[d.level].text} (${d.score}分)</span>
          </div>
          ${d.lead.primaryContact ? `<div class="crm-duplicate-sub">${escapeHtml(d.lead.primaryContact)} · ${escapeHtml(d.lead.contactTitle || '')}</div>` : ''}
        </div>
      `).join('');
    } else {
      document.getElementById('crmDuplicateWarning').style.display = 'none';
    }
  }

  async function loadLeadsList() {
    const leads = await loadLeads();
    const listEl = document.getElementById('crmLeadsList');

    if (leads.length === 0) {
      listEl.innerHTML = '<div class="crm-empty">暂无线索，快去采集吧！</div>';
      return;
    }

    const displayLeads = leads.slice(0, 20);

    listEl.innerHTML = displayLeads.map(lead => {
      const stageInfo = STAGE_OPTIONS.find(s => s.value === lead.stage) || {};
      const sourceInfo = SOURCE_OPTIONS.find(s => s.value === lead.source) || {};
      const priorityColors = { high: '#f44336', medium: '#ff9800', low: '#4caf50' };

      return `
        <div class="crm-lead-card" data-id="${lead.id}">
          <div class="crm-lead-header">
            <div class="crm-lead-company">
              ${lead.favorite ? '<span class="crm-fav-star">⭐</span>' : ''}
              <span class="crm-lead-name">${escapeHtml(lead.companyName || '未知公司')}</span>
            </div>
            <span class="crm-lead-stage" style="background: ${stageInfo.color || '#9e9e9e'}">${stageInfo.label || lead.stage}</span>
          </div>
          <div class="crm-lead-contact">
            ${lead.primaryContact ? `<span>${escapeHtml(lead.primaryContact)}</span>` : ''}
            ${lead.contactTitle ? `<span class="crm-muted">${escapeHtml(lead.contactTitle)}</span>` : ''}
          </div>
          <div class="crm-lead-meta">
            <span>${sourceInfo.icon || '📌'} ${sourceInfo.label || lead.source || '未知'}</span>
            <span style="color: ${priorityColors[lead.priority] || '#999'}">●</span>
            <span class="crm-muted">${formatDate(lead.createdAt)}</span>
          </div>
          ${lead.tags && lead.tags.length > 0 ? `
            <div class="crm-lead-tags">
              ${lead.tags.slice(0, 3).map(tag => `<span class="crm-tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    const leadCards = document.querySelectorAll('.crm-lead-card');
    leadCards.forEach(card => {
      card.addEventListener('click', () => {
        const leadId = card.dataset.id;
        const lead = panelState.leads.find(l => l.id === leadId);
        if (lead) {
          showLeadDetail(lead);
        }
      });
    });
  }

  function filterLeads(query) {
    const leads = panelState.leads;
    const listEl = document.getElementById('crmLeadsList');
    const q = query.toLowerCase();

    const filtered = leads.filter(lead => {
      if (!q) return true;
      return (
        (lead.companyName && lead.companyName.toLowerCase().includes(q)) ||
        (lead.primaryContact && lead.primaryContact.toLowerCase().includes(q)) ||
        (lead.email && lead.email.toLowerCase().includes(q)) ||
        (lead.tags && lead.tags.some(t => t.toLowerCase().includes(q)))
      );
    });

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="crm-empty">未找到匹配的线索</div>';
      return;
    }

    const displayLeads = filtered.slice(0, 20);

    listEl.innerHTML = displayLeads.map(lead => {
      const stageInfo = STAGE_OPTIONS.find(s => s.value === lead.stage) || {};
      const sourceInfo = SOURCE_OPTIONS.find(s => s.value === lead.source) || {};
      const priorityColors = { high: '#f44336', medium: '#ff9800', low: '#4caf50' };

      return `
        <div class="crm-lead-card" data-id="${lead.id}">
          <div class="crm-lead-header">
            <div class="crm-lead-company">
              ${lead.favorite ? '<span class="crm-fav-star">⭐</span>' : ''}
              <span class="crm-lead-name">${escapeHtml(lead.companyName || '未知公司')}</span>
            </div>
            <span class="crm-lead-stage" style="background: ${stageInfo.color || '#9e9e9e'}">${stageInfo.label || lead.stage}</span>
          </div>
          <div class="crm-lead-contact">
            ${lead.primaryContact ? `<span>${escapeHtml(lead.primaryContact)}</span>` : ''}
            ${lead.contactTitle ? `<span class="crm-muted">${escapeHtml(lead.contactTitle)}</span>` : ''}
          </div>
          <div class="crm-lead-meta">
            <span>${sourceInfo.icon || '📌'} ${sourceInfo.label || lead.source || '未知'}</span>
            <span style="color: ${priorityColors[lead.priority] || '#999'}">●</span>
            <span class="crm-muted">${formatDate(lead.createdAt)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function showLeadDetail(lead) {
    alert(`线索详情：\n\n公司：${lead.companyName}\n联系人：${lead.primaryContact || '无'}\n电话：${lead.phone || '无'}\n邮箱：${lead.email || '无'}\n阶段：${getStageLabel(lead.stage)}`);
  }

  async function loadNotesTabData() {
    const leads = await loadLeads();
    const leadSelect = document.getElementById('crmNoteLead');
    leadSelect.innerHTML = '<option value="">-- 选择关联线索 --</option>' +
      leads.slice(0, 20).map(l => `<option value="${l.id}">${escapeHtml(l.companyName)}</option>`).join('');

    loadRecentNotes();
  }

  async function loadRecentNotes() {
    const notes = await getRecentNotes();
    const container = document.getElementById('crmRecentNotes');

    if (notes.length === 0) {
      container.innerHTML = '<div class="crm-empty">暂无记录</div>';
      return;
    }

    const leads = panelState.leads;

    container.innerHTML = notes.slice(0, 10).map(note => {
      const lead = leads.find(l => l.id === note.leadId);
      return `
        <div class="crm-note-item">
          <div class="crm-note-header">
            <span class="crm-note-lead">${lead ? escapeHtml(lead.companyName) : '未关联'}</span>
            <span class="crm-note-time">${formatDateTime(note.createdAt)}</span>
          </div>
          <div class="crm-note-content">${escapeHtml(note.content || '').substring(0, 100)}${note.content && note.content.length > 100 ? '...' : ''}</div>
        </div>
      `;
    }).join('');
  }

  function getRecentNotes() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS.NOTES, (result) => {
        const notes = result[STORAGE_KEYS.NOTES] || [];
        resolve(notes.slice(0, 20));
      });
    });
  }

  async function handleSaveNote() {
    const leadId = document.getElementById('crmNoteLead').value;
    const content = document.getElementById('crmNoteContent').value.trim();

    if (!content) {
      showToast('请输入记录内容', 'error');
      return;
    }

    await saveNote({
      leadId: leadId || null,
      content: content,
      type: 'communication'
    });

    document.getElementById('crmNoteContent').value = '';
    showToast('记录保存成功！', 'success');
    loadRecentNotes();
    updateSyncStatus();
  }

  async function loadFollowUpTabData() {
    const leads = await loadLeads();
    const leadSelect = document.getElementById('crmFollowUpLead');
    leadSelect.innerHTML = '<option value="">-- 选择线索 --</option>' +
      leads.slice(0, 20).map(l => `<option value="${l.id}">${escapeHtml(l.companyName)}</option>`).join('');

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('crmFollowUpDate').value = formatDate(tomorrow.toISOString());
    document.getElementById('crmFollowUpTime').value = '10:00';

    loadUpcomingFollowUps();
  }

  async function loadUpcomingFollowUps() {
    const followUps = await getUpcomingFollowUps();
    const container = document.getElementById('crmUpcomingFollowUps');

    if (followUps.length === 0) {
      container.innerHTML = '<div class="crm-empty">暂无待跟进事项</div>';
      return;
    }

    const leads = panelState.leads;

    container.innerHTML = followUps.slice(0, 10).map(fu => {
      const lead = leads.find(l => l.id === fu.leadId);
      const dateStr = fu.date ? formatDate(fu.date) : '';
      const timeStr = fu.time || '';

      return `
        <div class="crm-followup-item ${fu.completed ? 'completed' : ''}">
          <div class="crm-followup-header">
            <span class="crm-followup-title">${escapeHtml(fu.title || '未命名跟进')}</span>
            <span class="crm-followup-datetime">${dateStr} ${timeStr}</span>
          </div>
          <div class="crm-followup-lead">${lead ? escapeHtml(lead.companyName) : '未关联客户'}</div>
          ${fu.content ? `<div class="crm-followup-content">${escapeHtml(fu.content).substring(0, 50)}...</div>` : ''}
        </div>
      `;
    }).join('');
  }

  function getUpcomingFollowUps() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS.FOLLOW_UPS, (result) => {
        const followUps = result[STORAGE_KEYS.FOLLOW_UPS] || [];
        const upcoming = followUps.filter(f => !f.completed).sort((a, b) => {
          const dateA = a.date ? new Date(a.date) : new Date(0);
          const dateB = b.date ? new Date(b.date) : new Date(0);
          return dateA - dateB;
        });
        resolve(upcoming);
      });
    });
  }

  async function handleSaveFollowUp() {
    const leadId = document.getElementById('crmFollowUpLead').value;
    const title = document.getElementById('crmFollowUpTitle').value.trim();
    const date = document.getElementById('crmFollowUpDate').value;
    const time = document.getElementById('crmFollowUpTime').value;
    const content = document.getElementById('crmFollowUpContent').value.trim();

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
      leadId: leadId || null,
      title: title,
      date: dateTime,
      time: time,
      content: content
    });

    document.getElementById('crmFollowUpForm').reset();
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('crmFollowUpDate').value = formatDate(tomorrow.toISOString());
    document.getElementById('crmFollowUpTime').value = '10:00';

    showToast('跟进提醒设置成功！', 'success');
    loadUpcomingFollowUps();
    updateSyncStatus();
  }

  async function handleAddFavorite() {
    const info = panelState.detectedInfo || {};
    await addFavorite({
      url: window.location.href,
      title: document.title,
      companyName: info.companyName || '',
      source: info.source || 'website'
    });
    showToast('页面已收藏！', 'success');
  }

  function updateLeadCount() {
    const count = panelState.leads.length;
    document.getElementById('crmLeadCount').textContent = count;
    const badge = document.getElementById('crmToggleBadge');
    if (count > 0) {
      badge.style.display = 'flex';
      badge.textContent = count;
    } else {
      badge.style.display = 'none';
    }
  }

  function updateSyncStatus() {
    chrome.storage.local.get(STORAGE_KEYS.SYNC_STATUS, (result) => {
      const status = result[STORAGE_KEYS.SYNC_STATUS] || { syncState: 'synced', pendingCount: 0 };
      const syncEl = document.getElementById('crmSyncStatus');
      const dot = syncEl.querySelector('.crm-sync-dot');
      const text = syncEl.querySelector('span:last-child');

      if (status.syncState === SYNC_STATE.DIRTY || status.pendingCount > 0) {
        dot.className = 'crm-sync-dot dirty';
        text.textContent = `${status.pendingCount} 条待同步`;
      } else {
        dot.className = 'crm-sync-dot synced';
        text.textContent = '已同步';
      }
    });
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

  function getStageLabel(stage) {
    const found = STAGE_OPTIONS.find(s => s.value === stage);
    return found ? found.label : stage;
  }

  function showToast(message, type = 'info') {
    const existing = document.getElementById('crm-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'crm-toast';
    toast.className = `crm-toast crm-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createFloatPanel);
  } else {
    createFloatPanel();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_PAGE_INFO') {
      sendResponse(extractPageInfo());
    }
    if (message.type === 'TOGGLE_PANEL') {
      const toggle = document.getElementById('crmPanelToggle');
      if (toggle) toggle.click();
    }
    if (message.type === 'REFRESH_LEADS') {
      loadLeads().then(() => {
        loadLeadsList();
        updateLeadCount();
      });
    }
    return true;
  });

})();
