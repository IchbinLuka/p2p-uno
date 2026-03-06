/**
 * Implementation of an async queue, similar to AsyncQueue from
 * the Python standard library.
 */
export class AsyncQueue<T> {
    private promises: Promise<T>[] = [];
    private resolvers: ((value: T) => void)[] = [];

    constructor() {
        this.promises = [];
        this.resolvers = [];
    }

    /**
     * Adds an item to the queue.
     * @param item The item to add.
     */
    enqueue(item: T) {
        if (this.resolvers.length > 0) {
            const resolve = this.resolvers.shift()!;
            resolve(item);
        } else {
            this.promises.push(Promise.resolve(item));
        }
    }

    /**
     * Removes an item from the queue and returns it. If the queue is empty,
     * waits for the next item to be added before resolving.
     * @returns A promise that resolves to the next item in the queue.
     */
    async dequeue(): Promise<T> {
        if (this.promises.length > 0) {
            return this.promises.shift()!;
        } else {
            return new Promise((resolve) => {
                this.resolvers.push(resolve);
            });
        }
    }
}
