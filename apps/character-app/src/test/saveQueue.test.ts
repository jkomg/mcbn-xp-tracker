import { describe, expect, it, vi } from "vitest"

import { createSaveQueue } from "~/utils/saveQueue"

const deferred = <T,>() => {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

describe("createSaveQueue", () => {
    it("runs a save enqueued while another is in flight", async () => {
        // The regression: the old guard returned early here, and because the
        // debounce timer had already fired, the second edit was never written.
        const enqueue = createSaveQueue<string>()
        const first = deferred<string>()
        const second = vi.fn(async () => "second")

        const firstPromise = enqueue(() => first.promise)
        const secondPromise = enqueue(second)

        expect(second).not.toHaveBeenCalled() // waits its turn
        first.resolve("first")

        await expect(firstPromise).resolves.toBe("first")
        await expect(secondPromise).resolves.toBe("second")
        expect(second).toHaveBeenCalledTimes(1)
    })

    it("preserves order", async () => {
        const enqueue = createSaveQueue<number>()
        const order: number[] = []
        const task = (n: number, delay: number) => async () => {
            await new Promise((r) => setTimeout(r, delay))
            order.push(n)
            return n
        }

        await Promise.all([enqueue(task(1, 20)), enqueue(task(2, 5)), enqueue(task(3, 0))])

        expect(order).toEqual([1, 2, 3])
    })

    it("keeps running later saves after one fails", async () => {
        const enqueue = createSaveQueue<string>()
        const failing = enqueue(() => Promise.reject(new Error("network")))
        const after = enqueue(async () => "still saved")

        await expect(failing).rejects.toThrow("network")
        await expect(after).resolves.toBe("still saved")
    })

    it("surfaces the failure to its own caller", async () => {
        const enqueue = createSaveQueue<string>()
        await expect(enqueue(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom")
    })
})
