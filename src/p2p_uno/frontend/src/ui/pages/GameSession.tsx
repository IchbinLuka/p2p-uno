import { useParams, useSearchParams } from "react-router-dom";
import Page from "../components/Page";
import { useEffect, useRef, useState } from "react";
import { GameModel, Waiting } from "../../model/model";
import WaitLobby from "./WaitLobby";
import { useValueListenable } from "../utils";

function GameSession() {
    const params = useParams();
    const [query_params, _] = useSearchParams();

    const is_host = query_params.get("is_host") === "true";
    const player_name = query_params.get("name")!;

    const [game, set_game] = useState<GameModel | null>(null);
    const [error, set_error] = useState<string | null>(null);

    const createdFor = useRef<string | null>(null);

    useEffect(() => {
        if (params.session_id == null) {
            console.error("Missing session ID");
            return;
        }
        if (createdFor.current === params.session_id) return;
        createdFor.current = params.session_id;

        const create_game = async () => {
            console.log("Creating game...");
            const game = await GameModel.create();
            game.join_session(player_name, params.session_id!);
            set_game(game);
        };
        create_game().catch((error: Error) => {
            set_error(error.message);
            console.error(error);
        });
    }, [params.session_id, is_host, player_name]);

    const phase = useValueListenable(game?.game_phase);

    if (error != null) {
        return (
            <Page>
                <div>
                    <h1>Error</h1>
                    <p>{error}</p>
                </div>
            </Page>
        );
    }
    if (phase instanceof Waiting) {
        return (
            <WaitLobby wait={phase} self_name={player_name} is_host={is_host} />
        );
    }
    return <Page>Loading...</Page>;
}

export default GameSession;
