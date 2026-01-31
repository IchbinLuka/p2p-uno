import { useId, useState, type SubmitEvent } from "react";
import "./App.css";
import { create_session } from "./model/ice_messaging";
import { GameModel } from "./model/model";

function App() {
    const join_button = useId();
    const [_, set_state] = useState<GameModel | null>(null);

    function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        const form = e.target;
        const create_new_checkbox = form.elements.namedItem(
            "create_new",
        ) as HTMLInputElement;
        const create_new = create_new_checkbox.checked;

        const session_input = form.elements.namedItem(
            "session_id",
        ) as HTMLInputElement;
        let session_id = session_input.value;

        const player_input = form.elements.namedItem(
            "player_name",
        ) as HTMLInputElement;
        const player_name = player_input.value;

        void (async () => {
            if (create_new) {
                session_id = await create_session();
            }
            const model = await GameModel.create();

            set_state(model);

            console.debug("Connecting to session");
            const info = await model.join_session(player_name, session_id);
            console.debug(`Connected: ${JSON.stringify(info)}`);
        })();
    }

    return (
        <>
            <form onSubmit={handleSubmit}>
                <div>
                    <label>
                        Session id:
                        <input name="session_id"></input>
                    </label>
                </div>
                <div>
                    <label>
                        Player name:
                        <input name="player_name"></input>
                    </label>
                </div>
                <div>
                    <button id={join_button}>Create/Join Session</button>
                </div>
                <div>
                    <label>
                        Create new:{" "}
                        <input name="create_new" type="checkbox"></input>
                    </label>
                </div>
            </form>
        </>
    );
}

export default App;
