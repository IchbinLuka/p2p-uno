import { Button, List } from "antd";
import type { Waiting } from "../../model/model";
import Page from "../components/Page";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "../components/PageTitle";

function WaitLobby({
    wait,
    self_name,
    is_host,
}: {
    wait: Waiting;
    self_name: string;
    is_host: boolean;
}) {
    const { t } = useTranslation();
    const players = useSyncExternalStore(
        (onStoreChange) => {
            // subscribe returns an unsubscribe fn; call it to stop listening
            return wait.subscribe(onStoreChange);
        },
        () => wait.current_players, // getSnapshot — synchronous current value
    );

    const start_game = !is_host
        ? undefined
        : () => {
              wait.start_session();
          };

    return (
        <Page>
            <PageTitle>{t("session.waiting")}</PageTitle>
            <List bordered style={{ width: 400, marginBlock: 20 }}>
                <List.Item>
                    <div>{self_name} (You)</div>
                    <div></div>
                </List.Item>
                {players.map((player) => (
                    <List.Item
                        key={player.player_name}
                        style={{ minWidth: 400 }}
                    >
                        <div>{player.player_name}</div>
                        <div>
                            <ConnectionIndicator connected={player.connected} />
                        </div>
                    </List.Item>
                ))}
            </List>

            {is_host && players.length > 0 && (
                <Button onClick={start_game} type="primary">
                    {t("session.start")}
                </Button>
            )}
        </Page>
    );
}

function ConnectionIndicator({ connected }: { connected: boolean }) {
    // Show either "connected"/"connecting" with a colored circle indicator
    const { t } = useTranslation();
    const dot_color = connected
        ? "rgba(102, 255, 51, 190)"
        : "rgba(255, 0, 0, 190)";
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
            }}
        >
            <div
                style={{
                    backgroundColor: dot_color,
                    borderRadius: "50%",
                    width: 10,
                    height: 10,
                    margin: "0 5px",
                }}
            />
            <div>{t(connected ? "status.connected" : "status.connecting")}</div>
        </div>
    );
}

export default WaitLobby;
