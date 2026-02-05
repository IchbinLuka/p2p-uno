import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { APIContext } from "../context";
import type { Session } from "../../model/api";
import { Link } from "react-router-dom";
import { Button, List, Form, Input } from "antd";
import Page from "../components/Page";
import { useTranslation } from "react-i18next";
import PageTitle from "../components/PageTitle";

interface FormProps {
    playerName: string;
}

function ServerBrowser() {
    const { t } = useTranslation();
    const api = useContext(APIContext)!;
    const [reachedEnd, setReachedEnd] = useState(false);
    const skipRef = useRef(0);
    const loadingRef = useRef(false);
    const PAGE_SIZE = 30;
    const [sessions, setSessions] = useState<Session[] | null>(null);
    const [playerName, setPlayerName] = useState<string>("");

    const loadMoreSessions = useCallback(() => {
        // prevent concurrent loads which cause duplicate appends when useEffect runs twice
        if (loadingRef.current || reachedEnd) return;
        loadingRef.current = true;

        const skip = skipRef.current;
        api.fetchSessions(skip, PAGE_SIZE)
            .then((data) => {
                // deduplicate by session_id when merging
                setSessions((prev) => {
                    const existingIds = new Set(
                        (prev || []).map((s) => s.session_id),
                    );
                    const newItems = data.filter(
                        (s) => !existingIds.has(s.session_id),
                    );
                    return [...(prev || []), ...newItems];
                });
                skipRef.current += data.length;
                setReachedEnd(data.length < PAGE_SIZE);
            })
            .catch((error) => console.error(error))
            .finally(() => {
                loadingRef.current = false;
            });
    }, [api, reachedEnd]);

    useEffect(() => {
        loadMoreSessions();
    }, [loadMoreSessions]);

    return (
        <Page>
            <div style={{ textAlign: "center", maxWidth: 600 }}>
                <div>
                    <PageTitle>{t("session.open")}</PageTitle>
                </div>
                {/*<h1 style={{ marginBottom: 60 }}>{t("session.open")}</h1>*/}
                <div style={{ width: 500 }}>
                    <Form
                        layout="inline"
                        name="playerNameForm"
                        initialValues={{ playerName: "" }}
                        onFinish={(values: FormProps) =>
                            setPlayerName(values.playerName)
                        }
                        style={{ justifyContent: "center", marginBottom: 32 }}
                    >
                        <Form.Item<FormProps>
                            name="playerName"
                            style={{ flexGrow: 1 }}
                            rules={[
                                {
                                    required: true,
                                    message: t("player.enter_name"),
                                },
                            ]}
                        >
                            <Input
                                placeholder={t("player.name") ?? "Player name"}
                            />
                        </Form.Item>
                        <Form.Item style={{ marginRight: 0 }}>
                            <Button type="primary" htmlType="submit">
                                {t("confirm") ?? "Confirm"}
                            </Button>
                        </Form.Item>
                    </Form>
                    <Link to={`/create_session?name=${playerName}`}>
                        <Button type="primary" block disabled={!playerName}>
                            {t("session.create")}
                        </Button>
                    </Link>
                </div>
                <div>
                    <>
                        <List
                            style={{ marginBlock: 10 }}
                            bordered
                            loading={sessions == null}
                            dataSource={sessions ?? []}
                            locale={{
                                emptyText:
                                    t("session.no_sessions") ??
                                    "No sessions found",
                            }}
                            renderItem={(item) => (
                                <List.Item
                                    key={item.session_id}
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
                                            {t("session.player_count", {
                                                player_count: `${item.player_count}/${item.max_players}`,
                                            })}
                                        </h3>
                                        <Link
                                            to={`/session/${item.session_id}?name=${playerName}`}
                                        >
                                            <Button
                                                type="default"
                                                disabled={!playerName}
                                            >
                                                {t("session.join")}
                                            </Button>
                                        </Link>
                                    </div>
                                </List.Item>
                            )}
                        />
                        {!reachedEnd && sessions != null && (
                            <Button
                                color="default"
                                variant="text"
                                style={{ marginBottom: 50 }}
                                onClick={() => loadMoreSessions()}
                            >
                                {t("session.load_more")}
                            </Button>
                        )}
                    </>
                </div>
            </div>
        </Page>
    );
}

export default ServerBrowser;
