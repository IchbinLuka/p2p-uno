export abstract class PlayerError {
    player: string;

    constructor(player: string) {
        this.player = player;
    }
}

export class InvalidAction extends PlayerError {
    message: string;

    constructor(message: string, player: string) {
        super(player);
        this.message = message;
    }

    toString(): string {
        return `Invalid Action: ${this.message}`;
    }
}

export class InvalidSignature extends PlayerError {}
