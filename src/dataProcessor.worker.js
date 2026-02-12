/* eslint-disable no-restricted-globals */

// Helper: Base64 to Uint8Array
const base64ToUint8Array = (base64) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

// Process data recursively to find and convert data_b64 fields
const processData = (data) => {
    if (!data) return data;

    if (Array.isArray(data)) {
        data.forEach(item => processData(item));
    } else if (typeof data === 'object') {
        // Check for specific structure associated with IRM/MRSI data
        if (data.data_b64) {
            data.data_uint8 = base64ToUint8Array(data.data_b64);
            // Optionally remove data_b64 to save memory if not needed anymore
            // delete data.data_b64; 
        }
        
        // Recursive check for nested objects (e.g. in dictionary results)
        Object.keys(data).forEach(key => {
            if (typeof data[key] === 'object') {
                processData(data[key]);
            }
        });
    }
    return data;
};

self.onmessage = async (e) => {
    const { id, url, options, type } = e.data;

    try {
        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const data = await response.json();

        // Check for API errors
        if (data?.error) {
            throw new Error(data.error);
        }

        // Heavy processing: Decode Base64 and structure data
        const processedData = processData(data);

        // Identify transferable objects (Uint8Arrays) to avoid copying
        const transferables = [];
        const collectTransferables = (obj) => {
            if (!obj) return;
            if (typeof obj === 'object') {
                if (obj instanceof Uint8Array) {
                    transferables.push(obj.buffer);
                } else if (Array.isArray(obj)) {
                    obj.forEach(collectTransferables);
                } else {
                    Object.values(obj).forEach(collectTransferables);
                }
            }
        };
        collectTransferables(processedData);

        self.postMessage({ id, success: true, data: processedData }, transferables);

    } catch (error) {
        self.postMessage({ id, success: false, error: error.message });
    }
};
