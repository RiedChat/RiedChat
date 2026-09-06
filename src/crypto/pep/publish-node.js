// ===================== crypto/pep/publish-node.js =====================
// Общий механизм публикации/удаления PEP-узла (XEP-0060) с автоисправлением
// access_model. Раньше жил внутри crypto/omemo/publish.js, хотя сама логика
// (publish-options → на precondition-not-met/conflict реконфигурировать узел
// → повторить publish) не специфична для OMEMO и годится для любого PEP-узла.
// Используется из crypto/omemo/device-list-publish.js и crypto/omemo/bundle.js.
import { NS_PUBSUB, IQ_TIMEOUT_MS } from '../../core/constants.js';
import { _parseXml } from '../../core/dom-utils.js';
import { omemo } from '../omemo/state.js';
import { debugLog } from '../../core/debug-log.js';
import { t } from '../../i18n/t.js';

// См. подробный комментарий в crypto/omemo/device-list-discovery.js - без явного
// таймаута sendIQ может зависнуть навсегда, если ответ сервера потерян
// или задержан (например, сервер занят обработкой только что залитого
// крупного файла).

Object.assign(omemo, {
  // ВАЖНО (по итогам разбора XEP-0384 §"Discovering ... access model" и
  // XMPP wiki "Tech pages/OMEMO/publish options"): без явных publish-options
  // сервер применяет свой дефолтный конфиг PEP-узла при автосоздании - а он
  // не у всех "open" (у многих серверов дефолт для новых узлов -
  // presence/whitelist, "open" форсится только явной конфигурацией
  // администратора). Если это presence/whitelist, узел реально существует
  // и item в нём есть, но get-запрос от собеседника сервер молча
  // отклоняет - и на стороне отправителя это выглядит ТОЧНО так же, как
  // "устройств не найдено".
  //
  // publish-options решают это ТОЛЬКО при первом создании узла или если он
  // уже был open. Если узел СУЩЕСТВОВАЛ РАНЬШЕ с другим access_model,
  // сервер по XEP-0060 обязан ответить ошибкой precondition-not-met и
  // конфиг публикацией не поменяет - тут предыдущая версия этого метода
  // ошибочно просто повторяла publish без options, что оставляло узел
  // закрытым НАВСЕГДА. Правильный алгоритм (XEP-0060 §8.2): на
  // precondition-not-met явно реконфигурировать узел через
  // pubsub#owner/configure, и только потом повторить publish.
  async _publishItem(node, itemId, innerXml){
    const { $iq } = window;
    const NS_PO = NS_PUBSUB + '#publish-options';
    const NS_NC = NS_PUBSUB + '#node_config';

    const publishOptionsXml =
      `<x xmlns="jabber:x:data" type="submit">` +
        `<field var="FORM_TYPE" type="hidden"><value>${NS_PO}</value></field>` +
        `<field var="pubsub#access_model"><value>open</value></field>` +
        `<field var="pubsub#persist_items"><value>true</value></field>` +
        `<field var="pubsub#max_items"><value>max</value></field>` +
      `</x>`;

    const doPublish = (withOptions) => new Promise((resolve, reject) => {
      const iq = $iq({type:'set'})
        .c('pubsub', {xmlns: NS_PUBSUB})
        .c('publish', {node})
        .c('item', {id: itemId})
        .cnode(_parseXml(innerXml)).up().up().up(); // back up: item -> publish -> pubsub
      if(withOptions){
        iq.c('publish-options').cnode(_parseXml(publishOptionsXml));
      }
      this.connection.sendIQ(iq, resolve, (errStanza) => {
        const cond = errStanza ? errStanza.querySelector('error') : null;
        const condName = cond ? Array.from(cond.children).map(c => c.tagName).join(',') : t('omemo.pepNoResponse');
        const err = new Error('publish ' + node + ' failed: ' + condName);
        err.node = errStanza;
        err.condName = condName;
        reject(err);
      }, IQ_TIMEOUT_MS);
    });

    // Явно реконфигурирует уже существующий узел на access_model=open
    // (XEP-0060 §8.2, pubsub#owner). Нужен, когда узел был создан раньше
    // (в т.ч. до этого фикса) с закрытым дефолтным конфигом сервера -
    // одних publish-options на существующий узел недостаточно.
    const reconfigureOpen = () => new Promise((resolve, reject) => {
      const configXml =
        `<x xmlns="jabber:x:data" type="submit">` +
          `<field var="FORM_TYPE" type="hidden"><value>${NS_NC}</value></field>` +
          `<field var="pubsub#access_model"><value>open</value></field>` +
          `<field var="pubsub#persist_items"><value>true</value></field>` +
          `<field var="pubsub#max_items"><value>max</value></field>` +
        `</x>`;
      const iq = $iq({type:'set'})
        .c('pubsub', {xmlns: NS_PUBSUB + '#owner'})
        .c('configure', {node})
        .cnode(_parseXml(configXml));
      this.connection.sendIQ(iq, () => resolve(true), (errStanza) => {
        const cond = errStanza ? errStanza.querySelector('error') : null;
        const condName = cond ? Array.from(cond.children).map(c => c.tagName).join(',') : t('omemo.pepNoResponse');
        const rawXml = errStanza ? new XMLSerializer().serializeToString(errStanza) : '(нет stanza)';
        reject(new Error('configure ' + node + ' failed: ' + condName + ' | raw: ' + rawXml));
      }, IQ_TIMEOUT_MS);
    });

    try{
      return await doPublish(true);
    }catch(e){
      // ВАЖНО: condName - это склейка ВСЕХ дочерних тегов <error/> через
      // запятую (напр. "conflict,text,precondition-not-met" - сервер может
      // класть несколько условий рядом), а не единственное значение. Раньше
      // здесь было строгое сравнение (=== 'precondition-not-met'), которое
      // с такой склейкой никогда не совпадало - и реконфигурация узла ни
      // разу не вызывалась, хотя должна была. Теперь проверяем вхождение.
      const isPreconditionOrConflict = /\bprecondition-not-met\b/.test(e.condName) || /\bconflict\b/.test(e.condName);
      if(isPreconditionOrConflict){
        debugLog('publish ' + node + ': узел уже существует с другим конфигом (' + e.condName + ') - реконфигурирую на access_model=open через pubsub#owner');
        try{
          await reconfigureOpen();
          debugLog('configure ' + node + ': access_model=open установлен, повторяю publish');
          return await doPublish(false);
        }catch(e2){
          debugLog('configure ' + node + ' FAIL: ' + e2.message + ' - публикую как есть (узел останется закрытым, get от собеседника может продолжить молча возвращать forbidden/пусто)');
          return await doPublish(false);
        }
      }
      // сервер не поддерживает publish-options вовсе (напр. нет
      // pubsub#publish-options в disco#info на своём JID) - публикуем без них,
      // это лучше, чем не опубликовать вовсе.
      debugLog('publish ' + node + ' с publish-options FAIL (' + e.condName + ') - пробую без них');
      return await doPublish(false);
    }
  },

  // Удаляет PEP-узел целиком (pubsub#owner). Используется, чтобы не оставлять
  // после себя bundle-узел мёртвого устройства - иначе он продолжит отвечать
  // на запросы (т.к. формально существует и самосогласован), наш же
  // _pruneDeadIds() у СОБЕСЕДНИКОВ его не распознает как мёртвый, и это
  // копится с каждым "удалить аккаунт и пересоздать".
  _deleteNode(node){
    const { $iq } = window;
    return new Promise((resolve) => {
      const iq = $iq({type:'set'})
        .c('pubsub', {xmlns: NS_PUBSUB + '#owner'})
        .c('delete', {node});
      this.connection.sendIQ(iq, () => resolve(true), () => resolve(false), IQ_TIMEOUT_MS);
    });
  },
});
