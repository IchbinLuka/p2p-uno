import { useParams, useSearchParams } from "react-router-dom";
import Page from "../components/Page";

function GameSession() {
    const params = useParams();
    const [query_params, _] = useSearchParams();

    const is_host = query_params.get("is_host") === "true";

    return (
        <Page>
            <div>
                <h1>Game Session</h1>
                <p>Session ID: {params.session_id}</p>
                <p>Is Host: {is_host ? "Yes" : "No"}</p>
            </div>
        </Page>
    );
}

export default GameSession;
