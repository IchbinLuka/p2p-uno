import { useState } from "react";
import "./App.css";
import { API } from "./model/api";
import ServerBrowser from "./ui/pages/ServerBrowser";
import { APIContext } from "./ui/context";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import CreateSession from "./ui/pages/CreateSession";
import GameSession from "./ui/pages/GameSession";
import { ConfigProvider, theme } from "antd";
import { GameVisTest } from "./ui/pages/MainGame";

function App() {
    const [api, _] = useState(new API("http://localhost:8000"));
    return (
        <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
            <APIContext.Provider value={api}>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<ServerBrowser />} />
                        <Route
                            path="/create_session"
                            element={<CreateSession />}
                        />
                        <Route
                            path="/session/:session_id"
                            element={<GameSession />}
                        />
                        <Route path="/card_test" element={<GameVisTest />} />
                    </Routes>
                </BrowserRouter>
            </APIContext.Provider>
        </ConfigProvider>
    );
}

export default App;
