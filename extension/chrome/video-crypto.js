(() => {
    'use strict';

    const QAAB_SALT = Uint8Array.from(
        ('4dd4c2e6b83162090e52b3c7a6733ba4' +
            '1cb2462b829ab58a196b39db57177524' +
            'f49baf7f08e8d68d26a72e37c1a95a2f' +
            '1f05a51892aef2949732b62a38aadd58').match(/../g),
        hex => parseInt(hex, 16)
    );

    function decodeBase64Loose(value) {
        const text = String(value || '').trim();
        const variants = [
            text,
            text.replace(/\$/g, '_').replace(/@/g, '/').replace(/#/g, '.'),
            text.replace(/\$/g, '+').replace(/@/g, '/').replace(/#/g, '=')
        ];
        for (const variant of variants) {
            if (!variant) continue;
            try {
                const normalized = variant.replace(/-/g, '+').replace(/_/g, '/')
                    .padEnd(Math.ceil(variant.length / 4) * 4, '=');
                const binary = atob(normalized);
                return Uint8Array.from(binary, char => char.charCodeAt(0));
            } catch (_) { /* Try the next encoding variant. */ }
        }
        return null;
    }

    function bytesToHttpUrl(bytes) {
        if (!bytes) return '';
        const text = new TextDecoder().decode(bytes).trim();
        return /^https?:\/\/[^\s]+$/i.test(text) ? text : '';
    }

    function concatBytes(...parts) {
        const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
        let offset = 0;
        parts.forEach(part => { result.set(part, offset); offset += part.length; });
        return result;
    }

    async function decryptAesCbcUrl(payload, key, iv) {
        if (!payload?.length || payload.length % 16) return '';
        try {
            const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['decrypt']);
            const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, payload);
            return bytesToHttpUrl(new Uint8Array(plain));
        } catch (_) {
            return '';
        }
    }

    async function decodeMainUrl(token, keySeed = '') {
        token = String(token || '').trim();
        if (/^https?:\/\//i.test(token)) return token;

        const data = decodeBase64Loose(token);
        const plainUrl = bytesToHttpUrl(data);
        if (plainUrl || !token.startsWith('qAAB') || !keySeed || !data) return plainUrl;

        const seed = decodeBase64Loose(keySeed);
        if (!seed) return '';
        const firstDigest = new Uint8Array(await crypto.subtle.digest('SHA-512', seed.slice(0, 32)));
        const material = new Uint8Array(await crypto.subtle.digest('SHA-512', concatBytes(firstDigest, QAAB_SALT)));
        const attempts = data[0] === 0xa8 && data[1] === 0 && data[2] === 1 && data[3] === 0
            ? [[data.slice(4), material.slice(0, 16), material.slice(16, 32)],
                [data.slice(4), material.slice(16, 32), material.slice(0, 16)],
                ...(data.length > 36 ? [[data.slice(36), material.slice(0, 16), data.slice(20, 36)],
                    [data.slice(36), material.slice(0, 16), material.slice(16, 32)]] : [])]
            : [[data, material.slice(0, 16), material.slice(16, 32)]];

        for (const [payload, key, iv] of attempts) {
            const url = await decryptAesCbcUrl(payload, key, iv);
            if (url) return url;
        }
        return '';
    }

    Object.defineProperty(window, 'DoubaoVideoCrypto', {
        value: Object.freeze({ decodeMainUrl }),
        configurable: false,
        enumerable: false,
        writable: false
    });
})();
