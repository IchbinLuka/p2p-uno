// Thanks to https://medium.com/@artemkhrenov/advanced-concurrency-patterns-in-javascript-semaphore-mutex-read-write-lock-deadlock-prevention-79e8bffb5b81
/**
 * Implementation of a simple Semaphore using js promises.
 */
export class Semaphore {
    private current: number;
    private maxConcurrent: number;
    private queue: (() => void)[];

    constructor(maxConcurrent = 1) {
        this.maxConcurrent = maxConcurrent;
        this.current = 0;
        this.queue = [];
    }

    /**
     * Acquires a semaphore slot, waiting if necessary.
     * @returns A promise that resolves when the semaphore is acquired.
     */
    async acquire() {
        if (this.current < this.maxConcurrent) {
            this.current++;
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            this.queue.push(resolve);
        });
    }

    /**
     * Releases a semaphore slot, waking up a waiting acquire if necessary.
     */
    release() {
        this.current--;

        if (this.queue.length > 0 && this.current < this.maxConcurrent) {
            this.current++;
            const next = this.queue.shift()!;
            next();
        }
    }

    /**
     * Helper method to execute a function with the semaphore acquired.
     * @param fn The function to execute.
     * @returns The result of the function.
     */
    async with<T>(fn: () => T): Promise<T> {
        await this.acquire();
        try {
            return fn();
        } finally {
            this.release();
        }
    }
}
