// ============================================================
//  debug.js — 管理用デバッグページ
//  コインの追加・カードコレクションの変更・記録リセットなど、
//  動作確認に必要な操作をまとめたページ。
// ============================================================

'use strict';

const DEBUG_SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
const DEBUG_RANKS  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const DEBUG_SUIT_INFO = {
  spades:   { symbol: '♠', name: 'Spades'   },
  hearts:   { symbol: '♥', name: 'Hearts'   },
  clubs:    { symbol: '♣', name: 'Clubs'    },
  diamonds: { symbol: '♦', name: 'Diamonds' },
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof SaveData_get !== 'function') {
    console.warn('[Debug] save.js が読み込まれていません');
    return;
  }

  renderAll();
  bindEvents();
});

// ============================================================
//  再描画
// ============================================================

function renderAll() {
  updateCoinDisplay();
  renderCoinCurrent();
  renderCollectionSection();
  renderSolitaireStats();
  renderJsonView();
}

/** ヘッダーのコイン所持数表示を更新する */
function updateCoinDisplay() {
  const el = document.getElementById('coin-amount');
  if (el && typeof Wallet_getCoins === 'function') {
    el.textContent = Wallet_getCoins().toLocaleString();
  }
}

function renderCoinCurrent() {
  const el = document.getElementById('debug-coin-current');
  if (el && typeof Wallet_getCoins === 'function') {
    el.textContent = Wallet_getCoins().toLocaleString();
  }
}

function renderCollectionSection() {
  renderCollectionProgress();
  renderSuitRows();
  renderCardGrid();
}

function renderCollectionProgress() {
  const el = document.getElementById('debug-collection-progress');
  if (!el) return;
  let owned = 0;
  DEBUG_SUITS.forEach(suit => {
    DEBUG_RANKS.forEach(rank => {
      if (Collection_isOwned(suit, rank)) owned++;
    });
  });
  el.textContent = `${owned} / 52`;
}

function renderSuitRows() {
  const container = document.getElementById('debug-suit-rows');
  if (!container) return;
  container.innerHTML = '';

  DEBUG_SUITS.forEach(suit => {
    const info = DEBUG_SUIT_INFO[suit];
    const ownedCount = DEBUG_RANKS.filter(r => Collection_isOwned(suit, r)).length;

    const row = document.createElement('div');
    row.className = 'debug-suit-row';
    row.innerHTML = `
      <span class="debug-suit-symbol">${info.symbol}</span>
      <span class="debug-suit-progress">${info.name}: ${ownedCount} / 13</span>
    `;

    const unlockBtn = document.createElement('button');
    unlockBtn.className = 'debug-btn';
    unlockBtn.textContent = 'このスートを全カラー化';
    unlockBtn.addEventListener('click', () => {
      DEBUG_RANKS.forEach(r => Collection_unlock(suit, r));
      renderCollectionSection();
      showToast(`${info.name} を全てカラー化しました`);
    });

    const lockBtn = document.createElement('button');
    lockBtn.className = 'debug-btn debug-btn-danger';
    lockBtn.textContent = 'グレーに戻す';
    lockBtn.addEventListener('click', () => {
      DEBUG_RANKS.forEach(r => Collection_lock(suit, r));
      renderCollectionSection();
      showToast(`${info.name} をグレーに戻しました`);
    });

    row.appendChild(unlockBtn);
    row.appendChild(lockBtn);
    container.appendChild(row);
  });
}

function renderCardGrid() {
  const grid = document.getElementById('debug-card-grid');
  if (!grid) return;
  grid.innerHTML = '';

  DEBUG_SUITS.forEach(suit => {
    DEBUG_RANKS.forEach(rank => {
      const owned = Collection_isOwned(suit, rank);

      const cell = document.createElement('div');
      cell.className = 'debug-cell' + (owned ? ' owned' : '');
      cell.title = `${suit} ${rank}（クリックで切り替え）`;

      const img = document.createElement('img');
      img.src = (typeof getCardImagePath === 'function') ? getCardImagePath(suit, rank) : '';
      img.alt = `${rank} of ${suit}`;
      img.loading = 'lazy';
      cell.appendChild(img);

      if (owned) {
        const check = document.createElement('div');
        check.className = 'debug-cell-check';
        check.textContent = '✓';
        cell.appendChild(check);
      }

      cell.addEventListener('click', () => {
        if (Collection_isOwned(suit, rank)) {
          Collection_lock(suit, rank);
        } else {
          Collection_unlock(suit, rank);
        }
        renderCollectionSection();
      });

      grid.appendChild(cell);
    });
  });
}

function renderSolitaireStats() {
  const container = document.getElementById('debug-solitaire-stats');
  if (!container || typeof Solitaire_getRecord !== 'function') return;

  const rec = Solitaire_getRecord();
  const stats = [
    { label: 'ハイスコア',   value: rec.highScore.toLocaleString() },
    { label: '最少手数',     value: rec.bestMoves !== null ? `${rec.bestMoves} 手` : '—' },
    { label: 'プレイ回数',   value: rec.gamesPlayed.toLocaleString() },
    { label: 'クリア回数',   value: rec.gamesWon.toLocaleString() },
  ];

  container.innerHTML = stats.map(s => `
    <div class="debug-stat">
      <span class="debug-stat-label">${s.label}</span>
      <span class="debug-stat-value">${s.value}</span>
    </div>
  `).join('');
}

function renderJsonView() {
  const el = document.getElementById('debug-json-view');
  if (!el || typeof SaveData_getAll !== 'function') return;
  el.value = JSON.stringify(SaveData_getAll(), null, 2);
}

// ============================================================
//  イベント
// ============================================================

function bindEvents() {
  // コイン追加（固定額）
  document.querySelectorAll('[data-add-coins]').forEach(btn => {
    btn.addEventListener('click', () => {
      const amount = parseInt(btn.dataset.addCoins, 10) || 0;
      Wallet_addCoins(amount);
      renderAll();
      showToast(`🪙 ${amount.toLocaleString()} 追加しました`);
    });
  });

  // コイン追加（任意額）
  document.getElementById('debug-coin-add-custom')?.addEventListener('click', () => {
    const input = document.getElementById('debug-coin-custom');
    const amount = parseInt(input.value, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('正しい金額を入力してください', true);
      return;
    }
    Wallet_addCoins(amount);
    renderAll();
    showToast(`🪙 ${amount.toLocaleString()} 追加しました`);
  });

  // コインを指定額に設定
  document.getElementById('debug-coin-set-custom')?.addEventListener('click', () => {
    const input = document.getElementById('debug-coin-custom');
    const amount = parseInt(input.value, 10);
    if (!Number.isFinite(amount) || amount < 0) {
      showToast('正しい金額を入力してください', true);
      return;
    }
    Wallet_setCoins(amount);
    renderAll();
    showToast(`🪙 所持コインを ${amount.toLocaleString()} に設定しました`);
  });

  // コインリセット
  document.getElementById('debug-coin-reset')?.addEventListener('click', () => {
    if (!confirm('所持コインを0にリセットします。よろしいですか？')) return;
    Wallet_setCoins(0);
    renderAll();
    showToast('コインを0にリセットしました');
  });

  // 全カードカラー化
  document.getElementById('debug-unlock-all')?.addEventListener('click', () => {
    DEBUG_SUITS.forEach(suit => DEBUG_RANKS.forEach(rank => Collection_unlock(suit, rank)));
    renderCollectionSection();
    showToast('全52枚をカラー化しました');
  });

  // 全カードグレーに戻す
  document.getElementById('debug-lock-all')?.addEventListener('click', () => {
    if (!confirm('全カードのカラー所持状態をリセットし、グレーに戻します。よろしいですか？')) return;
    DEBUG_SUITS.forEach(suit => DEBUG_RANKS.forEach(rank => Collection_lock(suit, rank)));
    renderCollectionSection();
    showToast('全カードをグレーに戻しました');
  });

  // ソリティア記録リセット
  document.getElementById('debug-solitaire-reset')?.addEventListener('click', () => {
    if (!confirm('ソリティアの記録（ハイスコア・最少手数・プレイ回数など）をリセットします。よろしいですか？')) return;
    Solitaire_resetRecord();
    renderSolitaireStats();
    showToast('ソリティアの記録をリセットしました');
  });

  // JSON表示更新
  document.getElementById('debug-json-refresh')?.addEventListener('click', () => {
    renderJsonView();
    showToast('表示を更新しました');
  });

  // JSONコピー
  document.getElementById('debug-json-copy')?.addEventListener('click', async () => {
    const el = document.getElementById('debug-json-view');
    try {
      await navigator.clipboard.writeText(el.value);
      showToast('コピーしました');
    } catch (e) {
      el.select();
      document.execCommand('copy');
      showToast('コピーしました');
    }
  });

  // 全データ完全リセット
  document.getElementById('debug-full-reset')?.addEventListener('click', () => {
    if (!confirm('全てのセーブデータ（コイン・コレクション・各ゲームの記録）を完全に削除します。この操作は取り消せません。よろしいですか？')) return;
    SaveData_reset();
    renderAll();
    showToast('全セーブデータをリセットしました');
  });
}

// ============================================================
//  トースト通知
// ============================================================

let toastTimer = null;

function showToast(message, isError) {
  let toast = document.getElementById('debug-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'debug-toast';
    toast.className = 'debug-toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.background = isError ? 'rgba(248,113,113,0.95)' : '';
  toast.style.color = isError ? '#2a0a0a' : '';

  clearTimeout(toastTimer);
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}
