import "./Page.css";
import { SUPPORTED_LANGUAGES } from "../../i18n/config";
import { useTranslation } from "react-i18next";
import { Select } from "antd";
import { Link } from "react-router-dom";

const items = SUPPORTED_LANGUAGES.map((lang) => ({
    value: lang.code,
    label: lang.name,
}));

function Page({ children }: { children: React.ReactNode }) {
    const { i18n } = useTranslation();
    function update_lang(v: string) {
        i18n.changeLanguage(v, () => {}).catch((e) => console.error(e));
    }
    return (
        <>
            <header className="header">
                <Link to="/">
                    <h2>P2P Uno</h2>
                </Link>
                <div>
                    <Select
                        // style={{ width: 120 }}
                        options={items}
                        defaultValue={i18n.language}
                        onChange={update_lang}
                    />
                </div>
            </header>
            <div className="content">{children}</div>
        </>
    );
}

export default Page;
