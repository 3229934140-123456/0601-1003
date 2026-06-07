const STORAGE_KEYS = {
  LEADS: 'crm_leads',
  FOLLOW_UPS: 'crm_follow_ups',
  NOTES: 'crm_notes',
  SYNC_STATUS: 'crm_sync_status',
  SETTINGS: 'crm_settings',
  ACTIVITIES: 'crm_activities'
};

const SYNC_STATE = {
  SYNCED: 'synced',
  DIRTY: 'dirty',
  PENDING: 'pending',
  ERROR: 'error'
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

function scheduleReminder(followUpId, dateStr) {
  const reminderDate = new Date(dateStr);
  const now = new Date();

  if (reminderDate <= now) {
    return;
  }

  const delayInMinutes = Math.max(1, Math.ceil((reminderDate - now) / 60000));

  chrome.alarms.create(`reminder_${followUpId}`, {
    delayInMinutes: delayInMinutes,
    periodInMinutes: 0
  });

  console.log(`Reminder scheduled for follow-up ${followUpId} in ${delayInMinutes} minutes`);
}

async function checkUpcomingReminders() {
  const followUps = await getStorage(STORAGE_KEYS.FOLLOW_UPS, []);
  const now = new Date();
  const oneDayLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const upcoming = followUps.filter(f => {
    if (f.completed || !f.date) return false;
    const date = new Date(f.date);
    return date >= now && date <= oneDayLater;
  });

  if (upcoming.length > 0) {
    chrome.action.setBadgeText({ text: String(upcoming.length) });
    chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('reminder_')) {
    const followUpId = alarm.name.replace('reminder_', '');
    const followUps = await getStorage(STORAGE_KEYS.FOLLOW_UPS, []);
    const followUp = followUps.find(f => f.id === followUpId);

    if (followUp && !followUp.completed) {
      const leads = await getStorage(STORAGE_KEYS.LEADS, []);
      const lead = leads.find(l => l.id === followUp.leadId);

      chrome.notifications.create(`followup_${followUpId}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '🔔 跟进提醒',
        message: `${lead ? lead.companyName + ' - ' : ''}${followUp.title || '待跟进'}`,
        priority: 2,
        requireInteraction: true,
        buttons: [
          { title: '查看详情' },
          { title: '标记完成' }
        ]
      });
    }

    checkUpcomingReminders();
  }

  if (alarm.name === 'daily_check') {
    checkUpcomingReminders();
  }
});

function openPopupPage() {
  const popupUrl = chrome.runtime.getURL('popup/popup.html');
  chrome.tabs.create({ url: popupUrl });
}

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId.startsWith('followup_')) {
    openPopupPage();
  }
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId.startsWith('followup_')) {
    const followUpId = notificationId.replace('followup_', '');

    if (buttonIndex === 1) {
      const followUps = await getStorage(STORAGE_KEYS.FOLLOW_UPS, []);
      const index = followUps.findIndex(f => f.id === followUpId);
      if (index !== -1) {
        followUps[index].completed = true;
        followUps[index].completedAt = getTimestamp();
        await setStorage(STORAGE_KEYS.FOLLOW_UPS, followUps);

        const leadId = followUps[index].leadId;
        if (leadId) {
          const activities = await getStorage(STORAGE_KEYS.ACTIVITIES, []);
          activities.unshift({
            id: generateId('activity'),
            type: 'followup_completed',
            leadId: leadId,
            details: '完成了跟进提醒',
            createdAt: getTimestamp()
          });
          await setStorage(STORAGE_KEYS.ACTIVITIES, activities);
        }

        chrome.notifications.clear(notificationId);
        showNotification('✅ 跟进完成', '已标记为完成');
        checkUpcomingReminders();
      }
    } else {
      openPopupPage();
    }
  }
});

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message,
    priority: 1
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCHEDULE_REMINDER') {
    scheduleReminder(message.followUpId, message.date);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'OPEN_POPUP') {
    openPopupPage();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'GET_PAGE_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PAGE_INFO' }, (response) => {
          sendResponse(response || {});
        });
      } else {
        sendResponse({});
      }
    });
    return true;
  }

  if (message.type === 'REFRESH_ALL') {
    checkUpcomingReminders();
    sendResponse({ success: true });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  console.log('CRM线索管家已安装');

  chrome.alarms.create('daily_check', {
    periodInMinutes: 60
  });

  const syncStatus = await getStorage(STORAGE_KEYS.SYNC_STATUS, null);
  if (!syncStatus) {
    await setStorage(STORAGE_KEYS.SYNC_STATUS, {
      lastSyncTime: null,
      pendingCount: 0,
      syncState: SYNC_STATE.SYNCED
    });
  }

  const settings = await getStorage(STORAGE_KEYS.SETTINGS, null);
  if (!settings) {
    await setStorage(STORAGE_KEYS.SETTINGS, {
      autoDetect: true,
      reminderEnabled: true,
      defaultAssignee: '',
      defaultSource: 'website',
      teamMembers: []
    });
  }

  checkUpcomingReminders();
});

chrome.runtime.onStartup.addListener(() => {
  checkUpcomingReminders();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    chrome.tabs.sendMessage(tabId, { type: 'REFRESH_LEADS' }, () => {
      chrome.runtime.lastError;
    });
  }
});
