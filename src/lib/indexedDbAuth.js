/**
 * IndexedDB-based auth storage that survives browser history clears.
 */

const DB_NAME = 'CosmicSlothAuth';
const STORE_NAME = 'authData';
const AUTH_KEY = 'omenx_auth';

let db = null;

async function initDB() {
    if (db) return db;
    
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME);
            }
        };
    });
}

export async function saveAuthToIndexedDB(authData) {
    try {
        const database = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(authData, AUTH_KEY);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(authData);
        });
    } catch (error) {
        console.error('[IndexedDB] Save error');
        return null;
    }
}

export async function getAuthFromIndexedDB() {
    try {
        const database = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(AUTH_KEY);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || null);
        });
    } catch (error) {
        console.error('[IndexedDB] Retrieval error');
        return null;
    }
}

export async function clearAuthFromIndexedDB() {
    try {
        const database = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(AUTH_KEY);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (error) {
        console.error('[IndexedDB] Clear error');
    }
}