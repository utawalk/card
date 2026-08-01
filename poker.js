// ============================================================
//  poker.js — テキサスホールデム ポーカー
//
//  ルール: Texas Hold'em
//    4人プレイ (プレイヤー vs CPU×3)
//    各自に2枚 → フロップ3枚 → ターン1枚 → リバー1枚
//    7枚中ベスト5枚のハンドで勝負
//    アクション: Fold / Check・Call / Raise
// ============================================================

'use strict';

// ============================================================
//  定数
// ============================================================

const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VAL = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};
const PLAYER_NAMES = ['あなた', 'CPU 1', 'CPU 2', 'CPU 3'];

const SMALL_BLIND   = 10;
const BIG_BLIND     = 20;
const STARTING_CHIPS = 1000;
const CPU_DELAY     = 900;  // ms

// ============================================================
//  状態変数
// ============================================================

let G = {};
let raiseTarget = BIG_BLIND * 2;   // 現在のレイズ先設定値
let cpuTimer = null;

// ============================================================
//  エントリーポイント
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('new-game-btn').addEventListener('click', startNewGame);
  document.getElementById('result-retry-btn').addEventListener('click', startNewGame);
  document.getElementById('fold-btn').addEventListener('click', () => humanAct('fold'));
  document.getElementById('call-btn').addEventListener('click', () => humanAct('call'));
  document.getElementById('raise-btn').addEventListener('click', () => humanAct('raise', raiseTarget));
  document.getElementById('raise-down').addEventListener('click', adjustRaise(-BIG_BLIND));
  document.getElementById('raise-up').addEventListener('click',   adjustRaise(+BIG_BLIND));

  startNewGame();
});

// ============================================================
//  ゲーム開始 / 新しいハンド
// ============================================================

function startNewGame() {
  if (cpuTimer) { clearTimeout(cpuTimer); cpuTimer = null; }
  closeResult();
  updateCoinDisplay();

  G = {
    chips:    [STARTING_CHIPS, STARTING_CHIPS, STARTING_CHIPS, STARTING_CHIPS],
    dealer:   3,     // ディーラーポジション（毎ハンドで+1）
    handNum:  0,
    status:   'playing',
  };

  newHand();
}

function newHand() {
  if (cpuTimer) { clearTimeout(cpuTimer); cpuTimer = null; }
  if (G.status !== 'playing') return;

  G.dealer = (G.dealer + 1) % 4;
  G.handNum++;

  // アクティブプレイヤー確認
  const alive = [0,1,2,3].filter(p => G.chips[p] > 0);
  if (alive.length <= 1) { endGame(); return; }
  if (!alive.includes(0)) { endGame(); return; }

  // デッキ生成・シャッフル
  const deck = [];
  for (const s of SUITS) for (const r of RANKS)
    deck.push({ suit: s, rank: r, v: RANK_VAL[r] });
  shuffle(deck);

  // 各プレイヤーに2枚配る
  const hands = [[], [], [], []];
  for (let i = 0; i < 8; i++) hands[i % 4].push(deck.pop());

  // SB / BB
  const sb = nextAlive((G.dealer + 1) % 4);
  const bb = nextAlive((sb + 1) % 4);

  G = {
    ...G,
    deck,
    hands,
    community:  [],
    pot:        0,
    roundBets:  [0, 0, 0, 0],
    totalBets:  [0, 0, 0, 0],   // ハンド通算ベット
    currentBet: BIG_BLIND,
    folded:     [false, false, false, false],
    allIn:      [false, false, false, false],
    phase:      'preflop',
    actionQueue: [],
    lastActions: ['', '', '', ''],
    humanWaiting: false,
    winner:      null,
    bestHands:   null,
    revealCPU:   false,
    sb, bb,
  };

  // ブラインド自動投入
  postBlind(sb, SMALL_BLIND);
  postBlind(bb, BIG_BLIND);

  renderAll();
  setMessage(`Hand ${G.handNum} — SB: ${PLAYER_NAMES[sb]}, BB: ${PLAYER_NAMES[bb]}`);

  // プリフロップ: BBの左から行動
  const utg = nextAlive((bb + 1) % 4);
  setTimeout(() => startBettingRound(utg, true), 500);
}

function postBlind(player, amount) {
  if (G.chips[player] <= 0) return;
  const actual = Math.min(amount, G.chips[player]);
  G.chips[player]  -= actual;
  G.roundBets[player] += actual;
  G.totalBets[player] += actual;
  G.pot += actual;
  if (G.chips[player] === 0) G.allIn[player] = true;
}

// ============================================================
//  ベッティングラウンド
// ============================================================

function startBettingRound(firstActor, isPreflop = false) {
  G.roundBets  = [0, 0, 0, 0];
  G.currentBet = 0;
  G.lastActions = ['', '', '', ''];

  if (isPreflop) {
    // ブラインドを roundBets として再計上（コール判定のため）
    postBlind(G.sb, SMALL_BLIND);
    postBlind(G.bb, BIG_BLIND);
    G.currentBet = BIG_BLIND;
  }

  // アクション順(firstActorから時計回り)
  G.actionQueue = [];
  for (let i = 0; i < 4; i++) {
    const p = (firstActor + i) % 4;
    if (!G.folded[p] && !G.allIn[p] && G.chips[p] > 0) {
      G.actionQueue.push(p);
    }
  }

  renderAll();
  processNext();
}

function processNext() {
  if (G.status !== 'playing') return;

  // 残りアクティブプレイヤー確認
  const actives = activePlayers();
  if (actives.length <= 1) {
    endRoundEarly();
    return;
  }

  if (G.actionQueue.length === 0) {
    // ラウンド終了
    endBettingRound();
    return;
  }

  const player = G.actionQueue[0];

  if (player === 0) {
    G.humanWaiting = true;
    renderAll();
    enableButtons();
  } else {
    G.humanWaiting = false;
    renderAll();
    const d = findCpuAction(player);
    cpuTimer = setTimeout(() => applyAction(player, d.action, d.amount), CPU_DELAY);
  }
}

// ============================================================
//  アクション処理
// ============================================================

function humanAct(action, amount) {
  if (!G.humanWaiting) return;
  G.humanWaiting = false;
  disableButtons();
  applyAction(0, action, amount);
}

function applyAction(player, action, raiseAmount) {
  G.actionQueue.shift();

  const toCall = Math.max(0, G.currentBet - G.roundBets[player]);

  if (action === 'fold') {
    G.folded[player] = true;
    G.lastActions[player] = 'FOLD';
    setBadgeClass(player, 'fold');
    playSound('fold');

  } else if (action === 'call') {
    const amount = Math.min(toCall, G.chips[player]);
    addBet(player, amount);
    G.lastActions[player] = toCall === 0 ? 'CHECK' : `CALL ${amount}`;
    setBadgeClass(player, toCall === 0 ? 'check' : 'call');
    playSound(toCall === 0 ? 'check' : 'chip');

  } else if (action === 'raise') {
    // raiseAmount = 目標とする currentBet 値
    const target = Math.max(raiseAmount, G.currentBet + BIG_BLIND);
    const need   = Math.min(target - G.roundBets[player], G.chips[player]);
    addBet(player, need);
    G.currentBet = G.roundBets[player];
    G.lastActions[player] = `RAISE → ${G.currentBet}`;
    setBadgeClass(player, 'raise');
    playSound('raise');

    // 他の全アクティブプレイヤーを再アクション対象に追加
    const others = [0,1,2,3].filter(p =>
      p !== player && !G.folded[p] && !G.allIn[p] &&
      G.chips[p] > 0 && G.roundBets[p] < G.currentBet &&
      !G.actionQueue.includes(p)
    );
    G.actionQueue = [...others, ...G.actionQueue];
  }

  renderAll();
  setTimeout(() => processNext(), 350);
}

function addBet(player, amount) {
  G.chips[player]     -= amount;
  G.roundBets[player] += amount;
  G.totalBets[player] += amount;
  G.pot               += amount;
  if (G.chips[player] === 0) G.allIn[player] = true;
}

// ============================================================
//  ラウンド終了・フェーズ移行
// ============================================================

function endBettingRound() {
  G.roundBets  = [0, 0, 0, 0];
  G.currentBet = 0;

  const actives = activePlayers();
  if (actives.length <= 1) { endRoundEarly(); return; }

  if      (G.phase === 'preflop') dealFlop();
  else if (G.phase === 'flop')    dealTurn();
  else if (G.phase === 'turn')    dealRiver();
  else if (G.phase === 'river')   doShowdown();
}

function endRoundEarly() {
  const actives = activePlayers();
  if (actives.length === 1) awardPot([actives[0]]);
  else endBettingRound();
}

function dealFlop() {
  G.phase = 'flop';
  G.community = [G.deck.pop(), G.deck.pop(), G.deck.pop()];
  G.lastActions = ['', '', '', ''];
  renderAll();
  playSound('deal');
  setMessage('フロップ');
  const first = firstAfterDealer();
  setTimeout(() => startBettingRound(first), 700);
}

function dealTurn() {
  G.phase = 'turn';
  G.community.push(G.deck.pop());
  G.lastActions = ['', '', '', ''];
  renderAll();
  playSound('deal');
  setMessage('ターン');
  const first = firstAfterDealer();
  setTimeout(() => startBettingRound(first), 700);
}

function dealRiver() {
  G.phase = 'river';
  G.community.push(G.deck.pop());
  G.lastActions = ['', '', '', ''];
  renderAll();
  playSound('deal');
  setMessage('リバー');
  const first = firstAfterDealer();
  setTimeout(() => startBettingRound(first), 700);
}

function firstAfterDealer() {
  for (let i = 1; i <= 4; i++) {
    const p = (G.dealer + i) % 4;
    if (!G.folded[p] && !G.allIn[p] && G.chips[p] > 0) return p;
  }
  // all-in players exist - use first active
  for (let i = 1; i <= 4; i++) {
    const p = (G.dealer + i) % 4;
    if (!G.folded[p]) return p;
  }
  return (G.dealer + 1) % 4;
}

// ============================================================
//  ショーダウン
// ============================================================

function doShowdown() {
  G.phase     = 'showdown';
  G.revealCPU = true;

  const actives = activePlayers();

  // 各プレイヤーのベストハンドを評価
  G.bestHands = {};
  actives.forEach(p => {
    const all = [...G.hands[p], ...G.community];
    G.bestHands[p] = getBestHand(all);
  });

  // 最高スコアを求め、勝者を決定
  let maxScore = -1;
  let winners = [];
  actives.forEach(p => {
    const s = G.bestHands[p].score;
    if (s > maxScore) { maxScore = s; winners = [p]; }
    else if (s === maxScore) winners.push(p);
  });

  renderAll();
  const wNames = winners.map(w => PLAYER_NAMES[w]).join(' & ');
  const wHand  = G.bestHands[winners[0]]?.name ?? '';
  setMessage(`ショーダウン！ → ${wNames} の勝ち！ (${wHand})`);

  playSound(winners.includes(0) ? 'win' : 'lose');
  awardPot(winners);
}

function awardPot(winners) {
  G.winner = winners;

  const share     = Math.floor(G.pot / winners.length);
  const remainder = G.pot - share * winners.length;
  winners.forEach(w => G.chips[w] += share);
  if (remainder > 0) G.chips[winners[0]] += remainder;
  G.pot = 0;

  renderAll();

  const alive = [0,1,2,3].filter(p => G.chips[p] > 0);
  if (alive.length <= 1 || !alive.includes(0)) {
    setTimeout(() => endGame(), 2500);
  } else {
    setTimeout(() => newHand(), 3200);
  }
}

// ============================================================
//  CPU AI
// ============================================================

function findCpuAction(player) {
  const strength = estimateStrength(player);
  const toCall   = Math.max(0, G.currentBet - G.roundBets[player]);
  const noise    = (Math.random() - 0.5) * 0.28;
  const eff      = Math.max(0, Math.min(1, strength + noise));

  if (eff < 0.22) {
    if (toCall === 0) return { action: 'call' };  // check
    if (toCall <= 20) return { action: 'call' };  // call small
    return { action: 'fold' };
  }
  if (eff < 0.55) {
    if (toCall > G.chips[player] / 3) return { action: 'fold' };
    return { action: 'call' };
  }
  if (eff < 0.80) {
    return { action: 'call' };
  }
  // 強いハンド → レイズ検討
  const target = Math.min(G.currentBet + BIG_BLIND * 3, G.chips[player] + G.roundBets[player]);
  if (target > G.currentBet + BIG_BLIND && G.chips[player] > toCall + BIG_BLIND) {
    return { action: 'raise', amount: target };
  }
  return { action: 'call' };
}

function estimateStrength(player) {
  const hole = G.hands[player];
  const all  = [...hole, ...G.community];

  if (all.length >= 5) {
    const best = getBestHand(all);
    // rank 0-9 → 0.0-1.0
    return (best.rank * 1.1) / 9;
  }
  // プリフロップ: ホールカードのヒューリスティック
  const [h1, h2] = hole;
  let s = (h1.v + h2.v) / 28;                              // 0-1
  if (h1.v === h2.v)                  s += 0.35;           // ポケットペア
  if (h1.suit === h2.suit)            s += 0.10;           // スーテッド
  if (Math.abs(h1.v - h2.v) <= 2)    s += 0.05;           // コネクター
  if (Math.max(h1.v, h2.v) >= 12)    s += 0.08;           // ブロードウェイ
  return Math.min(s, 1);
}

// ============================================================
//  ハンド評価
// ============================================================

/**
 * scoreHand: 5枚からスコア(数値)とハンド名を返す
 */
function scoreHand(cards) {
  const vals  = cards.map(c => c.v).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isF   = new Set(suits).size === 1;

  // ランク別グループ（カウント降順 → バリュー降順）
  const byV = {};
  vals.forEach(v => byV[v] = (byV[v] || 0) + 1);
  const groups = Object.entries(byV)
    .map(([v, n]) => [parseInt(v), n])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const counts = groups.map(g => g[1]);

  // ストレート判定
  const uv = [...new Set(vals)];
  let isS = false, sHigh = 0;
  if (uv.length === 5) {
    if (uv[0] - uv[4] === 4)                                         { isS = true; sHigh = uv[0]; }
    else if (uv[0] === 14 && uv[1] === 5 && uv[4] === 2)            { isS = true; sHigh = 5;     }
  }

  let rank = 0, tie = [], name = '';

  if (isF && isS) {
    if (sHigh === 14) { rank = 9; name = 'ロイヤルフラッシュ';   tie = []; }
    else              { rank = 8; name = 'ストレートフラッシュ'; tie = [sHigh]; }
  } else if (counts[0] === 4) {
    rank = 7; name = 'フォーカード';  tie = [groups[0][0], groups[1][0]];
  } else if (counts[0] === 3 && counts[1] === 2) {
    rank = 6; name = 'フルハウス';   tie = [groups[0][0], groups[1][0]];
  } else if (isF) {
    rank = 5; name = 'フラッシュ';   tie = vals;
  } else if (isS) {
    rank = 4; name = 'ストレート';   tie = [sHigh];
  } else if (counts[0] === 3) {
    rank = 3; name = 'スリーカード'; tie = groups.map(g => g[0]);
  } else if (counts[0] === 2 && counts[1] === 2) {
    rank = 2; name = 'ツーペア';    tie = groups.map(g => g[0]);
  } else if (counts[0] === 2) {
    rank = 1; name = 'ワンペア';    tie = groups.map(g => g[0]);
  } else {
    rank = 0; name = 'ハイカード';  tie = vals;
  }

  // スコア = rank * 15^5 + tie[i] * 15^(4-i) ...
  const B = 15;
  let score = rank * Math.pow(B, 5);
  tie.forEach((v, i) => { score += v * Math.pow(B, 4 - i); });

  return { rank, name, score, cards };
}

/**
 * getBestHand: 5〜7枚から最強の5枚を選ぶ
 */
function getBestHand(cards) {
  const n = cards.length;
  if (n < 5) return { rank: -1, name: '評価中', score: -1, cards };
  if (n === 5) return scoreHand(cards);

  let best = null;
  // C(n,5) の全組み合わせを試す
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const hand = cards.filter((_, k) => k !== i && k !== j);
      if (hand.length !== 5) continue;
      const result = scoreHand(hand);
      if (!best || result.score > best.score) best = result;
    }
  }
  return best ?? scoreHand(cards.slice(0, 5));
}

// ============================================================
//  描画
// ============================================================

function renderAll() {
  renderPhaseBadge();
  renderCPUs();
  renderCommunity();
  renderPot();
  renderPlayerHand();
  renderPlayerInfo();
  renderHandName();
  renderActionButtons();
}

function renderPhaseBadge() {
  const el = document.getElementById('phase-badge');
  if (!el) return;
  const labels = { preflop:'PRE-FLOP', flop:'FLOP', turn:'TURN', river:'RIVER', showdown:'SHOWDOWN' };
  el.textContent = labels[G.phase] ?? G.phase.toUpperCase();
}

function renderCPUs() {
  [1, 2, 3].forEach(p => {
    const panel    = document.getElementById(`cpu-${p}`);
    const chipsEl  = document.getElementById(`cpu-chips-${p}`);
    const actionEl = document.getElementById(`cpu-action-${p}`);
    const holeEl   = document.getElementById(`cpu-hole-${p}`);
    const handEl   = document.getElementById(`cpu-hand-${p}`);
    if (!panel) return;

    // パネル状態クラス
    panel.classList.toggle('folded', !!G.folded?.[p]);
    panel.classList.toggle('acting', !G.humanWaiting && G.actionQueue?.[0] === p);
    panel.classList.toggle('winner', (G.winner ?? []).includes(p));
    panel.classList.toggle('is-dealer', G.dealer === p);

    if (chipsEl) chipsEl.textContent = comma(G.chips[p]);

    // アクションバッジ
    if (actionEl) {
      const act = G.lastActions?.[p] ?? '';
      actionEl.textContent = act;
      actionEl.className = 'cpu-action-badge';
      if (act.startsWith('FOLD'))  actionEl.classList.add('fold-badge');
      else if (act.startsWith('CALL') || act === 'CHECK') actionEl.classList.add(act === 'CHECK' ? 'check-badge' : 'call-badge');
      else if (act.startsWith('RAISE')) actionEl.classList.add('raise-badge');

      // ラウンドベット表示
      const rb = G.roundBets?.[p] ?? 0;
      if (rb > 0) actionEl.textContent = act || `BET ${rb}`;
    }

    // ホールカード
    if (holeEl) {
      const slots = holeEl.querySelectorAll('.cpu-card-slot img');
      G.hands[p]?.forEach((card, i) => {
        if (!slots[i]) return;
        const wasBack = slots[i].src.includes('back');
        const revealNow = G.revealCPU && G.phase === 'showdown' && !G.folded[p];
        const newSrc = revealNow
          ? ((typeof getCardImagePath === 'function') ? getCardImagePath(card.suit, card.rank) : `images/cards/${card.suit}/A000_card/${card.rank}.png`)
          : 'images/cards/back.png';
        if (slots[i].src !== newSrc) {
          slots[i].src = newSrc;
          if (revealNow && wasBack) slots[i].classList.add('flip-in');
          else slots[i].classList.remove('flip-in');
        }
      });
    }

    // ショーダウン時のハンド名
    if (handEl) {
      if (G.phase === 'showdown' && G.bestHands?.[p]) {
        handEl.textContent = G.bestHands[p].name;
      } else {
        handEl.textContent = '';
      }
    }
  });
}

function renderCommunity() {
  for (let i = 0; i < 5; i++) {
    const slot = document.getElementById(`comm-${i}`);
    if (!slot) continue;
    slot.innerHTML = '';
    if (i < (G.community?.length ?? 0)) {
      const card = G.community[i];
      const img  = document.createElement('img');
      img.src    = (typeof getCardImagePath === 'function') ? getCardImagePath(card.suit, card.rank) : `images/cards/${card.suit}/A000_card/${card.rank}.png`;
      img.alt    = `${card.rank} of ${card.suit}`;
      img.className = 'comm-card-img';
      slot.appendChild(img);
    } else {
      const emp = document.createElement('div');
      emp.className = 'comm-empty';
      slot.appendChild(emp);
    }
  }
}

function renderPot() {
  const el = document.getElementById('pot-amount');
  if (el) el.textContent = comma(G.pot ?? 0);
}

function renderPlayerHand() {
  [0, 1].forEach(i => {
    const slot = document.getElementById(`player-card-${i}`);
    if (!slot) return;
    slot.innerHTML = '';
    const card = G.hands?.[0]?.[i];
    if (!card) return;
    const img  = document.createElement('img');
    img.src    = (typeof getCardImagePath === 'function') ? getCardImagePath(card.suit, card.rank) : `images/cards/${card.suit}/A000_card/${card.rank}.png`;
    img.alt    = `${card.rank} of ${card.suit}`;
    img.draggable = false;
    slot.appendChild(img);
  });
}

function renderPlayerInfo() {
  // チップ
  const chipsEl = document.getElementById('player-chips');
  if (chipsEl) chipsEl.textContent = comma(G.chips?.[0] ?? 0);

  // ベットタグ
  const betEl = document.getElementById('player-bet-tag');
  if (betEl) {
    const rb = G.roundBets?.[0] ?? 0;
    if (rb > 0) { betEl.textContent = `BET ${rb}`; betEl.classList.add('visible'); }
    else        { betEl.classList.remove('visible'); }
  }

  // プレイヤーセクション（マイターン）
  const sec = document.getElementById('player-section');
  if (sec) sec.classList.toggle('my-turn', !!G.humanWaiting);
}

function renderHandName() {
  const el = document.getElementById('hand-name-text');
  if (!el) return;

  const all = [...(G.hands?.[0] ?? []), ...(G.community ?? [])];
  if (all.length >= 5) {
    const best = getBestHand(all);
    el.textContent = best.name;
    el.className   = `hand-name-text rank-${best.rank}`;
  } else if (all.length >= 2) {
    const [h1, h2] = G.hands[0];
    if (h1.v === h2.v) {
      el.textContent = `ポケット ${h1.rank}`;
    } else if (h1.suit === h2.suit) {
      el.textContent = `${h1.rank}${h2.rank} スーテッド`;
    } else {
      el.textContent = `${h1.rank}${h2.rank} オフスーツ`;
    }
    el.className = 'hand-name-text';
  } else {
    el.textContent = '';
    el.className   = 'hand-name-text';
  }
}

function renderActionButtons() {
  const foldBtn  = document.getElementById('fold-btn');
  const callBtn  = document.getElementById('call-btn');
  const raiseBtn = document.getElementById('raise-btn');
  if (!foldBtn || !callBtn || !raiseBtn) return;

  const waiting = !!G.humanWaiting;
  const toCall  = Math.max(0, (G.currentBet ?? 0) - (G.roundBets?.[0] ?? 0));
  const myChips = G.chips?.[0] ?? 0;
  const canRaise = myChips > toCall + BIG_BLIND;

  foldBtn.disabled  = !waiting;
  callBtn.disabled  = !waiting;
  raiseBtn.disabled = !waiting || !canRaise;

  if (toCall === 0)        callBtn.textContent = 'CHECK';
  else if (toCall >= myChips) callBtn.textContent = `ALL-IN ${myChips}`;
  else                     callBtn.textContent = `CALL ${toCall}`;

  // レイズ金額
  const minRaise = (G.currentBet ?? 0) + BIG_BLIND;
  const maxRaise = myChips + (G.roundBets?.[0] ?? 0);
  raiseTarget = Math.max(raiseTarget, minRaise);
  raiseTarget = Math.min(raiseTarget, maxRaise);
  updateRaiseDisplay();
}

// ============================================================
//  レイズ金額調整
// ============================================================

function adjustRaise(delta) {
  return () => {
    const myChips  = G.chips?.[0] ?? 0;
    const minRaise = (G.currentBet ?? 0) + BIG_BLIND;
    const maxRaise = myChips + (G.roundBets?.[0] ?? 0);
    raiseTarget = Math.max(minRaise, Math.min(maxRaise, raiseTarget + delta));
    updateRaiseDisplay();
  };
}

function updateRaiseDisplay() {
  const el = document.getElementById('raise-display');
  if (el) el.textContent = raiseTarget;
}

// ============================================================
//  ボタン有効/無効
// ============================================================

function enableButtons() {
  renderActionButtons();
}

function disableButtons() {
  ['fold-btn', 'call-btn', 'raise-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = true;
  });
}

// ============================================================
//  アクションバッジ CSS クラス
// ============================================================

function setBadgeClass(player, type) {
  // Redraw later via renderAll — just track the text
}

// ============================================================
//  メッセージ
// ============================================================

function setMessage(msg) {
  const el = document.getElementById('message-bar');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

// ============================================================
//  ユーティリティ
// ============================================================

function activePlayers() {
  return [0,1,2,3].filter(p => !G.folded?.[p]);
}

function nextAlive(from) {
  for (let i = 0; i < 4; i++) {
    const p = (from + i) % 4;
    if (G.chips[p] > 0) return p;
  }
  return from;
}

function comma(n) {
  return n?.toLocaleString() ?? '0';
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ============================================================
//  ゲームエンド
// ============================================================

function endGame() {
  if (G.status === 'ended') return; // 二重終了処理・コイン二重付与を防止
  G.status = 'ended';

  const overlay   = document.getElementById('result-overlay');
  const iconEl    = document.getElementById('result-icon');
  const titleEl   = document.getElementById('result-title');
  const subEl     = document.getElementById('result-sub');
  const chipsEl   = document.getElementById('result-chips-row');
  const coinsEl   = document.getElementById('result-coins');

  const playerChips = G.chips[0];
  const win = playerChips >= STARTING_CHIPS;
  const bankrupt = playerChips === 0;

  if (iconEl)  iconEl.textContent  = bankrupt ? '💸' : win ? '🏆' : '💀';
  if (titleEl) titleEl.textContent = bankrupt ? 'バスト！' : win ? '勝利！' : 'ゲームオーバー';
  if (subEl)   subEl.textContent   = bankrupt
    ? 'チップがなくなりました。'
    : `最終チップ: ${comma(playerChips)} (初期値 ${STARTING_CHIPS})`;

  if (chipsEl) {
    chipsEl.innerHTML = PLAYER_NAMES.map((name, i) => `
      <div class="rchip-badge${i === 0 ? ' you' : ''}">
        <span class="rchip-name">${name}</span>
        <span class="rchip-val">${comma(G.chips[i])}</span>
      </div>`).join('');
  }

  // ---- コイン付与（最終チップ枚数に応じて換算） ----
  const coinsEarned = Math.max(5, Math.round(playerChips / 50));
  const coinsTotal  = (typeof Wallet_addCoins === 'function') ? Wallet_addCoins(coinsEarned) : coinsEarned;
  if (coinsEl) {
    coinsEl.textContent = `🪙 +${coinsEarned} コイン獲得！（所持: ${coinsTotal.toLocaleString()}）`;
  }
  updateCoinDisplay();

  if (overlay) overlay.classList.remove('hidden');
  playSound(bankrupt ? 'lose' : 'win');
}

/** ヘッダーのコイン所持数表示を更新する */
function updateCoinDisplay() {
  const el = document.getElementById('coin-amount');
  if (el && typeof Wallet_getCoins === 'function') {
    el.textContent = Wallet_getCoins().toLocaleString();
  }
}

function closeResult() {
  document.getElementById('result-overlay')?.classList.add('hidden');
}

// ============================================================
//  サウンド
// ============================================================

let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function tone(ctx, freq, start, dur, gain, type = 'sine') {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  osc.start(start); osc.stop(start + dur + 0.05);
}

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    if (type === 'deal') {
      tone(ctx, 700, now, 0.08, 0.10);
      tone(ctx, 900, now + 0.04, 0.09, 0.07);
    } else if (type === 'chip') {
      tone(ctx, 900, now, 0.07, 0.10);
      tone(ctx, 700, now + 0.04, 0.08, 0.07);
    } else if (type === 'raise') {
      tone(ctx, 600, now, 0.12, 0.10);
      tone(ctx, 900, now + 0.06, 0.15, 0.12);
      tone(ctx, 1100, now + 0.13, 0.15, 0.09);
    } else if (type === 'fold') {
      tone(ctx, 300, now, 0.22, 0.09, 'triangle');
    } else if (type === 'check') {
      tone(ctx, 650, now, 0.10, 0.08);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, f, now + i * 0.13, 0.55, 0.17));
    } else if (type === 'lose') {
      [392, 349.2, 311.1, 261.6].forEach((f, i) => tone(ctx, f, now + i * 0.15, 0.45, 0.13));
    }
  } catch (e) { /* ignore */ }
}
