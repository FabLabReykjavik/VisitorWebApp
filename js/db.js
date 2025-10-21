// Simple offline queue; requires vendor/idb-keyval.mjs (imported as module in index.html)
const queueDB = (() => {
  const store = window.idbKeyval; // provided by idb-keyval.mjs
  const KEY = "visit-queue";

  async function readAll() { return (await store.get(KEY)) || []; }
  async function writeAll(items) { return store.set(KEY, items); }
  async function enqueue(item) {
    const items = await readAll();
    items.push(item);
    await writeAll(items);
    return items.length;
  }
  async function flush(sendFn) {
    let items = await readAll();
    if (!items.length) return 0;
    const stillPending = [];
    for (const it of items) {
      try {
        const res = await sendFn(it);
        if (!res.ok) stillPending.push(it);
      } catch {
        stillPending.push(it);
      }
    }
    await writeAll(stillPending);
    return stillPending.length;
  }
  return { enqueue, flush, readAll };
})();
