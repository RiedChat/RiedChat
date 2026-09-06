// ===================== crypto/vault/meta.js =====================
// В localStorage (ключ 'xmppChatVaultMeta') лежат только непубличные, но не
// секретные метаданные: credentialId для WebAuthn, соль+число итераций для
// пароль-фразы, либо ничего доп. для android-native (ключ живёт в Keystore
// под фиксированным alias, см. VaultKeystoreBridge.KEY_ALIAS).
import { lsGet, lsSet, lsRemove } from '../../core/storage.js';
import { state } from '../../core/state.js';
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
