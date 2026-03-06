export interface MMServerConfig {
    name: string;
    url: string;
    secure: boolean;
}

export interface Session {
    session_id: string;
    session_name: string;
    player_count: number;
    max_players: number;
}

/**
 * API wrapper for matchmaking server instances.
 */
export class MMServer {
    readonly config: MMServerConfig;

    constructor(config: MMServerConfig) {
        this.config = config;
    }

    /** Returns the WebSocket URL for the server. */
    get wsUrl(): string {
        return `${this.config.secure ? "wss" : "ws"}://${this.config.url}`;
    }

    /** Returns the HTTP URL for the server. */
    get httpUrl(): string {
        return `${this.config.secure ? "https" : "http"}://${this.config.url}`;
    }

    /**
     * Fetches a list of sessions from the server.
     * @param skip Number of sessions to skip.
     * @param limit Number of sessions to return.
     * @returns The list of sessions.
     */
    async fetchSessions(skip: number, limit: number): Promise<Session[]> {
        const response = await fetch(
            `${this.httpUrl}/sessions?skip=${skip}&limit=${limit}`,
        );
        if (response.status != 200) {
            throw new Error(`Failed to fetch sessions: ${response.status}`);
        }
        return (await response.json()) as Session[];
    }

    /**
     * Creates a new session on the server.
     * @param name The name of the session.
     * @param max_players The maximum number of players in the session.
     * @returns The created session.
     */
    async createSession(name: string, max_players: number): Promise<Session> {
        const response = await fetch(`${this.httpUrl}/sessions`, {
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

/**
 * API wrapper that encapsulates access to the MM servers.
 */
export class API {
    /**
     * The MM servers available for use.
     */
    readonly mm_servers: Record<string, MMServer>;

    private constructor(mm_servers: Record<string, MMServer>) {
        this.mm_servers = mm_servers;
    }

    /**
     * Creates a new API instance.
     * @returns The created API instance.
     */
    static async create() {
        let mm_servers: Record<string, MMServer>;
        if (import.meta.env.DEV) {
            mm_servers = {
                dev: new MMServer({
                    name: "Dev Server",
                    url: "localhost:8000",
                    secure: false,
                }),
                dev2: new MMServer({
                    name: "Dev Server 2",
                    url: "localhost:8001",
                    secure: false,
                }),
            };
        } else {
            const response = await fetch("/mm_servers");
            if (response.status != 200) {
                throw new Error(
                    `Failed to fetch MM servers: ${response.status}`,
                );
            }
            const response_parsed = (await response.json()) as Record<
                string,
                MMServerConfig
            >;
            mm_servers = Object.fromEntries(
                Object.entries(response_parsed).map(([key, value]) => [
                    key,
                    new MMServer(value),
                ]),
            );
        }
        return new API(mm_servers);
    }
}
