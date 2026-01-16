const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME_DIR = os.homedir();
const FAVORITES_DIR = path.join(HOME_DIR, '.claude-gui');
const FAVORITES_FILE = path.join(FAVORITES_DIR, 'favorites.json');

function ensureFavoritesDir() {
  if (!fs.existsSync(FAVORITES_DIR)) {
    fs.mkdirSync(FAVORITES_DIR, { recursive: true });
  }
}

function loadFavorites() {
  try {
    ensureFavoritesDir();
    if (!fs.existsSync(FAVORITES_FILE)) {
      return {};
    }
    const data = fs.readFileSync(FAVORITES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[Favorites] Failed to load favorites:', error.message);
    return {};
  }
}

function saveFavorites(favorites) {
  try {
    ensureFavoritesDir();
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify(favorites, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Favorites] Failed to save favorites:', error.message);
    throw error;
  }
}

function addFavorite(sessionId) {
  try {
    const favorites = loadFavorites();
    if (favorites[sessionId]) {
      return true;
    }
    favorites[sessionId] = { favoritedAt: Date.now() };
    saveFavorites(favorites);
    return true;
  } catch (error) {
    console.error('[Favorites] Failed to add favorite:', error.message);
    return false;
  }
}

function removeFavorite(sessionId) {
  try {
    const favorites = loadFavorites();
    if (!favorites[sessionId]) {
      return true;
    }
    delete favorites[sessionId];
    saveFavorites(favorites);
    return true;
  } catch (error) {
    console.error('[Favorites] Failed to remove favorite:', error.message);
    return false;
  }
}

function toggleFavorite(sessionId) {
  try {
    const favorites = loadFavorites();
    const isFavorited = !!favorites[sessionId];
    if (isFavorited) {
      removeFavorite(sessionId);
    } else {
      addFavorite(sessionId);
    }
    return { success: true, isFavorited: !isFavorited };
  } catch (error) {
    console.error('[Favorites] Failed to toggle favorite:', error.message);
    return { success: false, isFavorited: false, error: error.message };
  }
}

function isFavorited(sessionId) {
  const favorites = loadFavorites();
  return !!favorites[sessionId];
}

function getFavoritedAt(sessionId) {
  const favorites = loadFavorites();
  return favorites[sessionId]?.favoritedAt || null;
}

function getFavoritedSessionIds() {
  const favorites = loadFavorites();
  return Object.entries(favorites)
    .sort((a, b) => b[1].favoritedAt - a[1].favoritedAt)
    .map(([sessionId]) => sessionId);
}

module.exports = {
  loadFavorites,
  addFavorite,
  removeFavorite,
  toggleFavorite,
  isFavorited,
  getFavoritedAt,
  getFavoritedSessionIds,
  ensureFavoritesDir
};
