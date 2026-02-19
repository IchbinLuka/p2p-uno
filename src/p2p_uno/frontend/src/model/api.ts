/*
class SessionRepr(pydantic.BaseModel):
    session_id: str
    session_name: str
    player_count: int
    max_players: int

*/

export interface Session {
    session_id: string;
    session_name: string;
    player_count: number;
    max_players: number;
}

export class API {
    readonly hostname: Promise<string>;
    constructor() {
        if (import.meta.env.DEV) {
            this.hostname = Promise.resolve("http://localhost:8000");
        } else {
            this.hostname = window
                .fetch("/mm_server")
                .then((r) => r.json())
                .then((j) => (j as { mm_server_url: string }).mm_server_url);
        }
    }

    async fetchSessions(skip: number, limit: number): Promise<Session[]> {
        const response = await fetch(
            `${await this.hostname}/sessions?skip=${skip}&limit=${limit}`,
        );
        if (response.status != 200) {
            throw new Error(`Failed to fetch sessions: ${response.status}`);
        }
        return (await response.json()) as Session[];
    }

    async createSession(name: string, max_players: number): Promise<Session> {
        const response = await fetch(`${await this.hostname}/sessions`, {
            method: "POST",
            body: JSON.stringify({ session_name: name, max_players }),
            headers: {
                "Content-Type": "application/json",
            },
        });
        if (response.status != 200) {
            throw new Error(`Failed to create session: ${response.status}`);
        }
        return (await response.json()) as Session;
    }
}
