/* eslint-disable @typescript-eslint/no-floating-promises */
import { describe, it, expect } from "vitest";
import { Semaphore } from "../src/model/semaphore";

describe("Semaphore", () => {
    it("should allow immediate access when below maxConcurrent", async () => {
        const semaphore = new Semaphore(1);

        await semaphore.acquire();
        // If we reach here, it didn't block
        expect(true).toBe(true);

        semaphore.release();
    });

    it("should block execution once maxConcurrent is reached", async () => {
        const semaphore = new Semaphore(2);
        let completed = 0;

        // Occupy both slots
        await semaphore.acquire();
        await semaphore.acquire();

        // This third attempt should remain pending
        const thirdAcquire = semaphore.acquire().then(() => {
            completed++;
        });

        // Small delay to ensure the microtask queue processes
        await new Promise((r) => setTimeout(r, 10));
        expect(completed).toBe(0);

        semaphore.release();
        await thirdAcquire; // Now it should resolve
        expect(completed).toBe(1);
    });

    it("should maintain FIFO order for the queue", async () => {
        const semaphore = new Semaphore(1);
        const order: number[] = [];

        await semaphore.acquire(); // Occupy the only slot

        // Queue up three more
        semaphore.acquire().then(() => order.push(1));
        semaphore.acquire().then(() => order.push(2));
        semaphore.acquire().then(() => order.push(3));

        semaphore.release(); // Releases slot for '1'
        await new Promise((r) => setTimeout(r, 0));

        semaphore.release(); // Releases slot for '2'
        await new Promise((r) => setTimeout(r, 0));

        semaphore.release(); // Releases slot for '3'
        await new Promise((r) => setTimeout(r, 0));

        expect(order).toEqual([1, 2, 3]);
    });

    it("should handle multiple releases and acquires correctly", async () => {
        const semaphore = new Semaphore(2);
        let active = 0;

        const task = async () => {
            await semaphore.acquire();
            active++;
            expect(active).toBeLessThanOrEqual(2);

            // Simulate async work
            await new Promise((r) => setTimeout(r, 10));

            active--;
            semaphore.release();
        };

        // Run 5 tasks simultaneously
        await Promise.all([task(), task(), task(), task(), task()]);
        expect(active).toBe(0);
    });
});
