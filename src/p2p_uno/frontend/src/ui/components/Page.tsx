import "./Page.css";
import { SUPPORTED_LANGUAGES } from "../../i18n/config";
import { useTranslation } from "react-i18next";
import { Select } from "antd";
import { Link } from "react-router-dom";
import { usePreserveName } from "../utils";
import { Footer } from "antd/es/layout/layout";
import { ThemeContext, ThemeMode } from "../../context";
import dark_logo from "../../assets/dark_mode.svg";
import light_logo from "../../assets/light_mode.svg";
import { useContext } from "react";

const items = SUPPORTED_LANGUAGES.map((lang) => ({
    value: lang.code,
    label: lang.name,
}));

function Page({
    children,
    hide_footer,
}: {
    children: React.ReactNode;
    hide_footer?: boolean;
}) {
    const { t, i18n } = useTranslation();
    const { theme, toggleTheme } = useContext(ThemeContext);
    const credits_link = usePreserveName("/credits");
    const home = usePreserveName("/");
    function update_lang(v: string) {
        i18n.changeLanguage(v, () => {}).catch((e) => console.error(e));
    }
    return (
        <>
            <header className="header">
                <Link to={home}>
                    <h2>P2P Uno</h2>
                </Link>
                <div style={{ placeContent: "center", display: "flex" }}>
                    <img
                        src={theme === ThemeMode.LIGHT ? dark_logo : light_logo}
                        width={30}
                        height="auto"
                        onClick={toggleTheme}
                        className="themeSwitcher"
                    />
                    <Select
                        options={items}
                        defaultValue={i18n.language}
                        onChange={update_lang}
                    />
                </div>
            </header>
            <div className="content">{children}</div>
            {!hide_footer && (
                <Footer className="footer">
                    <Link to={credits_link}>{t("credits.title")}</Link>
                </Footer>
            )}
        </>
    );
}

export default Page;
