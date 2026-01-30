import { establish_connections } from "./ice_messaging";
import { SignManager } from "./signing";

export class GameModel {
    private sign_manager: SignManager;

    private constructor(sign_manager: SignManager) {
        this.sign_manager = sign_manager;
    }

    static async create() {
        const sign_manager = await SignManager.init();
        return new GameModel(sign_manager);
    }

    async join_session(player_name: string, session_id: string) {
        return await establish_connections(
            player_name,
            session_id,
            this.sign_manager,
        );
    }
}
