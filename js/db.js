// Reliable offline queue; requires vendor/idb-keyval.mjs
// (loaded before this file in index.html).
//
// Backward compatibility:
// - Keeps the existing queue key: "visit-queue".
// - Keeps queued records in their original event format.
// - Keeps enqueue(), flush(), and readAll() behavior for the current app.
// - Existing pending records from the previous version remain valid.

const queueDB = (() => {
  const store = window.idbKeyval;
  const KEY = "visit-queue";
  const DEFAULT_BATCH_SIZE = 100;

  if (
    !store ||
    typeof store.get !== "function" ||
    typeof store.set !== "function"
  ) {
    throw new Error(
      "The offline queue could not start because IndexedDB is unavailable."
    );
  }

  // All local read-modify-write operations pass through this chain. This stops
  // two quick submissions, or a submission during a flush, from overwriting
  // each other's queue changes.
  let mutationChain = Promise.resolve();
  let activeFlush = null;

  function withMutationLock(task) {
    const run = mutationChain.then(task, task);
    mutationChain = run.catch(() => undefined);
    return run;
  }

  async function readRaw() {
    const value = await store.get(KEY);
    return Array.isArray(value) ? value : [];
  }

  async function writeRaw(items) {
    if (!Array.isArray(items)) {
      throw new TypeError("The visit queue must be an array.");
    }

    await store.set(KEY, items);
  }

  async function readAll() {
    // Wait for any in-progress local mutation before returning a snapshot.
    await mutationChain;
    return readRaw();
  }

  async function count() {
    return (await readAll()).length;
  }

  async function enqueue(item) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      throw new TypeError(
        "A queued visit must be an event object."
      );
    }

    return withMutationLock(async () => {
      const items = await readRaw();

      items.push(item);

      await writeRaw(items);

      return items.length;
    });
  }

  async function enqueueMany(newItems) {
    if (!Array.isArray(newItems)) {
      throw new TypeError(
        "Queued visits must be provided as an array."
      );
    }

    if (!newItems.length) {
      return count();
    }

    for (const item of newItems) {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item)
      ) {
        throw new TypeError(
          "Every queued visit must be an event object."
        );
      }
    }

    return withMutationLock(async () => {
      const items = await readRaw();

      items.push(...newItems);

      await writeRaw(items);

      return items.length;
    });
  }

  function itemIdentity(item) {
    // Current and previous logger versions give every visitor a stable
    // event_id. The JSON fallback protects unusually old or manually-created
    // queue entries without IDs.
    if (
      item &&
      item.event_id != null &&
      String(item.event_id)
    ) {
      return `event:${String(item.event_id)}`;
    }

    try {
      return `legacy:${JSON.stringify(item)}`;
    } catch {
      return "legacy:unserializable";
    }
  }

  function responseConfirmsSingle(response) {
    if (
      !response ||
      response.ok !== true ||
      response.retryable === true
    ) {
      return false;
    }

    // New backend: inserted rows and already-existing duplicates are both
    // confirmed safe, so either result may be removed from the local queue.
    if (Number.isFinite(response.confirmed)) {
      return response.confirmed >= 1;
    }

    if (
      Number.isFinite(response.inserted) ||
      Number.isFinite(response.skipped)
    ) {
      return (
        Number(response.inserted || 0) +
          Number(response.skipped || 0) >=
        1
      );
    }

    // Compatibility with an older sendFn that returned only { ok: true }.
    return true;
  }

  function responseConfirmsBatch(response, expectedCount) {
    if (
      !response ||
      response.ok !== true ||
      response.retryable === true
    ) {
      return false;
    }

    if (Number.isFinite(response.confirmed)) {
      return response.confirmed === expectedCount;
    }

    if (
      Number.isFinite(response.inserted) ||
      Number.isFinite(response.skipped)
    ) {
      return (
        Number(response.inserted || 0) +
          Number(response.skipped || 0) ===
        expectedCount
      );
    }

    // Compatibility for a custom batch sender that returns only { ok: true }.
    return true;
  }

  async function removeConfirmed(confirmedItems) {
    if (!confirmedItems.length) {
      return count();
    }

    // Use occurrence counts instead of a Set so even legacy duplicate records
    // are removed only as many times as the server confirmed them.
    const removals = new Map();

    for (const item of confirmedItems) {
      const identity = itemIdentity(item);

      removals.set(
        identity,
        (removals.get(identity) || 0) + 1
      );
    }

    return withMutationLock(async () => {
      const current = await readRaw();
      const stillPending = [];

      for (const item of current) {
        const identity = itemIdentity(item);
        const remaining = removals.get(identity) || 0;

        if (remaining > 0) {
          removals.set(identity, remaining - 1);
        } else {
          stillPending.push(item);
        }
      }

      await writeRaw(stillPending);

      return stillPending.length;
    });
  }

  async function runSingleFlush(sendFn, onProgress) {
    if (typeof sendFn !== "function") {
      throw new TypeError(
        "flush() requires a send function."
      );
    }

    const snapshot = await readAll();

    if (!snapshot.length) {
      return 0;
    }

    const confirmed = [];

    for (
      let index = 0;
      index < snapshot.length;
      index++
    ) {
      const item = snapshot[index];
      let response = null;

      try {
        response = await sendFn(item);
      } catch {
        // Network and server failures leave the item pending for a later retry.
      }

      if (responseConfirmsSingle(response)) {
        confirmed.push(item);
      }

      if (typeof onProgress === "function") {
        onProgress({
          attempted: index + 1,
          total: snapshot.length,
          confirmed: confirmed.length
        });
      }
    }

    return removeConfirmed(confirmed);
  }

  async function flush(sendFn, options = {}) {
    // Multiple timers and online events can request a flush simultaneously.
    // They share one operation rather than uploading the same queue repeatedly.
    if (activeFlush) {
      return activeFlush;
    }

    activeFlush = runSingleFlush(
      sendFn,
      options.onProgress
    ).finally(() => {
      activeFlush = null;
    });

    return activeFlush;
  }

  async function runBatchFlush(
    sendBatchFn,
    options
  ) {
    if (typeof sendBatchFn !== "function") {
      throw new TypeError(
        "flushBatch() requires a batch send function."
      );
    }

    const snapshot = await readAll();

    if (!snapshot.length) {
      return 0;
    }

    const requestedSize = Number(options.batchSize);

    const batchSize = Number.isFinite(requestedSize)
      ? Math.max(
          1,
          Math.min(
            1000,
            Math.floor(requestedSize)
          )
        )
      : DEFAULT_BATCH_SIZE;

    const confirmed = [];
    let attempted = 0;

    for (
      let start = 0;
      start < snapshot.length;
      start += batchSize
    ) {
      const batch = snapshot.slice(
        start,
        start + batchSize
      );

      let response = null;

      try {
        response = await sendBatchFn(batch);
      } catch {
        // Keep the complete batch pending. The backend de-duplicates by
        // event_id, making a retry safe even if the response was lost after
        // the rows were inserted.
      }

      if (
        responseConfirmsBatch(
          response,
          batch.length
        )
      ) {
        confirmed.push(...batch);
      }

      attempted += batch.length;

      if (
        typeof options.onProgress === "function"
      ) {
        options.onProgress({
          attempted,
          total: snapshot.length,
          confirmed: confirmed.length
        });
      }
    }

    return removeConfirmed(confirmed);
  }

  async function flushBatch(
    sendBatchFn,
    options = {}
  ) {
    if (activeFlush) {
      return activeFlush;
    }

    activeFlush = runBatchFlush(
      sendBatchFn,
      options
    ).finally(() => {
      activeFlush = null;
    });

    return activeFlush;
  }

  return {
    enqueue,
    enqueueMany,
    flush,
    flushBatch,
    readAll,
    count
  };
})();