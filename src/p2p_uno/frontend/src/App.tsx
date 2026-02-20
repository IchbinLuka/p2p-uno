import { useContext, useEffect, useState } from "react";
import "./App.css";
import { API } from "./model/api";
import ServerBrowser from "./ui/pages/ServerBrowser";
import { APIContext } from "./ui/context";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import CreateSession from "./ui/pages/CreateSession";
import GameSession, { FinishPage } from "./ui/pages/GameSession";
import { ConfigProvider, theme as antdTheme } from "antd";
import { GameVisTest } from "./ui/pages/MainGame";
import Credits from "./ui/pages/Credits";
import { GameFinished } from "./model/model";
import LoadingIndicator from "./ui/components/LoadingIndicator";
import { ThemeContext, ThemeMode } from "./context";

function App() {
    const [api, setApi] = useState<API | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { theme } = useContext(ThemeContext);

    const algorithm =
        theme == ThemeMode.DARK
            ? antdTheme.darkAlgorithm
            : antdTheme.defaultAlgorithm;

    useEffect(() => {
        API.create()
            .then(setApi)
            .catch((error: Error) => setError(error.message));
    }, []);

    if (error != null) {
        return <ConfigProvider theme={{ algorithm }}>Error</ConfigProvider>;
    }
    if (api == null) {
        return (
            <ConfigProvider theme={{ algorithm }}>
                <LoadingIndicator />
            </ConfigProvider>
        );
    }

    return (
        <ConfigProvider theme={{ algorithm }}>
            <APIContext.Provider value={api}>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<ServerBrowser />} />
                        <Route
                            path="/create_session/:mm_server"
                            element={<CreateSession />}
                        />
                        <Route
                            path="/session/:mm_server/:session_id"
                            element={<GameSession />}
                        />
                        <Route path="/card_test" element={<GameVisTest />} />
                        <Route
                            path="/finish"
                            element={
                                <FinishPage
                                    finished={new GameFinished("Bob", false)}
                                />
                            }
                        />
                        <Route path="/credits" element={<Credits />} />
                    </Routes>
                </BrowserRouter>
            </APIContext.Provider>
        </ConfigProvider>
    );
}

export default App;
