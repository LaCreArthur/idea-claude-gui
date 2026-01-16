const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME_DIR = os.homedir();
const TITLES_DIR = path.join(HOME_DIR, '.claude-gui');
const TITLES_FILE = path.join(TITLES_DIR, 'session-titles.json');

function ensureTitlesDir() {
  if (!fs.existsSync(TITLES_DIR)) {
    fs.mkdirSync(TITLES_DIR, { recursive: true });
  }
}

function loadTitles() {
  try {
    ensureTitlesDir();
    if (!fs.existsSync(TITLES_FILE)) {
      return {};
    }
    const data = fs.readFileSync(TITLES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[SessionTitles] Failed to load titles:', error.message);
    return {};
  }
}

function saveTitles(titles) {
  try {
    ensureTitlesDir();
    fs.writeFileSync(TITLES_FILE, JSON.stringify(titles, null, 2), 'utf-8');
  } catch (error) {
    console.error('[SessionTitles] Failed to save titles:', error.message);
    throw error;
  }
}

function updateTitle(sessionId, customTitle) {
  try {
    const titles = loadTitles();
    if (customTitle && customTitle.length > 50) {
      return { success: false, error: 'Title too long (max 50 characters)' };
    }
    titles[sessionId] = { customTitle: customTitle, updatedAt: Date.now() };
    saveTitles(titles);
    return { success: true, title: customTitle };
  } catch (error) {
    console.error('[SessionTitles] Failed to update title:', error.message);
    return { success: false, error: error.message };
  }
}

function getTitle(sessionId) {
  const titles = loadTitles();
  return titles[sessionId]?.customTitle || null;
}

function deleteTitle(sessionId) {
  try {
    const titles = loadTitles();
    if (!titles[sessionId]) {
      return true;
    }
    delete titles[sessionId];
    saveTitles(titles);
    return true;
  } catch (error) {
    console.error('[SessionTitles] Failed to delete title:', error.message);
    return false;
  }
}

function getUpdatedAt(sessionId) {
  const titles = loadTitles();
  return titles[sessionId]?.updatedAt || null;
}

module.exports = {
  loadTitles,
  updateTitle,
  getTitle,
  deleteTitle,
  getUpdatedAt,
  ensureTitlesDir
};
