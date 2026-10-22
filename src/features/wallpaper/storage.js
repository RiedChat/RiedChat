// ===================== features/wallpaper/storage.js =====================
// Хранение обоев (localStorage, на аккаунт): wallpaperStore.get() / wallpaperStore.set(wallpaper|null).
import { accountValue } from '../../core/storage.js';

export const wallpaperStore = accountValue('xmppWallpaper');
