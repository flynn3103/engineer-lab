/* Chapter 0 "When concurrency and async stop helping": the funnel scene.
   Metaphor: parallel app servers pour requests into ONE database, so the narrowest pipe sets the throughput.
   All numbers (250 checkouts/s per server, 1,000/s per primary, 1,800/s demand, 2.4 s p99) are illustrative. */
(function () {
  const W = 640, H = 420, MAX = 3000, DEMAND = 1800;
  const FOOT = 'Illustrative numbers: 250 checkouts/s per app server, 1,000 writes/s per primary.';
  const SRV = Array.from({ length: 8 }, (_, i) => ({ x: 20 + (i % 2) * 78, y: 98 + Math.floor(i / 2) * 30 }));
  const base = { servers: 4, shards: 1, q: 0, used: 0, flow: 0, p99: '', lost: '', hl: -1 };
  const S = o => ({ ...base, ...o });

  const scene = {
    id: 'funnel', label: 'Many servers, one database',
    desc: 'Servers scale the easy part. Every write still goes through one primary, so doubling servers cannot raise what it can take (illustrative numbers).',
    codeLabel: 'Config',
    code: {
      bug: ['# checkout tier at peak (illustrative)', 'app servers: 4   threads per server: 64', 'connections per server to primary: 50', 'postgres: max_connections = 200', 'servers 4 -> 8: open connections still 200', 'new checkout: waits for a free connection'],
      fix: ['# the primary is the limit, so measure it first', 'primary: 200 of 200 connections, 1,000 writes/s', 'writes: shard by key, orders 0-7 to shard A, 8-15 to B, ...', 'each shard: 1,000 writes/s, about 60 connections']
    },
    stage: {
      w: W, h: H, footer: FOOT,
      header: s => ({ left: `${s.servers} app servers · ${s.shards} primar${s.shards > 1 ? 'ies' : 'y'}`, right: s.p99 ? 'p99 ' + s.p99 : '' }),
      setup(kit) {
        const R = { srv: [], slot: [], wait: [], tr: [], db: [] };
        DK.cap(kit, 20, 88, 'app servers', 'sm mut');
        DK.cap(kit, 200, 88, 'connection slots (1 slot = 10)', 'sm mut');
        DK.cap(kit, 440, 88, 'database', 'sm mut');
        SRV.forEach((p, i) => R.srv.push(DK.box(kit, { x: p.x, y: p.y, w: 70, h: 24, label: 'app ' + (i + 1), tone: 'ok', op: 0 })));
        for (let i = 0; i < 20; i++) {
          const x = 202 + (i % 10) * 19, y = 98 + Math.floor(i / 10) * 19;
          R.slot.push(DK.box(kit, { x, y, w: 16, h: 16, r: 4, tone: 'soft' }));
        }
        DK.cap(kit, 202, 156, 'waiting for a slot', 'sm mut');
        for (let i = 0; i < 14; i++) R.wait.push(DK.dot(kit, { x: 210 + i * 13, y: 172, r: 5, tone: 'warn', op: 0 }));
        for (let i = 0; i < 3; i++) R.tr.push(DK.dot(kit, { x: 180, y: 108 + i * 22, r: 6, tone: 'acc2', op: 0 }));
        for (let i = 0; i < 3; i++) R.db.push(DK.box(kit, { x: 444 + i * 62, y: 98, w: 176, h: 64, tone: 'none', label: '', op: 0 }));
        const rows = [['demand', 'acc2'], ['app tier can send', 'acc'], ['database can take', 'warn'], ['checkouts served', 'ok']];
        R.bar = rows.map(([l], i) => { DK.cap(kit, 20, 245 + i * 22, l, 'sm'); return DK.bar(kit, { x: 150, y: 235 + i * 22, w: 340, h: 12 }); });
        return R;
      },
      frame(s, kit, R) {
        const appCap = s.servers * 250, dbCap = s.shards * 1000, served = Math.min(DEMAND, appCap, dbCap);
        SRV.forEach((p, i) => R.srv[i].set({ op: i < s.servers ? 1 : 0, tone: s.lost ? 'bad' : 'ok', sub: '' }));
        R.slot.forEach((b, i) => b.set({ tone: i < s.used ? (s.used >= 20 ? 'bad' : 'ok') : 'soft' }));
        R.wait.forEach((d, i) => d.set({ op: i < s.q ? 1 : 0, tone: s.lost ? 'bad' : 'warn' }));
        R.tr.forEach((d, i) => d.set({ op: s.flow ? 1 : 0, x: s.flow ? 410 + i * 8 : 180, y: 108 + i * 22 }));
        R.db.forEach((d, i) => {
          const on = i < s.shards;
          d.set({ op: on ? 1 : 0, w: s.shards === 1 ? 176 : 54, x: 444 + (s.shards === 1 ? 0 : i * 62), tone: s.q > 0 && s.shards === 1 ? 'bad' : 'ok', label: s.shards === 1 ? 'primary' : 'shard ' + 'ABC'[i], sub: s.shards === 1 ? '1,000 writes/s' : '1,000/s' });
        });
        const fmt = v => v.toLocaleString('en-US') + '/s';
        R.bar[0].set({ f: DEMAND / MAX, tone: 'info', label: fmt(DEMAND) });
        R.bar[1].set({ f: appCap / MAX, tone: 'info', label: fmt(appCap) });
        R.bar[2].set({ f: dbCap / MAX, tone: dbCap < DEMAND ? 'bad' : 'ok', label: fmt(dbCap) });
        R.bar[3].set({ f: served / MAX, tone: served < DEMAND ? 'bad' : 'ok', label: fmt(served) });
      }
    },
    bug: [
      { log: 'Peak traffic is five times last year (illustrative). Four app servers send about 1,000 checkouts per second into one primary that can take 1,000 writes per second.', code: 0, callout: 'Peak: 1,800 checkouts/s wanted', state: S({ servers: 4, used: 14, q: 2, flow: 1 }), stats: [{ l: 'wanted', v: '1,800/s', cls: 'warn' }, { l: 'served', v: '1,000/s', cls: 'warn' }] },
      { log: 'The team buys more app servers: 4 become 8. The CPU work runs in parallel and the app tier can now send 2,000 per second.', code: 4, callout: 'Servers 4 → 8: the app tier doubles', state: S({ servers: 8, used: 20, q: 6, flow: 1 }), stats: [{ l: 'app tier can send', v: '2,000/s', cls: 'ok' }, { l: 'served', v: '1,000/s', cls: 'warn' }] },
      { log: 'Every server writes to the same primary, which allows max_connections = 200. All slots are taken, so new requests queue behind them.', code: 3, callout: 'The primary is the serial part', moment: true, state: S({ servers: 8, used: 20, q: 14, flow: 0, p99: '2.4 s' }), stats: [{ l: 'open connections', v: '200 / 200', cls: 'bad' }, { l: 'p99', v: '2.4 s', cls: 'bad' }] },
      { log: 'Extra servers only add callers waiting for the same resource. Pools are exhausted and some checkouts fail while the app servers still have spare threads.', code: 5, state: S({ servers: 8, used: 20, q: 14, p99: '2.4 s', lost: '12%' }), stats: [{ l: 'failed checkouts', v: '12%', cls: 'bad' }, { l: 'served', v: '1,000/s', cls: 'bad' }],
        takeaway: 'Doubling the servers changed nothing: the narrowest pipe still sets the throughput.' }
    ],
    fix: [
      { log: 'Before buying anything, measure the serial resource. The primary shows 200 of 200 connections and 1,000 writes per second, so it is the limit.', code: 1, callout: 'Measure the narrowest pipe first', state: S({ servers: 8, used: 20, q: 14, p99: '2.4 s' }), stats: [{ l: 'primary', v: '200 / 200', cls: 'bad' }] },
      { log: 'Writes are sharded by key: orders 0–7 go to shard A, 8–15 to shard B, and so on. Each shard takes only its share of the connections.', code: 2, callout: 'Shard the writes by key', state: S({ servers: 8, shards: 3, used: 7, q: 4, flow: 1, p99: '1.1 s' }), stats: [{ l: 'database can take', v: '3,000/s', cls: 'ok' }, { l: 'connections', v: '~60 each', cls: 'ok' }] },
      { log: 'The queue drains. Demand of 1,800 per second now fits under both the app tier and the database, so checkouts are all served.', code: 3, callout: '1,800/s served, queue empty', state: S({ servers: 8, shards: 3, used: 7, q: 0, flow: 1, p99: '0.4 s' }), stats: [{ l: 'served', v: '1,800/s', cls: 'ok' }, { l: 'p99', v: '0.4 s', cls: 'ok' }],
        takeaway: 'Splitting the data removed the serial part. Only then did the extra servers help.' }
    ]
  };

  window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
  window.CHAPTER_OVERRIDES[0] = { scenarios: [scene].concat(window.COURSE.chapters[0].scenarios.slice(1)) };
})();
