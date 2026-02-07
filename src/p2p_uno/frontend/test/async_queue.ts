import { describe, it, expect } from "vitest";
import { AsyncQueue } from "../src/model/async_queue";

describe("AsyncQueue", () => {
    it("should dequeue items in the order they were enqueued (FIFO)", async () => {
        const queue = new AsyncQueue();
        queue.enqueue("Task 1");
        queue.enqueue("Task 2");

        expect(await queue.dequeue()).toBe("Task 1");
        expect(await queue.dequeue()).toBe("Task 2");
    });

    it("should wait for an item if the queue is empty", async () => {
        const queue = new AsyncQueue();

        // Start the dequeue process before the item exists
        const promise = queue.dequeue();

        // Enqueue an item after a short delay
        setTimeout(() => {
            queue.enqueue("Delayed Task");
        }, 50);

        const result = await promise;
        expect(result).toBe("Delayed Task");
    });

    it("should handle multiple consumers waiting for items", async () => {
        const queue = new AsyncQueue();

        // Multiple consumers start waiting
        const consumer1 = queue.dequeue();
        const consumer2 = queue.dequeue();

        queue.enqueue("First");
        queue.enqueue("Second");

        const results = await Promise.all([consumer1, consumer2]);

        expect(results).toEqual(["First", "Second"]);
    });

    it("should handle rapid enqueue/dequeue cycles", async () => {
        const queue = new AsyncQueue();
        const results = [];

        // Push 10 items
        for (let i = 0; i < 10; i++) {
            queue.enqueue(i);
        }

        // Pull 10 items
        for (let i = 0; i < 10; i++) {
            results.push(await queue.dequeue());
        }

        expect(results).toHaveLength(10);
        expect(results[0]).toBe(0);
        expect(results[9]).toBe(9);
    });
});
