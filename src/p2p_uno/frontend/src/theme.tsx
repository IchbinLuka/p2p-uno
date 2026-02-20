import { useEffect, useState } from "react";
import { ThemeContext, ThemeMode } from "./context";
import { theme } from "antd";

const { useToken } = theme;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState(ThemeMode.DARK);
    const { token } = useToken();

    useEffect(() => {
        const rootStyle = document.body.style;
        switch (theme) {
            case ThemeMode.DARK:
                rootStyle.setProperty(
                    "--background-color",
                    "var(--background-color-dark)",
                );
                rootStyle.setProperty("--color", "var(--color-dark)");
                break;
            case ThemeMode.LIGHT:
                rootStyle.setProperty(
                    "--background-color",
                    "var(--background-color-light)",
                );
                rootStyle.setProperty("--color", "var(--color-light)");
                break;
            default:
                theme satisfies never;
        }
    }, [theme, token.colorBgBase, token.colorTextBase]);

    const toggleTheme = () => {
        setTheme(theme === ThemeMode.DARK ? ThemeMode.LIGHT : ThemeMode.DARK);
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
