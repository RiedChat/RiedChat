// ===================== crypto/pep/publish-node.js =====================
// Публикация/удаление PEP-узла (XEP-0060) с автоисправлением access_model:
// publish-options → при precondition-not-met/conflict реконфигурация узла → повторный publish.
// Используется в omemo/device-list-publish.js и omemo/bundle.js.
import { NS_PUBSUB } from '../../core/constants.js';
import { debugLog } from '../../core/debug-log.js';
import { parseXml } from '../../core/dom-utils.js';
import { sendIqAsync, iqErrorCondition } from '../../core/iq.js';

// Форма access_model=open, общая для publish-options и pubsub#owner configure (различается FORM_TYPE).
const form = (formType) =>
  `<x xmlns="jabber:x:data" type="submit">` +
    `<field var="FORM_TYPE" type="hidden"><value>${formType}</value></field>` +
    `<field var="pubsub#access_model"><value>open</value></field>` +
    `<field var="pubsub#persist_items"><value>true</value></field>` +
    `<field var="pubsub#max_items"><value>max</value></field>` +
  `</x>`;

// Без publish-options сервер применяет дефолтный конфиг узла (часто presence/whitelist, не open):
// узел и item существуют, но get от собеседника молча отклоняется - выглядит как "устройств не найдено".
// publish-options действуют только при создании узла или если он уже open. Для существующего узла
// с другим access_model сервер отвечает precondition-not-met (XEP-0060 §8.2) - тогда реконфигурируем
// через pubsub#owner/configure и повторяем publish.
export async function publishItem(connection, node, itemId, innerXml){
  const { $iq } = window;
  const NS_PO = NS_PUBSUB + '#publish-options';
  const NS_NC = NS_PUBSUB + '#node_config';

  const doPublish = async (withOptions) => {
    const iq = $iq({type:'set'})
      .c('pubsub', {xmlns: NS_PUBSUB})
      .c('publish', {node})
      .c('item', {id: itemId})
      .cnode(parseXml(innerXml)).up().up().up(); // back up: item -> publish -> pubsub
    if(withOptions){
      iq.c('publish-options').cnode(parseXml(form(NS_PO)));
    }
    try{
      return await sendIqAsync(iq, undefined, connection);
    }catch(errStanza){
      const condName = iqErrorCondition(errStanza);
      const err = new Error('publish ' + node + ' failed: ' + condName);
      err.node = errStanza;
      err.condName = condName;
      throw err;
    }
  };

  // Реконфигурирует существующий узел на access_model=open (XEP-0060 §8.2, pubsub#owner):
  // publish-options на существующий узел не действуют.
  const reconfigureOpen = async () => {
    const iq = $iq({type:'set'})
      .c('pubsub', {xmlns: NS_PUBSUB + '#owner'})
      .c('configure', {node})
      .cnode(parseXml(form(NS_NC)));
    try{
      await sendIqAsync(iq, undefined, connection);
      return true;
    }catch(errStanza){
      const rawXml = errStanza ? new XMLSerializer().serializeToString(errStanza) : '(нет stanza)';
      throw new Error('configure ' + node + ' failed: ' + iqErrorCondition(errStanza) + ' | raw: ' + rawXml, { cause: errStanza });
    }
  };

  try{
    return await doPublish(true);
  }catch(e){
    // condName - склейка всех дочерних тегов <error/> через запятую (напр. "conflict,text,precondition-not-met"),
    // поэтому проверяем вхождение, а не строгое равенство.
    if(/\b(precondition-not-met|conflict)\b/.test(e.condName)){
      debugLog('publish ' + node + ': узел уже существует с другим конфигом (' + e.condName + ') - реконфигурирую на access_model=open через pubsub#owner');
      try{
        await reconfigureOpen();
        debugLog('configure ' + node + ': access_model=open установлен, повторяю publish');
      }catch(e2){
        debugLog('configure ' + node + ' FAIL: ' + e2.message + ' - публикую как есть (узел останется закрытым, get от собеседника может продолжить молча возвращать forbidden/пусто)');
      }
      return doPublish(false);
    }
    // Сервер не поддерживает publish-options (нет pubsub#publish-options в disco#info) - публикуем без них.
    debugLog('publish ' + node + ' с publish-options FAIL (' + e.condName + ') - пробую без них');
    return doPublish(false);
  }
}

// Удаляет PEP-узел целиком (pubsub#owner), чтобы не оставлять bundle-узел мёртвого устройства:
// он продолжает отвечать, а _pruneDeadIds() у собеседников не распознаёт его как мёртвый.
export function deleteNode(connection, node){
  const { $iq } = window;
  const iq = $iq({type:'set'})
    .c('pubsub', {xmlns: NS_PUBSUB + '#owner'})
    .c('delete', {node});
  return sendIqAsync(iq, undefined, connection).then(() => true, () => false);
}
