import { useCallback, useContext, useEffect, useRef, useState } from "react";
import LoadingSpinner from "../components/LoadingSpinner";
import { APIContext } from "../context";
import type { Session } from "../../model/api";
import { Link } from "react-router-dom";
import { Button, List } from "antd";
import Page from "../components/Page";

function ServerBrowser() {
    const api = useContext(APIContext)!;
    const [reachedEnd, setReachedEnd] = useState(false);
    const skipRef = useRef(0);
    const PAGE_SIZE = 30;
    const [sessions, setSessions] = useState<Session[] | null>(null);

    const loadMoreSessions = useCallback(() => {
        api.fetchSessions(skipRef.current, PAGE_SIZE)
            .then((data) => {
                // use functional update to avoid closing over `sessions`
                setSessions((prev) => [...(prev || []), ...data]);
                skipRef.current += data.length;
                setReachedEnd(data.length < PAGE_SIZE);
            })
            .catch((error) => console.error(error));
    }, [api]);

    useEffect(() => {
        loadMoreSessions();
    }, [loadMoreSessions]);

    return (
        <Page>
            <div style={{ textAlign: "center", maxWidth: 500 }}>
                <h1 style={{ marginBottom: 60 }}>Open Sessions</h1>
                <div>
                    <Link to="/create_session">
                        <Button type="primary" block>
                            Create new
                        </Button>
                    </Link>
                </div>
                <div>
                    {sessions ? (
                        <>
                            <List
                                style={{ marginBlock: 10 }}
                                bordered
                                dataSource={sessions}
                                renderItem={(item) => (
                                    <List.Item
                                        style={{
                                            minWidth: 400,
                                            padding: 10,
                                        }}
                                    >
                                        <h3 style={{ margin: 0 }}>
                                            {item.session_name}
                                        </h3>
                                        <div
                                            style={{
                                                flexDirection: "row",
                                                display: "flex",
                                                alignItems: "center",
                                            }}
                                        >
                                            <h3
                                                style={{
                                                    marginInline: 10,
                                                    marginBlock: 0,
                                                }}
                                            >
                                                {item.player_count}/
                                                {item.max_players} Players
                                            </h3>
                                            <Link
                                                to={`/session/${item.session_id}`}
                                            >
                                                <Button type="default">
                                                    Join
                                                </Button>
                                            </Link>
                                        </div>
                                    </List.Item>
                                )}
                            />
                            {!reachedEnd && (
                                <Button
                                    color="default"
                                    variant="text"
                                    style={{ marginBottom: 50 }}
                                    onClick={() => loadMoreSessions()}
                                >
                                    Load more
                                </Button>
                            )}
                        </>
                    ) : (
                        <LoadingSpinner />
                    )}
                </div>
            </div>
        </Page>
    );
}

export default ServerBrowser;
