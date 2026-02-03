import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import translation_en from "./en/translations.json";
import translation_de from "./de/translations.json";

interface Lang {
    code: string;
    name: string;
}

export const SUPPORTED_LANGUAGES: Lang[] = [
    {
        code: "en",
        name: "English",
    },
    {
        code: "de",
        name: "Deutsch",
    },
];

i18n.use(initReactI18next)
    .init({
        interpolation: {
            escapeValue: false,
        },
        resources: {
            en: {
                translation: translation_en,
            },
            de: {
                translation: translation_de,
            },
        },
        lng: navigator.language,
        fallbackLng: "en",
    })
    .catch((e) => {
        console.error("i18n initialization failed:", e);
    });

export default i18n;
