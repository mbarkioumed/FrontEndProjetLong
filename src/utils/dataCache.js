// Global cache for storing large binary data outside of React state
// Keys: string (UUID or timestamp)
// Values: Uint8Array

export const dataCache = new Map();

export const storeData = (data) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    dataCache.set(id, data);
    return id;
};

export const getData = (id) => {
    return dataCache.get(id);
};

export const clearData = (id) => {
    dataCache.delete(id);
};
