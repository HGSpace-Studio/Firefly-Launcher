import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhCn from "./lang/zh_cn.json";
import enUs from "./lang/en_us.json";
import koKr from "./lang/ko_kr.json";
import fr from "./lang/fr.json";
import ru from "./lang/ru.json";
import vi from "./lang/vi.json";

const resources = {
  zh_cn: { translation: zhCn },
  en_us: { translation: enUs },
  ko_kr: { translation: koKr },
  fr: { translation: fr },
  ru: { translation: ru },
  vi: { translation: vi },
};

export function getSystemLocale(): string {
  const langs = navigator.languages || [navigator.language];
  for (const lang of langs) {
    const key = lang.toLowerCase().replace("-", "_");
    if (key.startsWith("zh")) return "zh_cn";
    if (key.startsWith("ko")) return "ko_kr";
    if (key.startsWith("fr")) return "fr";
    if (key.startsWith("ru")) return "ru";
    if (key.startsWith("vi")) return "vi";
    if (key.startsWith("en")) return "en_us";
  }
  return "en_us";
}

i18n.use(initReactI18next).init({
  resources,
  lng: getSystemLocale(),
  fallbackLng: "en_us",
  interpolation: { escapeValue: false },
});

export default i18n;