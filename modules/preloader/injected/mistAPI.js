/**
 @module MistAPI
 */

(function() {
  'use strict';

  var postMessage = function(payload) {
    if (typeof payload === 'object') {
      payload = JSON.stringify(payload);
    }

    window.postMessage(
      payload,
      !location.origin || location.origin === 'null' ? '*' : location.origin
    );
  };

  var queue = [];

  const prefix = 'entry_';
  const MIST_SUBMENU_LIMIT = 100;

  // todo: error handling
  const filterAdd = function(options) {
    if (!(options instanceof Object)) {
      return false;
    }

    return ['name'].every(e => e in options);
  };

  // filterId the id to only contain a-z A-Z 0-9
  const filterId = function(str) {
    const filteredStr = String(str);
    let newStr = '';
    if (filteredStr) {
      for (let i = 0; i < filteredStr.length; i += 1) {
        if (/[a-zA-Z0-9_-]/.test(filteredStr.charAt(i))) {
          newStr += filteredStr.charAt(i);
        }
      }
    }
    return newStr;
  };

  /**
     Mist API

     Provides an API for all dapps, which specifically targets features from the Mist browser

     @class mist
     @constructor
     */
  const mist = {
    callbacks: {},
    promises: { requestAccounts: [], createAccount: [] },
    version: '__version__',
    license: '__license__',
    platform: '__platform__',
    requestAccounts() {
      const promise = new Promise((resolve, reject) => {
        this.promises.requestAccounts.push({ resolve, reject });
      });
      postMessage({ type: 'mistAPI_requestAccounts' });
      return promise;
    },
    createAccount() {
      const promise = new Promise((resolve, reject) => {
        this.promises.createAccount.push({ resolve, reject });
      });
      postMessage({ type: 'mistAPI_createAccount' });
      return promise;
    },
    solidity: {
      version: '__solidityVersion__'
    },
    sounds: {
      bip: function playSound() {
        postMessage({
          type: 'mistAPI_sound',
          message: 'bip'
        });
      },
      bloop: function playSound() {
        postMessage({
          type: 'mistAPI_sound',
          message: 'bloop'
        });
      },
      invite: function playSound() {
        postMessage({
          type: 'mistAPI_sound',
          message: 'invite'
        });
      }
    },
    menu: {
      entries: {},
      /**
             Sets the badge text for the apps menu button

             Example

             mist.menu.setBadge('Some Text')

             @method setBadge
             @param {String} text
             */
      setBadge(text) {
        postMessage({
          type: 'mistAPI_setBadge',
          message: text
        });
      },
      /**
             Adds/Updates a menu entry

             Example

             mist.menu.add('tkrzU', {
                    name: 'My Meny Entry',
                    badge: 50,
                    position: 1,
                    selected: true
                }, function(){
                    // Router.go('/chat/1245');
                })

             @method add
             @param {String} id          The id of the menu, has to be the same accross page reloads.
             @param {Object} options     The menu options like {badge: 23, name: 'My Entry'}
             @param {Function} callback  Change the callback to be called when the menu is pressed.
             */
      add(id, options, callback) {
        const args = Array.prototype.slice.call(arguments);
        callback =
          typeof args[args.length - 1] === 'function' ? args.pop() : null;
        options = typeof args[args.length - 1] === 'object' ? args.pop() : null;
        id =
          typeof args[args.length - 1] === 'string' ||
          isFinite(args[args.length - 1])
            ? args.pop()
            : null;

        if (!filterAdd(options)) {
          return false;
        }

        const filteredId = prefix + filterId(id);

        // restricting to 100 menu entries
        if (
          !(filteredId in this.entries) &&
          Object.keys(this.entries).length >= MIST_SUBMENU_LIMIT
        ) {
          return false;
        }

        const entry = {
          id: filteredId || 'mist_defaultId',
          position: options.position,
          selected: !!options.selected,
          name: options.name,
          badge: options.badge
        };

        queue.push({
          action: 'addMenu',
          entry
        });

        if (callback) {
          entry.callback = callback;
        }

        this.entries[filteredId] = entry;
        return true;
      },
      /**
             Updates a menu entry from the mist sidebar.

             @method update
             @param {String} id          The id of the menu, has to be the same accross page reloads.
             @param {Object} options     The menu options like {badge: 23, name: 'My Entry'}
             @param {Function} callback  Change the callback to be called when the menu is pressed.
             */
      update() {
        this.add.apply(this, arguments);
      },
      /**
             Removes a menu entry from the mist sidebar.

             @method remove
             @param {String} id
             @param {String} id          The id of the menu, has to be the same accross page reloads.
             @param {Object} options     The menu options like {badge: 23, name: 'My Entry'}
             @param {Function} callback  Change the callback to be called when the menu is pressed.
             */
      remove(id) {
        const filteredId = prefix + filterId(id);

        delete this.entries[filteredId];

        queue.push({
          action: 'removeMenu',
          filteredId
        });
      },
      /**
             Marks a menu entry as selected

             @method select
             @param {String} id
             */
      select(id) {
        const filteredId = prefix + filterId(id);
        queue.push({ action: 'selectMenu', id: filteredId });

        for (const e in this.entries) {
          if ({}.hasOwnProperty.call(this.entries, e)) {
            this.entries[e].selected = e === filteredId;
          }
        }
      },
      /**
             Removes all menu entries.

             @method clear
             */
      clear() {
        this.entries = {};
        queue.push({ action: 'clearMenu' });
      }
    }
  };

  // Wait for response messages
  window.addEventListener('message', function(event) {
    var data;
    try {
      data = JSON.parse(event.data);
    } catch (e) {
      data = event.data;
    }

    if (typeof data !== 'object') {
      return;
    }

    if (data.type === 'mistAPI_callMenuFunction') {
      var id = data.message;

      if (mist.menu.entries[id] && mist.menu.entries[id].callback) {
        mist.menu.entries[id].callback();
      }
    } else if (data.type === 'uiAction_windowMessage') {
      const message = data.message;
      const { type, error, value } = message;

      if (mist.callbacks[type]) {
        mist.callbacks[type].forEach((callback, index) => {
          callback(error, value);
          mist.callbacks[type].splice(index, 1); // remove callback
        });
      }

      if (mist.promises[type]) {
        mist.promises[type].forEach((promise, index) => {
          if (error) {
            promise.reject(error);
          } else {
            promise.resolve(value);
          }
          mist.promises[type].splice(index, 1); // remove promise
        });
      }

      if (window.ethereum && !error) {
        if (type === 'requestAccounts') {
          window.ethereum._emitAccountsChanged(value);
        } else if (type === 'networkChanged') {
          window.ethereum._emitNetworkChanged(value);
        } else if (type === 'mistAPI_event_connect') {
          window.ethereum._emitConnect();
        } else if (type === 'mistAPI_event_close') {
          window.ethereum._emitClose(value[0], value[1]);
        }
      }
    }
  });

  // work up queue every 500ms
  setInterval(function() {
    if (queue.length > 0) {
      postMessage({
        type: 'mistAPI_menuChanges',
        message: queue
      });

      queue = [];
    }
  }, 500);

  window.mist = mist;
})();
