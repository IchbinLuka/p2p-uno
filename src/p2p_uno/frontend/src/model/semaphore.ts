// Thanks to https://medium.com/@artemkhrenov/advanced-concurrency-patterns-in-javascript-semaphore-mutex-read-write-lock-deadlock-prevention-79e8bffb5b81
export class Semaphore {
    private current: number;
    private maxConcurrent: number;
    private queue: (() => void)[];

    constructor(maxConcurrent = 1) {
        this.maxConcurrent = maxConcurrent;
        this.current = 0;
        this.queue = [];
    }

    async acquire() {
        if (this.current < this.maxConcurrent) {
            this.current++;
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            this.queue.push(resolve);
        });
    }

    release() {
        this.current--;

        if (this.queue.length > 0 && this.current < this.maxConcurrent) {
            this.current++;
            const next = this.queue.shift()!;
            next();
        }
    }
}
