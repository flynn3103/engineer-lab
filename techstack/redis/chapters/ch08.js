/* Chapter 8 "Sentinel Failover": three scenes and the Explain text (index 8, zero-based).
   Loads after course.js; course.html merges CHAPTER_OVERRIDES into the course. Problem, predict, diagnose and source come from the course.
   Scene 1: SDOWN, ODOWN, leader election and promotion. Scene 2: a partitioned primary keeps accepting writes that are dropped after the heal.
   Scene 3: a client with a fixed address against one that asks Sentinel. Addresses, offsets and counts are illustrative. */
window.CHAPTER_OVERRIDES = window.CHAPTER_OVERRIDES || {};
(function () {
  const W = 640, H = 420;

  /* ---- 1. Agreement, not a single opinion, decides a failover ---- */
  const FOOT_FO = 'Simplified: three Sentinels, quorum 2. Addresses and offsets illustrative.';
  const failover = {
    id: 'sdown-odown', label: 'From SDOWN to a new primary', desc: 'One Sentinel that cannot reach the primary only suspects it. A quorum makes it ODOWN, a majority elects a leader, and the leader promotes the best replica.',
    codeLabel: 'Sentinel log',
    code: { bug: [
      'sentinel monitor mymaster 10.0.1.5 6379 2        # quorum 2',
      '+sdown master mymaster 10.0.1.5 6379',
      '+odown master mymaster 10.0.1.5 6379 #quorum 2/2',
      '+try-failover master mymaster 10.0.1.5 6379',
      '+elected-leader master mymaster 10.0.1.5 6379',
      '+selected-slave slave 10.0.1.6:6379     # priority, then offset, then run ID',
      '+switch-master mymaster 10.0.1.5 6379 10.0.1.6 6379',
    ] },
    scene: { w: W, h: H, footer: FOOT_FO, panels: [
      { id: 'sn', x: 16, y: 58, w: 270, h: 290, title: 'Sentinels', tone: 'info' },
      { id: 'dt', x: 300, y: 58, w: 324, h: 290, title: 'Data nodes', tone: 'info' },
    ], tokens: {
      s1: { label: 'Sentinel 1', sub: 'sees primary', tone: 'ok', w: 140 },
      s1d: { label: 'Sentinel 1', sub: 'SDOWN: no PONG', tone: 'warn', w: 140 },
      s1l: { label: 'Sentinel 1', sub: 'leader, epoch 5', tone: 'live', w: 140 },
      s2: { label: 'Sentinel 2', sub: 'sees primary', tone: 'ok', w: 140 },
      s2d: { label: 'Sentinel 2', sub: 'SDOWN: no PONG', tone: 'warn', w: 140 },
      s2v: { label: 'Sentinel 2', sub: 'votes for 1', tone: 'live', w: 140 },
      s3: { label: 'Sentinel 3', sub: 'sees primary', tone: 'ok', w: 140 },
      s3v: { label: 'Sentinel 3', sub: 'voted for 1', tone: 'live', w: 140 },
      pm: { label: 'primary', sub: '10.0.1.5', tone: 'ok', w: 130 },
      pmx: { label: 'primary', sub: '10.0.1.5 down', tone: 'warn', w: 130 },
      r1: { label: 'replica A', sub: 'prio 100, off 9,000', tone: 'info', w: 150 },
      r2: { label: 'replica B', sub: 'prio 100, off 8,800', tone: 'info', w: 150 },
      r1w: { label: 'replica A', sub: 'chosen: best offset', tone: 'live', w: 150 },
      np: { label: 'new primary', sub: '10.0.1.6, epoch 5', tone: 'ok', w: 150 },
      r2f: { label: 'replica B', sub: 'follows 10.0.1.6', tone: 'info', w: 150 },
    } },
    bug: [
      { log: 'Three Sentinels watch one primary and two replicas. Each Sentinel pings the primary and the replicas. The quorum configured is 2.', callout: 'Three Sentinels, quorum 2', code: 0,
        at: { s1: { x: 36, y: 110 }, s2: { x: 36, y: 180 }, s3: { x: 36, y: 250 }, pm: { x: 320, y: 110 }, r1: { x: 320, y: 180 }, r2: { x: 320, y: 250 } }, stats: [{ l: 'sentinels', v: '3' }, { l: 'quorum', v: '2' }] },
      { log: 'Sentinel 1 gets no reply from the primary for down-after-milliseconds. It marks the primary SDOWN, subjectively down. That is only its own opinion.', callout: 'SDOWN: one Sentinel suspects', code: 1,
        at: { s1d: { x: 36, y: 110 }, s2: { x: 36, y: 180 }, s3: { x: 36, y: 250 }, pmx: { x: 320, y: 110 }, r1: { x: 320, y: 180 }, r2: { x: 320, y: 250 } }, stats: [{ l: 'agree it is down', v: '1 of 2', cls: 'warn' }] },
      { log: 'Sentinel 2 also gets no reply. Two Sentinels now agree, which meets the quorum, so the primary is ODOWN, objectively down. A failover may start.', callout: 'ODOWN: the quorum agrees', moment: true, code: 2,
        at: { s1d: { x: 36, y: 110 }, s2d: { x: 36, y: 180 }, s3: { x: 36, y: 250 }, pmx: { x: 320, y: 110 }, r1: { x: 320, y: 180 }, r2: { x: 320, y: 250 } }, stats: [{ l: 'agree it is down', v: '2 of 2', cls: 'bad' }] },
      { log: 'The Sentinels elect a leader for this failover epoch. The leader needs a majority of all known Sentinels, two of three here, not just the quorum. Sentinel 1 wins.', callout: 'A majority elects one leader', code: 4,
        at: { s1l: { x: 36, y: 110 }, s2v: { x: 36, y: 180 }, s3v: { x: 36, y: 250 }, pmx: { x: 320, y: 110 }, r1: { x: 320, y: 180 }, r2: { x: 320, y: 250 } }, stats: [{ l: 'votes', v: '3 of 3', cls: 'ok' }, { l: 'epoch', v: '5' }] },
      { log: 'The leader picks a replica: lowest replica-priority first, then the largest replication offset, then the run ID. Replica A has the larger offset, so it is chosen.', callout: 'Best replica: priority, offset, run ID', code: 5,
        at: { s1l: { x: 36, y: 110 }, pmx: { x: 320, y: 110 }, r1w: { x: 320, y: 180 }, r2: { x: 320, y: 250 } }, arrows: [['s1l', 'r1w', 'select']], stats: [{ l: 'offset A', v: '9,000', cls: 'ok' }, { l: 'offset B', v: '8,800' }] },
      { log: 'The leader sends REPLICAOF NO ONE to replica A. It becomes the new primary and the config epoch makes the new configuration win. Replica B is told to follow it.', callout: 'Promoted: the new configuration wins', code: 6,
        at: { s1l: { x: 36, y: 110 }, np: { x: 320, y: 110 }, r2f: { x: 320, y: 180 } }, arrows: [['s1l', 'np', 'promote']], stats: [{ l: 'new primary', v: '10.0.1.6', cls: 'ok' }, { l: 'config epoch', v: '5' }],
        takeaway: 'No single Sentinel decides alone: a quorum marks ODOWN, a majority elects the leader, the epoch orders configurations.' },
    ],
  };

  /* ---- 2. Writes accepted by an isolated primary are discarded after the heal ---- */
  const FOOT_SPLIT = 'Simplified: one primary, one replica, three Sentinels. Counts illustrative.';
  const split = {
    id: 'lost-writes', label: 'Writes on the old primary', desc: 'A partition cuts the primary off together with one client. It keeps accepting writes while the Sentinels promote a replica. After the heal those writes are discarded.',
    codeLabel: 'Log and config',
    code: { bug: [
      'SET order:9 paid            # to the isolated primary -> OK',
      '+sdown ... +odown ... +switch-master mymaster 10.0.1.5 6379 10.0.1.6 6379',
      '# partition heals: the old primary becomes a replica of 10.0.1.6',
      '# full resync from the new primary: its own writes are dropped',
      'min-replicas-to-write 1',
      'min-replicas-max-lag 10     # illustrative seconds',
    ] },
    scene: { w: W, h: H, footer: FOOT_SPLIT, panels: [
      { id: 'iso', x: 16, y: 58, w: 250, h: 290, title: 'Isolated side', tone: 'info' },
      { id: 'maj', x: 290, y: 58, w: 334, h: 290, title: 'Sentinels and replica', tone: 'info' },
    ], tokens: {
      cl: { label: 'client X', sub: 'SET order:9 paid', tone: 'cursor', w: 150 },
      op: { label: 'old primary', sub: '10.0.1.5, accepts', tone: 'warn', w: 150 },
      op2: { label: 'old primary', sub: 'holds order:9 alone', tone: 'warn', w: 170 },
      rp: { label: 'replica', sub: '10.0.1.6', tone: 'info', w: 150 },
      np: { label: 'new primary', sub: '10.0.1.6, no order:9', tone: 'ok', w: 170 },
      sn: { label: 'Sentinels', sub: 'SDOWN, ODOWN', tone: 'info', w: 150 },
      sn2: { label: 'Sentinels', sub: 'switch-master', tone: 'live', w: 150 },
      oprep: { label: 'old primary', sub: 'now a replica', tone: 'info', w: 170 },
      gone: { label: 'order:9 dropped', sub: 'full resync', tone: 'delete', w: 170 },
      refuse: { label: 'NOREPLICAS', sub: 'write refused', tone: 'ok', w: 170 },
      retry: { label: 'client retries', sub: 'on 10.0.1.6', tone: 'ok', w: 170 },
    } },
    bug: [
      { log: 'A network partition cuts the primary off from its replica and the Sentinels, together with client X. Nothing tells the primary that it is alone.', callout: 'The primary is cut off with one client', code: 0,
        at: { cl: { x: 36, y: 150 }, op: { x: 36, y: 220 }, rp: { x: 330, y: 150 }, sn: { x: 330, y: 220 } }, stats: [{ l: 'partition', v: 'primary + client X' }] },
      { log: 'Client X keeps writing and the old primary keeps answering OK. These writes exist only on the old primary.', callout: 'The isolated primary still says OK', moment: true, code: 0,
        at: { cl: { x: 36, y: 150 }, op2: { x: 36, y: 220 }, rp: { x: 330, y: 150 }, sn: { x: 330, y: 220 } }, arrows: [['cl', 'op2', 'SET, OK']], stats: [{ l: 'writes accepted alone', v: 'about 28 s', cls: 'bad' }] },
      { log: 'On the other side the Sentinels mark the old primary SDOWN, then ODOWN, and promote the replica. Traffic that can reach the new primary recovers within seconds.', callout: 'The Sentinels promote the replica', code: 1,
        at: { cl: { x: 36, y: 150 }, op2: { x: 36, y: 220 }, np: { x: 330, y: 150 }, sn2: { x: 330, y: 220 } }, stats: [{ l: 'new primary', v: '10.0.1.6', cls: 'ok' }, { l: 'writes on old node only', v: 'a few hundred', cls: 'bad' }] },
      { log: 'The partition heals. The Sentinels reconfigure the old primary as a replica of the new one.', callout: 'The old primary is demoted', code: 2,
        at: { oprep: { x: 36, y: 220 }, np: { x: 330, y: 150 }, sn2: { x: 330, y: 220 } }, arrows: [['np', 'oprep', 'REPLICAOF']], stats: [{ l: 'old primary role', v: 'replica', cls: 'warn' }] },
      { log: 'Redis does not merge histories. The demoted node does a full resync and throws away what it accepted alone, so orders that customers saw confirmed no longer exist.', callout: 'Its own writes are dropped', moment: true, code: 3,
        at: { gone: { x: 36, y: 220 }, np: { x: 330, y: 150 }, sn2: { x: 330, y: 220 } }, arrows: [['np', 'gone', 'full sync']], stats: [{ l: 'writes lost', v: 'a few hundred', cls: 'bad' }] },
      { log: 'The fix bounds the window. With min-replicas-to-write 1 and min-replicas-max-lag 10, a primary that loses its replicas refuses writes after the lag window with NOREPLICAS.', callout: 'min-replicas-to-write closes the window', code: 4,
        at: { cl: { x: 36, y: 150 }, refuse: { x: 36, y: 220 }, np: { x: 330, y: 150 }, retry: { x: 330, y: 220 } }, arrows: [['cl', 'refuse', 'SET']], stats: [{ l: 'min-replicas-to-write', v: '1', cls: 'ok' }, { l: 'silent loss', v: 'none', cls: 'ok' }],
        takeaway: 'Failover rides on async replication. Bound the lost-write window with min-replicas-to-write.' },
    ],
  };

  /* ---- 3. Clients must ask Sentinel where the primary is ---- */
  const FOOT_DISC = 'Simplified: one client, one Sentinel, two nodes. Addresses illustrative.';
  const discover = {
    id: 'ask-sentinel', label: 'Fixed IP vs Sentinel', desc: 'After a failover the old address is a read-only replica. A client with a hard-coded address keeps failing, and a client that asks Sentinel follows the new primary.',
    codeLabel: 'Commands',
    code: { bug: [
      '10.0.1.5:6379> SET order:9 paid      # address from a config file',
      "(error) READONLY You can't write against a read only replica.",
      '# the client never asks Sentinel',
      'SENTINEL get-master-addr-by-name mymaster',
      '1) "10.0.1.6"   2) "6379"            # the current primary',
      'SET order:9 paid -> OK on 10.0.1.6',
    ] },
    scene: { w: W, h: H, footer: FOOT_DISC, panels: [
      { id: 'cl', x: 16, y: 58, w: 190, h: 290, title: 'Client', tone: 'info' },
      { id: 'sn', x: 220, y: 58, w: 190, h: 290, title: 'Sentinel', tone: 'info' },
      { id: 'dt', x: 424, y: 58, w: 200, h: 290, title: 'Data nodes', tone: 'info' },
    ], tokens: {
      fx: { label: 'client', sub: 'fixed 10.0.1.5', tone: 'cursor', w: 140 },
      sk: { label: 'client', sub: 'asks Sentinel', tone: 'cursor', w: 140 },
      op: { label: '10.0.1.5', sub: 'now a replica', tone: 'warn', w: 150 },
      np: { label: '10.0.1.6', sub: 'primary', tone: 'ok', w: 150 },
      ro: { label: 'READONLY', sub: 'write refused', tone: 'warn', w: 150 },
      sn: { label: 'Sentinel', sub: 'knows the primary', tone: 'info', w: 150 },
      ans: { label: '10.0.1.6:6379', sub: 'current primary', tone: 'live', w: 150 },
      okw: { label: 'SET -> OK', sub: 'on 10.0.1.6', tone: 'ok', w: 150 },
    } },
    bug: [
      { log: 'The failover is done. 10.0.1.6 is the primary, and the old address 10.0.1.5 is now a read-only replica.', callout: 'The primary moved to 10.0.1.6', code: 0,
        at: { fx: { x: 36, y: 130 }, op: { x: 444, y: 130 }, np: { x: 444, y: 220 }, sn: { x: 240, y: 175 } }, stats: [{ l: 'primary', v: '10.0.1.6', cls: 'ok' }] },
      { log: 'The client has the old address in its configuration and sends SET there. The node is a replica, so it refuses the write.', callout: 'The fixed address now points at a replica', moment: true, code: 1,
        at: { fx: { x: 36, y: 130 }, op: { x: 444, y: 130 }, np: { x: 444, y: 220 }, sn: { x: 240, y: 175 }, ro: { x: 240, y: 250 } }, arrows: [['fx', 'op', 'SET', 'bad']], stats: [{ l: 'error', v: 'READONLY', cls: 'bad' }] },
      { log: 'The client never asks Sentinel where the primary is, so every write keeps failing until someone restarts the client with the new address.', callout: 'Writes fail until someone intervenes', code: 2,
        at: { fx: { x: 36, y: 130 }, op: { x: 444, y: 130 }, np: { x: 444, y: 220 }, sn: { x: 240, y: 175 }, ro: { x: 240, y: 250 } }, stats: [{ l: 'writes', v: 'failing', cls: 'bad' }] },
      { log: 'A Sentinel-aware client asks on connect, and again after errors: SENTINEL get-master-addr-by-name mymaster.', callout: 'A Sentinel-aware client asks first', code: 3,
        at: { sk: { x: 36, y: 130 }, sn: { x: 240, y: 130 }, op: { x: 444, y: 130 }, np: { x: 444, y: 220 } }, arrows: [['sk', 'sn', 'ask']], stats: [{ l: 'asks', v: 'SENTINEL get-master-addr-by-name' }] },
      { log: 'Sentinel answers with the current primary, 10.0.1.6 on port 6379.', callout: 'Sentinel names the current primary', code: 4,
        at: { sk: { x: 36, y: 130 }, sn: { x: 240, y: 130 }, ans: { x: 240, y: 210 }, op: { x: 444, y: 130 }, np: { x: 444, y: 220 } }, arrows: [['sn', 'ans', 'answer']], stats: [{ l: 'primary', v: '10.0.1.6', cls: 'ok' }] },
      { log: 'The client writes to the address Sentinel gave it. After the next failover it asks again and follows the new primary.', callout: 'Writes go to the right node',
        at: { sk: { x: 36, y: 130 }, op: { x: 444, y: 130 }, np: { x: 444, y: 220 }, okw: { x: 240, y: 220 } }, arrows: [['sk', 'np', 'SET']], stats: [{ l: 'writes accepted', v: '100%', cls: 'ok' }],
        takeaway: 'Never hard-code the primary address. Use a Sentinel-aware client, or a proxy that follows the failover.' },
    ],
  };

  window.CHAPTER_OVERRIDES[8] = {
    explain: `<h3>1. A single primary is a single point of failure</h3>
<p>One primary with replicas gives copies of the data, but nothing that decides when to replace a dead primary. Promoting a replica by hand is slow, and promoting one by mistake is worse, because two nodes then both think they are the primary and the data splits in two. Sentinel is a set of separate processes that watch the primary, agree that it is down and promote a replica. The rule that keeps it safe is agreement: no single Sentinel decides alone.</p>

<h3>2. SDOWN and ODOWN</h3>
<p>Each Sentinel pings the primary, its replicas and the other Sentinels. A Sentinel that gets no valid reply from the primary for <code>down-after-milliseconds</code> marks it <b>SDOWN</b>, subjectively down. That is one opinion. When at least <code>quorum</code> Sentinels agree, the primary becomes <b>ODOWN</b>, objectively down, and a failover may begin. The quorum only decides when the failure is detected.</p>

<h3>3. Electing a leader and promoting a replica</h3>
<p>The Sentinels elect a leader for that failover, identified by an epoch. The leader needs votes from a <b>majority of all known Sentinels</b>, not just the quorum, and if too few Sentinels can talk to each other no failover happens. The leader picks a replica by <code>replica-priority</code> (a lower number first), then by the larger replication offset, then by the run ID. It sends <code>REPLICAOF NO ONE</code> to that replica and tells the others to follow it. The <b>config epoch</b> makes the newest configuration win, so a Sentinel that was behind accepts the new primary.</p>

<h3>4. Clients ask Sentinel</h3>
<p>The address of the primary changes. A client library that supports Sentinel connects to the Sentinels, asks <code>SENTINEL get-master-addr-by-name</code> for the current primary, and asks again after connection errors or <code>READONLY</code> replies. A client with a fixed address will write to a demoted node and fail until someone changes its configuration.</p>

<h3>5. Two limits on the damage</h3>
<p>Replication is asynchronous, so a write that the old primary acknowledged may not have reached the replica that was promoted. If the old primary was cut off but alive, it kept accepting writes. When it rejoins it is turned into a replica of the new primary and does a full resync, and Redis does not merge histories, so its own writes are discarded.</p>
<p><code>min-replicas-to-write</code> and <code>min-replicas-max-lag</code> make a primary that has lost its replicas refuse writes with <code>NOREPLICAS</code> once the lag window passes. That bounds how long a cut-off primary accepts writes alone.</p>

<h3>6. The trade-off: availability against lost writes</h3>
<p>Bounding the window with <code>min-replicas-to-write</code> trades availability during a partition for fewer lost writes: the isolated primary starts refusing writes, and clients have to retry. It does not remove the window, it makes it short. For writes that must not be lost, the application needs its own check, for example <code>WAIT</code> for replica acknowledgement, or an idempotent retry with a confirmation step.</p>
<p>Run an odd number of Sentinels, at least three, on separate machines and zones, so that a majority survives one failure. Sentinels on the same host as the primary go down with it.</p>

<h3>7. Syntax</h3>
<pre># sentinel.conf
sentinel monitor mymaster 10.0.1.5 6379 2         # name, address, quorum
sentinel down-after-milliseconds mymaster 5000   # illustrative
sentinel failover-timeout mymaster 60000

# redis.conf on the primary
min-replicas-to-write 1
min-replicas-max-lag 10

SENTINEL get-master-addr-by-name mymaster
SENTINEL masters
SENTINEL replicas mymaster
SENTINEL failover mymaster                        # force a failover</pre>
<p>Read the Sentinel log for <code>+sdown</code>, <code>+odown</code>, <code>+elected-leader</code> and <code>+switch-master</code> to follow a failover in order.</p>`,
    scenarios: [failover, split, discover],
  };
})();
