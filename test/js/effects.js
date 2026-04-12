// --- Foundation Placement Visual Effects & Sound ---

// ============================================================
//  サウンドシステム (Web Audio API)
// ============================================================

// main.js の AudioContext を共用するか、なければ新規作成
function getAudioContext() {
  if (typeof audioCtx !== 'undefined' && audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  // fallback
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

/**
 * ランクに応じたフォンデーション効果音を鳴らす
 * @param {string} rank   - 'A' | '2' | ... | 'K'
 * @param {string} suit   - 'spades' | 'hearts' | 'clubs' | 'diamonds'
 */
function playFoundationSound(rank, suit) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  if (rank === 'A') {
    // --- Ace: 上昇する3音アルペジオ ---
    playAce(ctx, now);
  } else if (rank === 'K') {
    // --- King: 華やかな5音ファンファーレ ---
    playKingFanfare(ctx, now);
  } else if (rank === 'Q') {
    // Queen: きらびやかな3音チャイム
    playSparkleTone(ctx, now, [880, 1108, 1320], 0.18);
  } else if (rank === 'J') {
    // Jack: 短い2音フレーズ
    playSparkleTone(ctx, now, [660, 880], 0.16);
  } else {
    // 2〜10: カードの数値でピッチをずらすチャイム
    playChime(ctx, now, rank);
  }
}

// --- 共通ユーティリティ：サイン波にエンベロープをかけてチャイム的音を鳴らす ---
function playTone(ctx, freq, startTime, duration, gainPeak, type = 'sine', pan = 0) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  const panner = ctx.createStereoPanner();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  // アタック → サステイン → リリース
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.015);
  gain.gain.setValueAtTime(gainPeak, startTime + duration * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  panner.pan.setValueAtTime(pan, startTime);

  osc.connect(gain);
  gain.connect(panner);
  panner.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

// 倍音を重ねてリッチなチャイム音にする
function playRichTone(ctx, freq, startTime, duration, gain) {
  playTone(ctx, freq,       startTime, duration, gain,        'sine',     0);
  playTone(ctx, freq * 2,   startTime, duration, gain * 0.3,  'sine',     0);
  playTone(ctx, freq * 3,   startTime, duration, gain * 0.1,  'triangle', 0);
}

// 指定周波数列を順番に演奏
function playSparkleTone(ctx, now, freqs, gain, interval = 0.10) {
  freqs.forEach((f, i) => playRichTone(ctx, f, now + i * interval, 0.5, gain));
}

// --- Ace: 気持ちよく上昇する3音アルペジオ ---
function playAce(ctx, now) {
  // C5 → E5 → G5 の明るいアルペジオ
  const freqs = [523.25, 659.25, 783.99];
  freqs.forEach((f, i) => {
    playRichTone(ctx, f, now + i * 0.12, 0.7, 0.22);
  });
  // 最後に高いCで締める
  playRichTone(ctx, 1046.5, now + freqs.length * 0.12, 0.8, 0.18);
}

// --- King: ファンファーレ风5音 ---
function playKingFanfare(ctx, now) {
  // G4 → C5 → E5 → G5 → C6
  const notes = [
    { f: 392.00, t: 0.00, dur: 0.25, g: 0.26 },
    { f: 523.25, t: 0.13, dur: 0.25, g: 0.26 },
    { f: 659.25, t: 0.26, dur: 0.25, g: 0.26 },
    { f: 783.99, t: 0.36, dur: 0.35, g: 0.26 },
    { f: 1046.5, t: 0.48, dur: 0.55, g: 0.28 },
  ];
  notes.forEach(n => playRichTone(ctx, n.f, now + n.t, n.dur, n.g));

  // 低音のベースパルスで豪華さを強調
  playTone(ctx, 130.81, now,        0.2,  0.3, 'sine', 0);
  playTone(ctx, 130.81, now + 0.48, 0.35, 0.35, 'sine', 0);
}

// --- 2〜10: カード値でピッチを変えるシングルチャイム ---
function playChime(ctx, now, rank) {
  // value 2=2 〜 10=10 → 周波数を C5(523Hz) 〜 B5(987Hz) にマッピング
  const value = parseInt(rank); // 2〜10
  // ペンタトニックスケール上の音を選ぶ（不協和音を避ける）
  const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.00, 987.77];
  const idx = Math.round(((value - 2) / 8) * (pentatonic.length - 1));
  const freq = pentatonic[idx];

  playRichTone(ctx, freq, now,        0.5, 0.20);
  // わずかに遅れた高い倍音で煌めき感を追加
  playTone(ctx, freq * 2, now + 0.04, 0.3, 0.08, 'sine', 0);
}

// スーツごとのパーティクルカラーテーマ
const SUIT_THEMES = {
  spades:   { primary: '#a78bfa', secondary: '#7c3aed', emoji: '♠', label: '♠ Spades' },
  hearts:   { primary: '#f87171', secondary: '#dc2626', emoji: '♥', label: '♥ Hearts' },
  clubs:    { primary: '#34d399', secondary: '#059669', emoji: '♣', label: '♣ Clubs' },
  diamonds: { primary: '#fbbf24', secondary: '#f59e0b', emoji: '♦', label: '♦ Diamonds' },
};

// ランク別メッセージ
const RANK_MESSAGES = {
  'A':  '🌟 Ace!',
  '2':  'Nice!',
  '3':  'Keep going!',
  '4':  'Good!',
  '5':  'Halfway there!',
  '6':  'Great!',
  '7':  '✨ Lucky 7!',
  '8':  'Awesome!',
  '9':  'Almost!',
  '10': '🔟 Ten!',
  'J':  '⚔️ Jack!',
  'Q':  '👑 Queen!',
  'K':  '🏆 King! Complete!',
};

/**
 * フォンデーションにカードが置かれたときに呼ぶ
 * @param {string} suit - 'spades' | 'hearts' | 'clubs' | 'diamonds'
 * @param {string} rank - 'A' | '2' | ... | 'K'
 * @param {number} pileIndex - 0〜3 (foundation-0 など)
 */
function triggerFoundationEffect(suit, rank, pileIndex) {
  const pileEl = document.getElementById(`foundation-${pileIndex}`);
  if (!pileEl) return;

  const theme = SUIT_THEMES[suit];
  const rect = pileEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // 0. 効果音
  playFoundationSound(rank, suit);

  // 1. カードのフラッシュ光エフェクト
  triggerCardFlash(pileEl, theme);

  // 2. パーティクル爆発
  spawnParticles(centerX, centerY, theme, rank);

  // 3. フローティングテキストポップアップ
  spawnFloatingText(centerX, centerY, rank, theme);

  // 4. 画面端のグロー（Kのときは特別演出）
  if (rank === 'K') {
    triggerKingEffect(theme);
  }

  // 5. 画面中央スーツ絵積み重ね演出
  triggerSuitLayerReveal(suit, rank);
}

// --- 1. カードフラッシュ ---
function triggerCardFlash(pileEl, theme) {
  const flash = document.createElement('div');
  flash.className = 'foundation-flash';
  flash.style.setProperty('--flash-color', theme.primary);
  pileEl.appendChild(flash);

  flash.addEventListener('animationend', () => flash.remove());
}

// --- 2. パーティクル爆発 ---
function spawnParticles(cx, cy, theme, rank) {
  const count = rank === 'A' ? 24 : rank === 'K' ? 40 : 16;
  const container = document.getElementById('particle-layer');
  if (!container) return;

  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';

    // ランダムに形状を選ぶ
    const shapes = ['round', 'square', 'star', 'suit'];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    p.classList.add(`particle-${shape}`);

    if (shape === 'suit') {
      p.textContent = theme.emoji;
    }

    // 色をランダムにプライマリ/セカンダリから選択
    const color = Math.random() > 0.5 ? theme.primary : theme.secondary;
    p.style.setProperty('--p-color', color);

    // 飛び出す角度と距離をランダム化
    const angle = (360 / count) * i + (Math.random() - 0.5) * 30;
    const distance = 60 + Math.random() * 120;
    const dx = Math.cos((angle * Math.PI) / 180) * distance;
    const dy = Math.sin((angle * Math.PI) / 180) * distance - 40; // 少し上方向バイアス
    const duration = 600 + Math.random() * 400;
    const size = 6 + Math.random() * 8;

    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.setProperty('--p-dx', `${dx}px`);
    p.style.setProperty('--p-dy', `${dy}px`);
    p.style.setProperty('--p-duration', `${duration}ms`);
    p.style.setProperty('--p-rotation', `${Math.random() * 720 - 360}deg`);
    p.style.fontSize = `${size + 4}px`;

    container.appendChild(p);

    // アニメーション終了後に削除
    setTimeout(() => p.remove(), duration + 100);
  }
}

// --- 3. フローティングテキスト ---
function spawnFloatingText(cx, cy, rank, theme) {
  const container = document.getElementById('particle-layer');
  if (!container) return;

  const text = document.createElement('div');
  text.className = 'floating-text';
  text.textContent = RANK_MESSAGES[rank] || rank;
  text.style.left = `${cx}px`;
  text.style.top = `${cy}px`;
  text.style.setProperty('--ft-color', theme.primary);

  container.appendChild(text);
  setTimeout(() => text.remove(), 1200);
}

// --- 4. キング完成特別演出 ---
function triggerKingEffect(theme) {
  const overlay = document.getElementById('king-glow-overlay');
  if (!overlay) return;

  overlay.style.setProperty('--king-color', theme.primary);
  overlay.classList.add('king-active');

  setTimeout(() => {
    overlay.classList.remove('king-active');
  }, 1000);

  // スクリーンシェイク（軽め）
  const board = document.getElementById('board');
  board.classList.add('screen-shake');
  setTimeout(() => board.classList.remove('screen-shake'), 400);
}

// ============================================================
//  スーツ絵積み重ね演出
// ============================================================

// スートごとの絵フォルダ名マッピング（ゲーム内スート名 → フォルダ名）
const SUIT_FOLDER = {
  spades:   'spade',
  hearts:   'heart',
  clubs:    'club',
  diamonds: 'diamond',
};

// カードランクの順序（フォルダ内ファイル名と対応）
const RANK_ORDER = ['A', '02', '03', '04', '05', '06', '07', '08', '09', '10', 'J', 'Q', 'K'];

// ゲーム外ではファイル名が card_02.png のように2桁になることに注意
// rank 値（'2'〜'10'）→ファイル名用文字列
function rankToFileName(rank) {
  if (rank === 'A' || rank === 'J' || rank === 'Q' || rank === 'K') return rank;
  // 数値は2桁ゼロパディング
  return String(parseInt(rank)).padStart(2, '0');
}

// スートごとの現在レイヤー状態を保持
// { suit: { layerCount: N, hideTimer: timerId | null, overlayActive: bool } }
const suitLayerState = {
  spades:   { layerCount: 0, hideTimer: null, overlayActive: false },
  hearts:   { layerCount: 0, hideTimer: null, overlayActive: false },
  clubs:    { layerCount: 0, hideTimer: null, overlayActive: false },
  diamonds: { layerCount: 0, hideTimer: null, overlayActive: false },
};

// ゲームリセット時に呼び出して状態をクリア
function resetSuitLayers() {
  const layersEl = document.getElementById('suit-reveal-layers');
  if (layersEl) layersEl.innerHTML = '';

  for (const suit of Object.keys(suitLayerState)) {
    clearTimeout(suitLayerState[suit].hideTimer);
    suitLayerState[suit].layerCount = 0;
    suitLayerState[suit].hideTimer = null;
    suitLayerState[suit].overlayActive = false;
  }

  const overlay = document.getElementById('suit-reveal-overlay');
  if (overlay) {
    overlay.className = 'suit-reveal-hidden';
  }
}

/**
 * ファウンデーションにカードが置かれたときにスーツ絵を積み上げる演出を発火
 * @param {string} suit - 'spades' | 'hearts' | 'clubs' | 'diamonds'
 * @param {string} rank - 'A' | '2' | ... | 'K'
 */
function triggerSuitLayerReveal(suit, rank) {
  const overlay = document.getElementById('suit-reveal-overlay');
  const layersEl = document.getElementById('suit-reveal-layers');
  const labelEl = document.getElementById('suit-reveal-label');
  if (!overlay || !layersEl || !labelEl) return;

  const state = suitLayerState[suit];
  const folder = SUIT_FOLDER[suit];
  const theme = SUIT_THEMES[suit];
  const fileRank = rankToFileName(rank);

  // 前の自動消去タイマーをキャンセル（再表示で延長）
  if (state.hideTimer) {
    clearTimeout(state.hideTimer);
    state.hideTimer = null;
  }

  // 現在別スートを表示中なら一旦隠す
  const currentSuitAttr = overlay.dataset.currentSuit;
  if (currentSuitAttr && currentSuitAttr !== suit) {
    // 別スートのレイヤーが表示中 → 古いレイヤーを全削除して切り替え
    layersEl.innerHTML = '';
    // 別スートのlayerCountは保持したまま（その状態は残す）
    // 今回のスートのlayerCountも保持（前回からの続き）
  }

  overlay.dataset.currentSuit = suit;

  // レイヤーを追加（このカードまでのすべてのレイヤーを描画し直す）
  // ただしすでに表示中なら新しいレイヤーだけ追加
  const rankIndex = RANK_ORDER.indexOf(fileRank);
  const targetLayerCount = rankIndex + 1; // 例: A=1, 02=2, ... K=13

  if (!state.overlayActive || currentSuitAttr !== suit) {
    // オーバーレイが非表示か別スートだった → このスートの全レイヤーを再描画
    layersEl.innerHTML = '';

    // 1〜targetLayerCount のレイヤーを追加
    for (let i = 0; i < targetLayerCount; i++) {
      const layerRank = RANK_ORDER[i];
      const imgPath = `images/cards/${folder}/card_${layerRank}.png`;
      const img = document.createElement('img');
      img.className = 'suit-layer';
      img.src = imgPath;
      img.alt = `${suit} ${layerRank}`;
      // 既存レイヤー（最新以外）はアニメーションなしで即表示
      if (i < targetLayerCount - 1) {
        img.style.animationDuration = '0s';
        img.style.opacity = '1';
        img.style.transform = 'translateY(0) scale(1)';
      }
      layersEl.appendChild(img);
    }
  } else {
    // 同じスートの続き → 最新のレイヤーだけ追加
    const imgPath = `images/cards/${folder}/card_${fileRank}.png`;
    const img = document.createElement('img');
    img.className = 'suit-layer';
    img.src = imgPath;
    img.alt = `${suit} ${rank}`;
    layersEl.appendChild(img);
  }

  state.layerCount = targetLayerCount;
  state.overlayActive = true;

  // ラベルを更新
  const rankMessages = {
    'A':  `${theme.emoji} Ace`,
    '02': `${theme.emoji} 2`,
    '03': `${theme.emoji} 3`,
    '04': `${theme.emoji} 4`,
    '05': `${theme.emoji} 5`,
    '06': `${theme.emoji} 6`,
    '07': `${theme.emoji} 7`,
    '08': `${theme.emoji} 8`,
    '09': `${theme.emoji} 9`,
    '10': `${theme.emoji} 10`,
    'J':  `${theme.emoji} Jack`,
    'Q':  `${theme.emoji} Queen`,
    'K':  `${theme.emoji} King — Complete! 🎉`,
  };
  labelEl.textContent = rankMessages[fileRank] || `${theme.emoji} ${rank}`;
  labelEl.style.color = theme.primary;

  // オーバーレイをアクティブ化（CSSトランジションで表示）
  overlay.classList.remove('suit-reveal-hidden');
  // 1フレーム後にactiveクラスを付与（トランジション発火のため）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add('suit-reveal-active');
    });
  });

  // Kが完成したら長め表示 + card_all.pngを最上位に追加
  const displayDuration = (rank === 'K') ? 4000 : 2200;

  if (rank === 'K') {
    // card_all.png（完成絵）を最上レイヤーとして追加
    setTimeout(() => {
      const allImg = document.createElement('img');
      allImg.className = 'suit-layer';
      allImg.src = `images/cards/${folder}/card_all.png`;
      allImg.alt = `${suit} complete`;
      allImg.style.filter =
        `drop-shadow(0 0 20px ${theme.primary}) drop-shadow(0 0 40px ${theme.secondary})`;
      layersEl.appendChild(allImg);
    }, 400);
  }

  // 一定時間後に自動フェードアウト
  state.hideTimer = setTimeout(() => {
    overlay.classList.remove('suit-reveal-active');
    overtime(() => {
      overlay.classList.add('suit-reveal-hidden');
      state.overlayActive = false;
      state.hideTimer = null;
    }, 350);
  }, displayDuration);
}

// setTimeout のラッパー（オーバーレイフェードアウト後のクラス切り替え用）
function overtime(fn, ms) {
  return setTimeout(fn, ms);
}

