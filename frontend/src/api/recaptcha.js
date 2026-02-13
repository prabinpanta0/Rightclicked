const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

let loaded = false;

function loadScript() {
    if (loaded || !SITE_KEY) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
        s.async = true;
        s.onload = () => {
            loaded = true;
            resolve();
        };
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

export async function getRecaptchaToken(action) {
    if (!SITE_KEY) return null; // dev mode — no key configured
    await loadScript();
    return new Promise(resolve => {
        window.grecaptcha.ready(() => {
            window.grecaptcha.execute(SITE_KEY, { action }).then(resolve);
        });
    });
}
