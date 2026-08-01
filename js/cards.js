'use strict';

// ============================================================
//  cards.js — カード共通データ（パワー）
//  各カード（スート × ランク、52枚）に設定された「パワー」の値。
//  ゲーム内の得点計算など、全ゲーム共通で参照する一元データ。
//
//  今後、スートやランクごとにパワーの数値を調整したくなったら、
//  このファイルの数値だけを書き換えれば全ゲームに反映される。
// ============================================================

const CARD_POWERS = {
  spades:   { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13 },
  hearts:   { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13 },
  clubs:    { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13 },
  diamonds: { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13 },
};

/** 指定したスート・ランクのカードのパワーを取得する（未設定時は0） */
function getCardPower(suit, rank) {
  if (!CARD_POWERS[suit]) return 0;
  const v = CARD_POWERS[suit][rank];
  return typeof v === 'number' ? v : 0;
}

// ============================================================
//  カードの所持状態（グレー / カラー）
//  プレイヤーはデフォルトで全カードのグレー版（A000_card）を所持している。
//  ガチャでカラー版（A001_card）を引くと Collection に記録され、
//  以後そのカードは自動的にカラーでデッキに使われる。
//  カラー版はグレー版の2倍のパワーを持つ。
// ============================================================

const CARD_FOLDER_GRAY  = 'A000_card';
const CARD_FOLDER_COLOR = 'A001_card';
const CARD_COLOR_POWER_MULTIPLIER = 2;

/** 指定したカードがカラー版として所持済みかどうか（save.js の Collection API に委譲） */
function isCardColorOwned(suit, rank) {
  return (typeof Collection_isOwned === 'function') ? Collection_isOwned(suit, rank) : false;
}

/** 所持状態に応じた画像フォルダ名（A000_card / A001_card）を返す */
function getCardImageFolder(suit, rank) {
  return isCardColorOwned(suit, rank) ? CARD_FOLDER_COLOR : CARD_FOLDER_GRAY;
}

/** 所持状態を反映したカード画像パスを返す（ゲーム内の手札・場札表示用） */
function getCardImagePath(suit, rank) {
  return `images/cards/${suit}/${getCardImageFolder(suit, rank)}/${rank}.png`;
}

/**
 * 所持状態を反映した実効パワーを返す（カラー版はグレー版の2倍）
 * @param {string} suit
 * @param {string} rank
 * @returns {number}
 */
function getEffectiveCardPower(suit, rank) {
  const base = getCardPower(suit, rank);
  return isCardColorOwned(suit, rank) ? base * CARD_COLOR_POWER_MULTIPLIER : base;
}

// ============================================================
//  絵合わせ（ファウンデーション演出）用の素材パス
//  A000_pitc = グレーカード用の絵素材 / A001_pitc = カラーカード用の絵素材
//  そのカードが今デッキでグレーかカラーかに応じて、対応する絵素材を使う。
// ============================================================

const PIC_FOLDER_GRAY  = 'A000_pitc';
const PIC_FOLDER_COLOR = 'A001_pitc';

/** 指定したカードの絵合わせ素材フォルダ名（A000_pitc / A001_pitc）を返す */
function getCardPictureFolder(suit, rank) {
  return isCardColorOwned(suit, rank) ? PIC_FOLDER_COLOR : PIC_FOLDER_GRAY;
}

/** 指定したカードの絵合わせ素材パスを返す */
function getCardPicturePath(suit, rank) {
  return `images/cards/${suit}/${getCardPictureFolder(suit, rank)}/${rank}.png`;
}

/** そのスートの13枚すべてがカラー化済みかどうかを返す */
function isSuitFullyColorOwned(suit) {
  const ranks = Object.keys(CARD_POWERS[suit] || {});
  return ranks.length > 0 && ranks.every(r => isCardColorOwned(suit, r));
}

/**
 * スートの完成絵（all.png）のパスを返す。
 * スートの13枚全てがカラー化済みならカラー版、そうでなければグレー版。
 */
function getSuitCompletePicturePath(suit) {
  const folder = isSuitFullyColorOwned(suit) ? PIC_FOLDER_COLOR : PIC_FOLDER_GRAY;
  return `images/cards/${suit}/${folder}/all.png`;
}

// ============================================================
//  スート完成絵の動的合成
//  「あらかじめ用意された1枚の all.png」ではなく、
//  現在デッキにセットされている13枚それぞれの絵（グレー/カラーは
//  所持状態通り）を実際に重ねて表示する。
//  ※ Canvas+toDataURL()は file:// で開いた場合にセキュリティエラーで
//    失敗することがあるため使わず、<img>を重ねて表示するDOM方式にする。
// ============================================================

const RANKS_FOR_COMPOSITE = ['2', '3', '4', 'J', 'Q', 'K', '5', '6', '7', '8', '9', '10', 'A'];

/**
 * 指定したコンテナの中に、そのスートの13枚（グレー/カラーは所持状態通り）を
 * 指定された順（下から: 2,3,4,J,Q,K,5,6,7,8,9,10,A）に重ねた<img>レイヤーを描画する。
 * コンテナは position:relative かつサイズが決まっている要素を渡すこと。
 * @param {HTMLElement} container
 * @param {string} suit
 */
function renderSuitCompositeLayers(container, suit) {
  if (!container) return;
  // 既存のレイヤーを削除してから描画し直す
  container.querySelectorAll('.suit-composite-layer').forEach((el) => el.remove());

  RANKS_FOR_COMPOSITE.forEach((rank) => {
    const img = document.createElement('img');
    img.className = 'suit-composite-layer';
    img.src = getCardPicturePath(suit, rank);
    img.alt = '';
    container.appendChild(img);
  });
}

/** 指定したコンテナから合成レイヤーを取り除く */
function clearSuitCompositeLayers(container) {
  if (!container) return;
  container.querySelectorAll('.suit-composite-layer').forEach((el) => el.remove());
}
