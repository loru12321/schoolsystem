var idbKeyval = (function (exports) {
    'use strict';
    function promisifyRequest(request) {
        return new Promise((resolve, reject) => {
            request.oncomplete = request.onsuccess = () => resolve(request.result);
            request.onabort = request.onerror = () => reject(request.error);
        });
    }
    function createStore(dbName, storeName) {
        const request = indexedDB.open(dbName);
        request.onupgradeneeded = () => request.result.createObjectStore(storeName);
        const dbp = promisifyRequest(request);
        return (txMode, callback) => dbp.then((db) => callback(db.transaction(storeName, txMode).objectStore(storeName)));
    }
    let defaultGetStoreFunc;
    function defaultGetStore() {
        if (!defaultGetStoreFunc) {
            defaultGetStoreFunc = createStore('keyval-store', 'keyval');
        }
        return defaultGetStoreFunc;
    }
    function get(key, customStore = defaultGetStore()) {
        return customStore('readonly', (store) => promisifyRequest(store.get(key)));
    }
    function set(key, value, customStore = defaultGetStore()) {
        return customStore('readwrite', (store) => {
            store.put(value, key);
            return promisifyRequest(store.transaction);
        });
    }
    function del(key, customStore = defaultGetStore()) {
        return customStore('readwrite', (store) => {
            store.delete(key);
            return promisifyRequest(store.transaction);
        });
    }
    function clear(customStore = defaultGetStore()) {
        return customStore('readwrite', (store) => {
            store.clear();
            return promisifyRequest(store.transaction);
        });
    }
    function keys(customStore = defaultGetStore()) {
        return customStore('readonly', (store) => {
            if (store.getAllKeys) {
                return promisifyRequest(store.getAllKeys());
            }
            const items = [];
            return new Promise((resolve, reject) => {
                store.openCursor().onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        items.push(cursor.key);
                        cursor.continue();
                    } else {
                        resolve(items);
                    }
                };
            });
        });
    }
    exports.get = get;
    exports.set = set;
    exports.del = del;
    exports.clear = clear;
    exports.keys = keys;
    exports.createStore = createStore;
    return exports;
})({});
