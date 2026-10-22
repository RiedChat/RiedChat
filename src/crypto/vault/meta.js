// ===================== crypto/vault/meta.js =====================
// В localStorage ('xmppChatVaultMeta') только несекретные метаданные: credentialId (WebAuthn),
// соль+итерации (пароль-фраза); для android-native ничего (ключ в Keystore под KEY_ALIAS, VaultKeystoreBridge).
import { state } from '../../core/state.js';
import { lsGet, lsSet, lsRemove } from '../../core/storage.js';

import { androidNativeDeleteKey } from './android-bridge.js';

const META_KEY = 'xmppChatVaultMeta';

export function getMeta(){ return lsGet(META_KEY, null); }
export function setMeta(meta){ lsSet(META_KEY, meta); }
export function isSetup(){ return !!getMeta(); }

export function reset(){
  const meta = getMeta();
  if(meta && meta.mode === 'android-native') androidNativeDeleteKey();
  lsRemove(META_KEY);
  state.vaultKey = null;
}
