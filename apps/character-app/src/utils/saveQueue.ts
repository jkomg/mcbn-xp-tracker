/**
 * Serialises async saves so none are silently dropped.
 *
 * The character autosave used to guard with an "in flight" boolean and bail out
 * when a save was already running. The debounce timer had already fired by
 * then, so nothing rescheduled the skipped write and that edit was simply never
 * persisted — the creation-XP baseline went missing this way, since it is set
 * on entering the Starting XP step, exactly when other edits are in flight.
 *
 * Queueing instead of skipping means every enqueued save runs, in order, and a
 * failed save does not poison the ones behind it.
 */
export function createSaveQueue<T>() {
    let chain: Promise<unknown> = Promise.resolve()

    return function enqueue(task: () => Promise<T>): Promise<T> {
        const next = chain.catch(() => undefined).then(task)
        // Swallow on the chain itself so one rejection doesn't cascade; the
        // caller still sees it through the promise returned here.
        chain = next.then(
            () => undefined,
            () => undefined,
        )
        return next
    }
}
