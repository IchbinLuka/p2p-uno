export function uint8_to_b64(array: Uint8Array): string {
    return btoa(String.fromCharCode(...array));
}

export function b64_to_uint8(str: string): Uint8Array {
    const binaryString = atob(str);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function uint8array_replacer(_key: string, value: object) {
    if (value instanceof Uint8Array) {
        return {
            type: "uint8array",
            data: uint8_to_b64(value),
        };
    }
    return value;
}

function uint8array_deserialize(
    _key: string,
    value: { type?: string; data?: string },
) {
    if (value.type === "uint8array") {
        return b64_to_uint8(value.data!);
    }
    return value;
}

export function serialize_message(obj: object): string {
    return JSON.stringify(obj, uint8array_replacer);
}

export function deserialize_message(raw: string): object {
    return JSON.parse(raw, uint8array_deserialize);
}
