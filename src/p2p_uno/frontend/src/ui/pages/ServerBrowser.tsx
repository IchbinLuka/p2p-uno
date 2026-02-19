import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { APIContext } from "../context";
import type { Session } from "../../model/api";
import { Link, useSearchParams } from "react-router-dom";
import { Button, List, Form, Input, Radio, type RadioChangeEvent } from "antd";
import Page from "../components/Page";
import { useTranslation } from "react-i18next";
import PageTitle from "../components/PageTitle";

interface FormProps {
    playerName: string;
}

function ServerBrowser() {
    const { t } = useTranslation();
    const api = useContext(APIContext)!;
    const [server, setServer] = useState(Object.keys(api.mm_servers)[0]);
    const [serverErrors, setServerErrors] = useState<
        Record<string, string | undefined>
    >({});
    const [reachedEnd, setReachedEnd] = useState(false);
    const skipRef = useRef(0);
    const loadingRef = useRef(false);
    const PAGE_SIZE = 30;
    const [sessions, setSessions] = useState<Session[] | null>(null);
    const [queryParams] = useSearchParams();

    const [playerName, setPlayerName] = useState<string>(
        queryParams.get("name") ?? "",
    );

    function onServerChange(e: RadioChangeEvent | string) {
        console.log("onServerChange");
        skipRef.current = 0;
        setServer(typeof e === "string" ? e : (e.target.value! as string));
        setSessions(null);
        setReachedEnd(false);
        // loadMoreSessions();
    }

    const loadMoreSessions = useCallback(() => {
        // prevent concurrent loads which cause duplicate appends when useEffect runs twice
        if (loadingRef.current || reachedEnd) {
            console.log("loadMoreSessions: already loading or reached end");
            return;
        }
        loadingRef.current = true;

        const skip = skipRef.current;
        api.mm_servers[server]
            .fetchSessions(skip, PAGE_SIZE)
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
            .catch((error: Error) => {
                // Switch to next server if current one fails
                setServerErrors((prev) => ({
                    ...prev,
                    [server]: error.message,
                }));
                const keys = Object.keys(api.mm_servers);
                const currentIdx = keys.indexOf(server);
                let nextServer = null;
                for (
                    let i = currentIdx + 1;
                    i < keys.length + currentIdx;
                    i++
                ) {
                    if (!(keys[i % keys.length] in serverErrors)) {
                        nextServer = keys[i % keys.length];
                        break;
                    }
                }
                if (nextServer) {
                    onServerChange(nextServer);
                } else {
                    setSessions([]);
                    setReachedEnd(true);
                }
            })
            .finally(() => {
                loadingRef.current = false;
            });
    }, [server, reachedEnd, api.mm_servers, serverErrors]);

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
                        initialValues={{ playerName }}
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
                    <Link to={`/create_session/${server}?name=${playerName}`}>
                        <Button type="primary" block disabled={!playerName}>
                            {t("session.create")}
                        </Button>
                    </Link>
                </div>
                <div style={{ marginBlock: 10 }}>
                    <Radio.Group
                        buttonStyle="solid"
                        defaultValue={server}
                        onChange={onServerChange}
                        value={server}
                    >
                        {Object.entries(api.mm_servers).map(([key, server]) => (
                            <Radio.Button
                                key={key}
                                value={key}
                                disabled={key in serverErrors}
                            >
                                {server.config.name}
                            </Radio.Button>
                        ))}
                    </Radio.Group>
                    <List
                        style={{ marginBlock: 3 }}
                        bordered
                        loading={sessions == null}
                        dataSource={sessions ?? []}
                        locale={{
                            emptyText:
                                serverErrors[server] == null
                                    ? t("session.no_sessions")
                                    : t(
                                          "session.no_matchmaking_server_available",
                                      ),
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
                                        to={`/session/${server}/${item.session_id}?name=${playerName}`}
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
                </div>
            </div>
        </Page>
    );
}

export default ServerBrowser;
