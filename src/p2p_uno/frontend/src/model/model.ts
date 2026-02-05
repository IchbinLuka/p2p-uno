import {
    ConnectionEstablishHandler,
    type ConnectionResult,
    type PlayerStatus,
} from "./ice_messaging";
import { SignManager } from "./signing";
import { ValueNotifier } from "./util";

export class GameRunning {}

export class Waiting {
    private establish_handler: ConnectionEstablishHandler | null = null;
    private _current_players: PlayerStatus[] = [];

    private readonly listeners: Set<(players: PlayerStatus[]) => void> =
        new Set();

    public get current_players(): PlayerStatus[] {
        return this._current_players;
    }

    constructor(
        player_name: string,
        session_id: string,
        sign_manager: SignManager,
        on_game_start: (result: ConnectionResult) => void,
        on_error: (error: Error) => void,
    ) {
        const on_update = (state: PlayerStatus[]) => {
            this._current_players = state;
            // notify all subscribers
            for (const l of Array.from(this.listeners)) {
                try {
                    l(state);
                } catch (err) {
                    // Keep notifying other listeners even if one fails.
                    console.error("listener error", err);
                }
            }
        };
        ConnectionEstablishHandler.create(
            player_name,
            session_id,
            sign_manager,
            on_update,
            on_game_start,
        )
            .then((handler) => (this.establish_handler = handler))
            .catch((e: Error) => on_error(e));
        // this._promise = establish_connections(
        //     player_name,
        //     session_id,
        //     sign_manager,
        //     on_update,
        // )
        //     .then((result) => on_game_start(result))
        //     .catch((error: Error) => on_error(error));
    }

    /**
     * Subscribe to player updates. Returns an unsubscribe function.
     */
    subscribe(listener: (players: PlayerStatus[]) => void): () => void {
        this.listeners.add(listener);
        // Immediately call the listener with current state so subscribers don't need to wait.
        try {
            listener(this._current_players);
        } catch (err) {
            console.error("listener initial call error", err);
        }
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Unsubscribe a previously added listener.
     * Provided for convenience if the caller doesn't want the returned unsubscribe function.
     */
    unsubscribe(listener: (players: PlayerStatus[]) => void): void {
        this.listeners.delete(listener);
    }

    start_session() {
        this.establish_handler?.start_session();
    }
}

export type GamePhase = GameRunning | Waiting;

export class GameModel extends EventTarget {
    public static readonly PHASE_CHANGE: string = "phaseChange";

    private sign_manager: SignManager;

    game_phase: ValueNotifier<GamePhase | null> =
        new ValueNotifier<GamePhase | null>(null);

    private constructor(sign_manager: SignManager) {
        super();
        this.sign_manager = sign_manager;
    }

    static async create() {
        const sign_manager = await SignManager.init();
        return new GameModel(sign_manager);
    }

    join_session(player_name: string, session_id: string) {
        const on_game_start = (_result: ConnectionResult) => {
            this.game_phase.value = new GameRunning();
        };
        const on_error = (error: Error) => {
            console.error(error); // TODO
        };
        this.game_phase.value = new Waiting(
            player_name,
            session_id,
            this.sign_manager,
            on_game_start,
            on_error,
        );
    }
}
