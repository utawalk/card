// ============================================================
//  save.js — Player Data Save/Load Module (localStorage)
//
//  将来の全ゲームで共有できる汎用セーブシステム。
//  データ構造:
//  {
//    "solitaire": {
//      "highScore":  number,   // 最高スコア
//      "gamesPlayed": number,  // プレイ回数
//      "gamesWon":   number,   // クリア回数
//      "bestMoves":  number|null  // 最少手数（nullは未クリア）
//    },
//    "wallet": {
//      "coins": number   // 全ゲーム共通のコイン所持数
//    },
//    // 将来のゲームもここに追加
//    "sevens":  { ... },
//    "memory":  { ... },
//  }
// ============================================================

const SAVE_KEY = 'card_games_save_v1';

// ------------------------------------------------------------
//  型定義 (JSDoc)
// ------------------------------------------------------------
/**
 * @typedef {Object} SolitaireRecord
 * @property {number}       highScore
 * @property {number}       gamesPlayed
 * @property {number}       gamesWon
 * @property {number|null}  bestMoves
 */

// ------------------------------------------------------------
//  内部ヘルパー
// ------------------------------------------------------------

function _load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[Save] Failed to load:', e);
    return {};
  }
}

function _write(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('[Save] Failed to write:', e);
    return false;
  }
}

// ------------------------------------------------------------
//  汎用 API
// ------------------------------------------------------------

/**
 * セーブデータ全体を取得する
 * @returns {Object}
 */
function SaveData_getAll() {
  return _load();
}

/**
 * ゲームキーのセーブデータを取得する
 * @param {string} gameKey  例: 'solitaire'
 * @param {Object} defaults  デフォルト値
 * @returns {Object}
 */
function SaveData_get(gameKey, defaults = {}) {
  const all = _load();
  return Object.assign({}, defaults, all[gameKey] || {});
}

/**
 * ゲームキーのセーブデータを上書き（部分更新）する
 * @param {string} gameKey
 * @param {Object} patch  更新するフィールドのみ渡す
 */
function SaveData_patch(gameKey, patch) {
  const all = _load();
  all[gameKey] = Object.assign({}, all[gameKey] || {}, patch);
  _write(all);
}

/**
 * セーブデータを完全にリセットする（デバッグ用）
 */
function SaveData_reset() {
  localStorage.removeItem(SAVE_KEY);
}

// ------------------------------------------------------------
//  Solitaire 専用 API
// ------------------------------------------------------------

/** デフォルトのソリティア記録 */
const SOLITAIRE_DEFAULTS = {
  highScore:   0,
  gamesPlayed: 0,
  gamesWon:    0,
  bestMoves:   null,
};

/**
 * ソリティアの記録を取得する
 * @returns {SolitaireRecord}
 */
function Solitaire_getRecord() {
  return SaveData_get('solitaire', SOLITAIRE_DEFAULTS);
}

/**
 * ゲーム開始時に呼ぶ（プレイ回数をインクリメント）
 */
function Solitaire_onGameStart() {
  const rec = Solitaire_getRecord();
  SaveData_patch('solitaire', { gamesPlayed: rec.gamesPlayed + 1 });
}

/**
 * ゲームクリア時に呼ぶ。ハイスコアや最少手数を自動更新し、コインを付与する。
 * @param {number} score   今回のスコア
 * @param {number} moves   今回の手数
 * @returns {{ newHighScore: boolean, newBestMoves: boolean, coinsEarned: number, coinsTotal: number }}
 */
function Solitaire_onGameWin(score, moves) {
  const rec = Solitaire_getRecord();

  const newHighScore = score > rec.highScore;
  const newBestMoves = rec.bestMoves === null || moves < rec.bestMoves;

  SaveData_patch('solitaire', {
    gamesWon:  rec.gamesWon + 1,
    highScore: newHighScore ? score : rec.highScore,
    bestMoves: newBestMoves ? moves : rec.bestMoves,
  });

  // スコアに応じてコインを付与（新記録ならボーナス）
  const coinsEarned = Math.max(20, Math.round(score / 10))
    + (newHighScore ? 20 : 0)
    + (newBestMoves ? 10 : 0);
  const coinsTotal = Wallet_addCoins(coinsEarned);

  return { newHighScore, newBestMoves, coinsEarned, coinsTotal };
}

// ------------------------------------------------------------
//  コインウォレット（全ゲーム共通）
// ------------------------------------------------------------

const WALLET_DEFAULTS = { coins: 0 };

/**
 * 現在のコイン所持数を取得する
 * @returns {number}
 */
function Wallet_getCoins() {
  return SaveData_get('wallet', WALLET_DEFAULTS).coins;
}

/**
 * コインを加算する（負の値やNaNは無視）
 * @param {number} amount 付与するコイン数
 * @returns {number} 加算後の所持コイン数
 */
function Wallet_addCoins(amount) {
  const amt = Math.max(0, Math.round(amount || 0));
  const current = Wallet_getCoins();
  const next = current + amt;
  if (amt > 0) SaveData_patch('wallet', { coins: next });
  return next;
}

/**
 * コインを消費する（所持数が足りない場合は失敗する）
 * @param {number} amount 消費するコイン数
 * @returns {{ success: boolean, coinsTotal: number }}
 */
function Wallet_spendCoins(amount) {
  const amt = Math.max(0, Math.round(amount || 0));
  const current = Wallet_getCoins();
  if (amt <= 0 || current < amt) {
    return { success: false, coinsTotal: current };
  }
  const next = current - amt;
  SaveData_patch('wallet', { coins: next });
  return { success: true, coinsTotal: next };
}

// ------------------------------------------------------------
//  カードコレクション（ガチャで手に入れたカラーカードの所持状態）
//  デフォルトでは全カードがグレー（A000_card）。
//  ガチャでカラー（A001_card）を引くと、そのカードは自動的に
//  「デッキにセット」された状態＝ Collection に owned=true として記録される。
// ------------------------------------------------------------

const COLLECTION_DEFAULTS = { owned: {} };

/** スート・ランクから所持状態の管理キーを作る */
function Collection_key(suit, rank) {
  return `${suit}_${rank}`;
}

/**
 * 指定したカードがカラー版（ガチャ入手済み）かどうかを返す
 * @param {string} suit
 * @param {string} rank
 * @returns {boolean}
 */
function Collection_isOwned(suit, rank) {
  const data = SaveData_get('collection', COLLECTION_DEFAULTS);
  return !!data.owned[Collection_key(suit, rank)];
}

/**
 * 指定したカードをカラー版として解放する（＝デッキに自動セット）
 * @param {string} suit
 * @param {string} rank
 * @returns {{ alreadyOwned: boolean }} 既に持っていたか
 */
function Collection_unlock(suit, rank) {
  const data = SaveData_get('collection', COLLECTION_DEFAULTS);
  const key = Collection_key(suit, rank);
  const alreadyOwned = !!data.owned[key];
  if (!alreadyOwned) {
    const nextOwned = Object.assign({}, data.owned, { [key]: true });
    SaveData_patch('collection', { owned: nextOwned });
  }
  return { alreadyOwned };
}

/** カラー化済みカードの枚数を返す */
function Collection_getOwnedCount() {
  const data = SaveData_get('collection', COLLECTION_DEFAULTS);
  return Object.values(data.owned).filter(Boolean).length;
}

/** 所持状態の生データ（{ "spades_A": true, ... }）を返す */
function Collection_getAll() {
  return SaveData_get('collection', COLLECTION_DEFAULTS).owned;
}

/**
 * 指定したカードのカラー所持状態を解除する（デバッグ用）
 * @param {string} suit
 * @param {string} rank
 */
function Collection_lock(suit, rank) {
  const data = SaveData_get('collection', COLLECTION_DEFAULTS);
  const key = Collection_key(suit, rank);
  if (data.owned[key]) {
    const nextOwned = Object.assign({}, data.owned);
    delete nextOwned[key];
    SaveData_patch('collection', { owned: nextOwned });
  }
}

// ------------------------------------------------------------
//  デバッグ用ユーティリティ
// ------------------------------------------------------------

/**
 * 所持コインを指定した金額に直接設定する（デバッグ用）
 * @param {number} amount
 * @returns {number} 設定後の所持コイン数
 */
function Wallet_setCoins(amount) {
  const amt = Math.max(0, Math.round(amount || 0));
  SaveData_patch('wallet', { coins: amt });
  return amt;
}

/** ソリティアの記録をリセットする（デバッグ用） */
function Solitaire_resetRecord() {
  SaveData_patch('solitaire', SOLITAIRE_DEFAULTS);
}

/**
 * 手詰まり（ゲームオーバー）時に呼ぶ。クリアではないのでハイスコア等は更新しないが、
 * それまでに獲得したスコアに応じて控えめにコインを付与する。
 * @param {number} score  ゲームオーバー時点のスコア
 * @returns {{ coinsEarned: number, coinsTotal: number }}
 */
function Solitaire_onGameOver(score) {
  // クリア時（Math.max(20, score/10) 相当）よりも控えめな換算率にする
  const coinsEarned = Math.max(5, Math.round((score || 0) / 20));
  const coinsTotal = Wallet_addCoins(coinsEarned);
  return { coinsEarned, coinsTotal };
}

