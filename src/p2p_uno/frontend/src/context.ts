import React from "react";

export const GameContext = React.createContext(null);

export enum ThemeMode {
    DARK = "dark",
    LIGHT = "light",
}
export const ThemeContext = React.createContext<{
    theme: ThemeMode;
    toggleTheme: () => void;
}>({
    theme: ThemeMode.DARK,
    toggleTheme: () => {},
});
