function uint8array_replacer(_key: string, value: object) {
    if (value instanceof Uint8Array) {
        return {
            type: "uint8array",
            data: btoa(String.fromCharCode(...value)),
        };
    }
    return value;
}

function uint8array_deserialize(
    _key: string,
    value: { type?: string; data?: string },
) {
    if (value.type === "uint8array") {
        const binaryString = atob(value.data!);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);

        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }
    return value;
}

export function serialize_message(obj: object): string {
    return JSON.stringify(obj, uint8array_replacer);
}

export function deserialize_message(raw: string): object {
    return JSON.parse(raw, uint8array_deserialize);
}
