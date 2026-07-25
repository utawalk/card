// ============================================================
//  oldmaid.js — ババ抜き (Old Maid)
//
//  ルール:
//    52枚 + ジョーカー1枚の合計53枚を4人に配布。
//    全員は最初に手持ちのペアを捨てる。
//    順番に隣のプレイヤーから1枚引き、ペアができたら捨てる。
//    最後にジョーカーを持つプレイヤーが負け。
// ============================================================

'use strict';

// ============================================================
//  定数
// ============================================================

const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RANK_VAL = { A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13 };
const PLAYER_NAMES = ['あなた', 'CPU 1', 'CPU 2', 'CPU 3'];
const MEDALS = ['🥇', '🥈', '🥉', '💀'];
const CPU_THINK_MS = 1100;

// ============================================================
//  ゲーム状態
// ============================================================

let G = {};
let cpuTimer = null;

// ============================================================
//  エントリーポイント
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('new-game-btn').addEventListener('click', newGame);
  document.getElementById('result-play-again-btn').addEventListener('click', newGame);
  newGame();
});

// ============================================================
//  ゲーム初期化
// ============================================================

function newGame() {
  if (cpuTimer) { clearTimeout(cpuTimer); cpuTimer = null; }
  closeResult();
  hideDrawArea();
  updateCoinDisplay();

  // デッキ生成（52枚 + ジョーカー）
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, v: RANK_VAL[rank], isJoker: false, id: `${suit}_${rank}` });
    }
  }
  deck.push({ suit: 'joker', rank: 'JOKER', v: -1, isJoker: true, id: 'joker' });
  shuffle(deck);

  // 4人に1枚ずつ配る（53枚 → 14,13,13,13）
  const rawHands = [[], [], [], []];
  deck.forEach((c, i) => rawHands[i % 4].push(c));

  // 初期ペアを捨てる
  const hands = rawHands.map(discardPairs);

  G = {
    hands,
    drawer:           0,             // 現在の引き手
    status:           'playing',
    finishOrder:      [],            // 上がった順（先頭が1位）
    loser:            -1,            // ジョーカー保持者（最終負け）
    animating:        false,
    humanDrawSource:  -1,            // 人間が今どのCPUから引くか（-1: 待機なし）
    message:          '',
  };

  renderAll();
  setMessage('ゲームスタート！ペアを捨てて始めます。');
  setTimeout(() => startTurn(), 900);
}

// ============================================================
//  ペア捨て
// ============================================================

function discardPairs(hand) {
  const jokers = hand.filter(c => c.isJoker);
  const byRank = {};
  hand.filter(c => !c.isJoker).forEach(c => {
    if (!byRank[c.rank]) byRank[c.rank] = [];
    byRank[c.rank].push(c);
  });

  // ペア（2枚）ずつ捨てる → 奇数枚のランクは1枚残す
  const remaining = [...jokers];
  for (const cards of Object.values(byRank)) {
    const keep = cards.length % 2; // 0 or 1
    if (keep) remaining.push(cards[0]);
  }
  return sortHand(remaining);
}

function sortHand(hand) {
  return hand.sort((a, b) => {
    if (a.isJoker) return 1;
    if (b.isJoker) return -1;
    const sd = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    return sd !== 0 ? sd : a.v - b.v;
  });
}

// ============================================================
//  ターン制御
// ============================================================

function startTurn() {
  if (G.status !== 'playing') return;

  // 手が空のプレイヤーを「上がり」として記録
  autoFinishEmptyPlayers();
  if (checkGameEnd()) return;

  // 引き手を最初のアクティブプレイヤーに調整
  let drawer = G.drawer;
  let guarded = 0;
  while (isFinished(drawer) && guarded++ < 4) {
    drawer = (drawer + 1) % 4;
  }
  G.drawer = drawer;

  if (isFinished(drawer)) { checkGameEnd(); return; }

  const source = getSource(drawer);
  if (source === -1) { checkGameEnd(); return; }

  renderAll();

  if (drawer === 0) {
    // プレイヤーのターン：引くカードを選ばせる
    setMessage(`${PLAYER_NAMES[source]} のカードを1枚選んでください`);
    G.humanDrawSource = source;
    showDrawArea(source);
  } else {
    // CPU のターン
    setMessage(`${PLAYER_NAMES[drawer]} が考えています…`);
    cpuTimer = setTimeout(() => cpuDraw(drawer, source), CPU_THINK_MS);
  }
}

function advanceTurn() {
  // 次のアクティブなプレイヤーへ
  let next = (G.drawer + 1) % 4;
  let guard = 0;
  while (isFinished(next) && guard++ < 4) {
    next = (next + 1) % 4;
  }
  G.drawer = next;
  cpuTimer = setTimeout(() => startTurn(), 700);
}

/** 現在のターンの「引き元」を探す（drawer の1つ前のアクティブプレイヤー）*/
function getSource(drawer) {
  let source = (drawer - 1 + 4) % 4;
  let guard = 0;
  while (guard++ < 4) {
    if (!isFinished(source) && G.hands[source].length > 0) return source;
    source = (source - 1 + 4) % 4;
    if (source === drawer) return -1;
  }
  return -1;
}

function isFinished(player) {
  return G.finishOrder.includes(player) || G.loser === player;
}

function activePlayers() {
  return [0,1,2,3].filter(p => !isFinished(p) && G.hands[p].length > 0);
}

function autoFinishEmptyPlayers() {
  [0,1,2,3].forEach(p => {
    if (!isFinished(p) && G.hands[p].length === 0) {
      G.finishOrder.push(p);
      const pos = G.finishOrder.indexOf(p) + 1;
      setMessage(`${PLAYER_NAMES[p]} が上がりました！ ${MEDALS[pos - 1] ?? '🏅'} ${pos}位`);
      if (p === 0) playSound('win_partial');
    }
  });
}

// ============================================================
//  CPU ターン
// ============================================================

function cpuDraw(drawer, source) {
  cpuTimer = null;
  if (G.status !== 'playing') return;

  const src = G.hands[source];
  if (src.length === 0) { advanceTurn(); return; }

  // CPU はランダムに1枚引く（ジョーカーの位置をシャッフルにより隠す）
  const idx = Math.floor(Math.random() * src.length);
  drawAndProcess(drawer, source, idx, false);
}

// ============================================================
//  人間の引く操作
// ============================================================

function showDrawArea(source) {
  const drawArea = document.getElementById('draw-area');
  const cardsEl  = document.getElementById('drawable-cards');
  const titleEl  = document.getElementById('draw-title');

  cardsEl.innerHTML = '';

  // インデックスをシャッフルして表示位置を隠す
  const n = G.hands[source].length;
  const indices = Array.from({ length: n }, (_, i) => i);
  shuffle(indices);

  indices.forEach((actualIdx, displayPos) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'drawable-card';
    cardEl.style.animationDelay = `${displayPos * 0.03}s`;

    const img = document.createElement('img');
    img.src = 'images/cards/back.png';
    img.alt = 'カード';
    img.draggable = false;
    cardEl.appendChild(img);

    cardEl.addEventListener('click', () => {
      if (G.animating || G.humanDrawSource !== source) return;
      G.humanDrawSource = -1;
      hideDrawArea();
      drawAndProcess(0, source, actualIdx, true);
    });

    cardsEl.appendChild(cardEl);
  });

  if (titleEl) titleEl.textContent = `${PLAYER_NAMES[source]} のカードを1枚選んでください`;
  drawArea.classList.remove('hidden');
}

function hideDrawArea() {
  document.getElementById('draw-area')?.classList.add('hidden');
  G.humanDrawSource = -1;
}

// ============================================================
//  カードを引く & ペア処理
// ============================================================

function drawAndProcess(drawer, source, idx, isHuman) {
  G.animating = true;

  const drawn = G.hands[source].splice(idx, 1)[0];
  G.hands[drawer].push(drawn);

  const pair = findPairCard(G.hands[drawer], drawn);

  if (pair) {
    // ペア成立 → 2枚除去
    G.hands[drawer] = G.hands[drawer].filter(c => c !== drawn && c !== pair);
    if (drawn.isJoker || pair.isJoker) {
      // ジョーカーがペアになることはないが念のため
      setMessage(`${PLAYER_NAMES[drawer]} : ペア！✨`);
    } else {
      setMessage(`${PLAYER_NAMES[drawer]} : ${drawn.rank} のペア成立！✨`);
    }
    playSound('pair');
  } else if (drawn.isJoker) {
    setMessage(`${PLAYER_NAMES[drawer]} がジョーカーを引きました！😱`);
    playSound('joker');
  } else {
    setMessage(`${PLAYER_NAMES[drawer]} が ${drawn.rank} を引きました`);
    playSound('draw');
  }

  G.hands[drawer] = sortHand(G.hands[drawer]);
  G.hands[source] = sortHand(G.hands[source]);

  autoFinishEmptyPlayers();
  renderAll();

  G.animating = false;

  if (!checkGameEnd()) {
    G.drawer = drawer;
    advanceTurn();
  }
}

// ============================================================
//  ゲーム終了判定
// ============================================================

function checkGameEnd() {
  if (G.status === 'ended') return true; // 二重終了処理・コイン二重付与を防止
  autoFinishEmptyPlayers();

  const remaining = [0,1,2,3].filter(p => !isFinished(p));

  if (remaining.length <= 1) {
    const loser = remaining[0] ?? -1;
    G.loser = loser;
    G.status = 'ended';
    hideDrawArea();
    renderAll();

    if (loser === 0) {
      setMessage('😢 あなたがジョーカーを持ったまま負けました…');
      playSound('lose');
    } else {
      setMessage(`🎉 ${PLAYER_NAMES[loser]} がジョーカーを持ったので、あなたの勝ち！`);
      playSound('win');
    }

    // ---- コイン付与 ----
    const coinsEarned = computeOldMaidCoins();
    const coinsTotal  = (typeof Wallet_addCoins === 'function') ? Wallet_addCoins(coinsEarned) : coinsEarned;
    G.coinsEarned = coinsEarned;
    G.coinsTotal  = coinsTotal;
    updateCoinDisplay();

    setTimeout(() => showResult(), 1400);
    return true;
  }
  return false;
}

/** 人間の最終成績に応じてコインを計算する（最下位=最小、上がった順が早いほど多い） */
function computeOldMaidCoins() {
  if (G.loser === 0) return 5; // ジョーカーを持ったまま負け
  const pos = G.finishOrder.indexOf(0); // 0 = 1位
  const byPos = [80, 50, 25];
  return byPos[pos] ?? 15;
}

/** ヘッダーのコイン所持数表示を更新する */
function updateCoinDisplay() {
  const el = document.getElementById('coin-amount');
  if (el && typeof Wallet_getCoins === 'function') {
    el.textContent = Wallet_getCoins().toLocaleString();
  }
}

// ============================================================
//  ペアを探す
// ============================================================

function findPairCard(hand, newCard) {
  if (newCard.isJoker) return null;
  return hand.find(c => c !== newCard && !c.isJoker && c.rank === newCard.rank) || null;
}

// ============================================================
//  描画
// ============================================================

function renderAll() {
  renderCPUPanels();
  renderPlayerHand();
  renderTurnIndicator();
}

function renderCPUPanels() {
  [1, 2, 3].forEach(p => {
    const panel   = document.getElementById(`cpu-panel-${p}`);
    const countEl = document.getElementById(`cpu-count-${p}`);
    const statusEl = document.getElementById(`cpu-status-${p}`);
    const backsEl = document.getElementById(`cpu-backs-${p}`);
    if (!panel) return;

    const finished = G.finishOrder.includes(p);
    const isLoser  = G.loser === p;
    const isSource = G.humanDrawSource === p && G.status === 'playing';
    const isDrawer = G.drawer === p && G.status === 'playing' && !finished && !isLoser;

    panel.classList.toggle('is-source', isSource);
    panel.classList.toggle('is-drawer', isDrawer);
    panel.classList.toggle('finished',  finished && !isLoser);
    panel.classList.toggle('is-loser',  isLoser);

    if (countEl) countEl.textContent = `${G.hands[p].length} 枚`;

    if (statusEl) {
      if (isLoser) { statusEl.textContent = '👺 ババ負け'; statusEl.style.color = '#f87171'; }
      else if (finished) {
        const pos = G.finishOrder.indexOf(p) + 1;
        statusEl.textContent = `${MEDALS[pos-1] ?? ''} ${pos}位`;
        statusEl.style.color = pos === 1 ? '#fbbf24' : '#8b98b8';
      }
      else if (isSource) { statusEl.textContent = '← 選ぶ'; statusEl.style.color = 'var(--gold)'; }
      else if (isDrawer) { statusEl.textContent = '考え中…'; statusEl.style.color = '#a78bfa'; }
      else { statusEl.textContent = ''; }
    }

    // ミニカード裏面ファン
    if (backsEl) {
      const n = Math.min(G.hands[p].length, 9);
      if (parseInt(backsEl.dataset.n || '-1') !== n) {
        backsEl.dataset.n = n;
        backsEl.innerHTML = '';
        for (let i = 0; i < n; i++) {
          const img = document.createElement('img');
          img.src = 'images/cards/back.png';
          img.className = 'cpu-back-img';
          img.alt = 'card';
          img.style.left   = `${i * 11}px`;
          img.style.zIndex = i;
          backsEl.appendChild(img);
        }
      }
    }
  });
}

function renderPlayerHand() {
  const handEl = document.getElementById('player-hand');
  if (!handEl) return;
  handEl.innerHTML = '';

  G.hands[0].forEach((card, i) => {
    const cardEl = card.isJoker ? createJokerElement() : createCardElement(card);
    cardEl.style.setProperty('--deal-i', i);
    handEl.appendChild(cardEl);
  });

  const countEl = document.getElementById('player-count');
  if (countEl) countEl.textContent = `${G.hands[0].length} 枚`;

  const playerArea = document.getElementById('player-area');
  if (playerArea) {
    const finished = G.finishOrder.includes(0);
    const isLoser  = G.loser === 0;
    playerArea.classList.toggle('finished', finished && !isLoser);
    playerArea.classList.toggle('is-loser', isLoser);
  }
}

function createCardElement(card) {
  const el = document.createElement('div');
  el.className = 'hand-card';
  const img = document.createElement('img');
  img.src = `images/cards/${card.suit}/A001_card/${card.rank}.png`;
  img.alt = `${card.rank} of ${card.suit}`;
  img.draggable = false;
  el.appendChild(img);
  return el;
}

function createJokerElement() {
  const el = document.createElement('div');
  el.className = 'hand-card joker-card';
  const emo = document.createElement('span');
  emo.className = 'joker-emoji';
  emo.textContent = '🃏';
  const lbl = document.createElement('span');
  lbl.className = 'joker-label';
  lbl.textContent = 'JOKER';
  el.appendChild(emo);
  el.appendChild(lbl);
  return el;
}

function renderTurnIndicator() {
  const el = document.getElementById('turn-indicator');
  if (!el) return;

  if (G.status !== 'playing') {
    el.textContent = '';
    el.className = 'turn-indicator';
    return;
  }

  if (G.humanDrawSource !== -1 || G.drawer === 0) {
    el.textContent = '🟢 あなたのターン';
    el.className = 'turn-indicator my-turn';
  } else {
    el.textContent = `⏳ ${PLAYER_NAMES[G.drawer]} のターン`;
    el.className = 'turn-indicator cpu-turn';
  }
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
//  結果オーバーレイ
// ============================================================

function showResult() {
  const overlay   = document.getElementById('result-overlay');
  const iconEl    = document.getElementById('result-icon');
  const titleEl   = document.getElementById('result-title');
  const subEl     = document.getElementById('result-sub');
  const rankingEl = document.getElementById('result-ranking');

  const humanPos    = G.finishOrder.indexOf(0);
  const humanIsLoser = G.loser === 0;

  if (iconEl)  iconEl.textContent  = humanIsLoser ? '👺' : humanPos === 0 ? '🏆' : '✨';
  if (titleEl) titleEl.textContent = humanIsLoser ? '負けました…' : `${humanPos + 1}位でクリア！`;
  if (subEl)   subEl.textContent   = humanIsLoser
    ? 'ジョーカーを最後まで手放せませんでした'
    : `${PLAYER_NAMES[G.loser]} がジョーカーを持ったまま終了しました`;

  if (rankingEl) {
    rankingEl.innerHTML = '';

    G.finishOrder.forEach((player, i) => {
      const row = document.createElement('div');
      row.className = `rk-row${player === 0 ? ' you' : ''}`;
      row.innerHTML = `
        <span class="rk-pos">${MEDALS[i] || (i+1)+'位'} ${i+1}位</span>
        <span class="rk-name">${PLAYER_NAMES[player]}${player === 0 ? ' 👤' : ''}</span>
      `;
      rankingEl.appendChild(row);
    });

    if (G.loser !== -1) {
      const row = document.createElement('div');
      row.className = `rk-row loser${G.loser === 0 ? ' you' : ''}`;
      row.innerHTML = `
        <span class="rk-pos">👺 最下位</span>
        <span class="rk-name">${PLAYER_NAMES[G.loser]}${G.loser === 0 ? ' 👤' : ''} — ジョーカー保持</span>
      `;
      rankingEl.appendChild(row);
    }
  }

  const coinsEl = document.getElementById('result-coins');
  if (coinsEl) {
    coinsEl.textContent = `🪙 +${G.coinsEarned ?? 0} コイン獲得！（所持: ${(G.coinsTotal ?? 0).toLocaleString()}）`;
  }

  if (overlay) overlay.classList.remove('hidden');
}

function closeResult() {
  document.getElementById('result-overlay')?.classList.add('hidden');
}

// ============================================================
//  サウンド (Web Audio API)
// ============================================================

let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playTone(ctx, freq, start, dur, gain, type = 'sine') {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.start(start); osc.stop(start + dur + 0.05);
}

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    if (type === 'draw') {
      // 短い引く音
      playTone(ctx, 600, now,        0.10, 0.12);
      playTone(ctx, 850, now + 0.05, 0.12, 0.08);

    } else if (type === 'pair') {
      // ペア成立チャイム
      playTone(ctx, 523.25, now,        0.40, 0.16);
      playTone(ctx, 783.99, now + 0.13, 0.50, 0.14);

    } else if (type === 'joker') {
      // ジョーカーを引いた！不気味な音
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.6);
      g.gain.setValueAtTime(0.14, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc.start(now); osc.stop(now + 0.7);

    } else if (type === 'win_partial') {
      // 上がり（人間）
      playTone(ctx, 659.25, now,        0.35, 0.14);
      playTone(ctx, 880,    now + 0.12, 0.40, 0.12);

    } else if (type === 'win') {
      // 大勝利ファンファーレ
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        playTone(ctx, f, now + i * 0.13, 0.55, 0.17);
      });

    } else if (type === 'lose') {
      // 敗北の哀愁音
      [392, 349.2, 311.1, 261.6].forEach((f, i) => {
        playTone(ctx, f, now + i * 0.14, 0.45, 0.14);
      });
    }
  } catch (e) { /* ignore */ }
}

// ============================================================
//  ユーティリティ
// ============================================================

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
