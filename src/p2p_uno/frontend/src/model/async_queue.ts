export class AsyncQueue<T> {
    private promises: Promise<T>[] = [];
    private resolvers: ((value: T) => void)[] = [];

    constructor() {
        this.promises = [];
        this.resolvers = [];
    }

    // Equivalent to python's queue.put()
    enqueue(item: T) {
        if (this.resolvers.length > 0) {
            const resolve = this.resolvers.shift()!;
            resolve(item);
        } else {
            this.promises.push(Promise.resolve(item));
        }
    }

    // Equivalent to python's await queue.get()
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
