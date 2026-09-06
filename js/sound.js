// ============================================================
//  sound.js - Sound On/Off shared module for all pages
//
//  - Shows a floating on-screen button (bottom-right) with no HTML changes needed
//  - The on/off setting is saved to localStorage and shared across all pages
//  - Mutes both BGM (<audio> elements) and SE (Web Audio API synthesized sounds)
//
//  How other JS files use this:
//    - Where SE code does `xxx.connect(ctx.destination)`, change it to
//      `xxx.connect(Sound_getDestination(ctx))`
//      (this gives each AudioContext a master volume that can be muted at once)
//    - When creating BGM with `new Audio(...)`, call
//      `Sound_registerBgmAudio(audio)` right after
//
//  Load this file right after js/cards.js and js/save.js, and before each
//  page's own script (it depends on save.js's SaveData_get/patch).
// ============================================================

(function () {

  var SOUND_SETTINGS_DEFAULTS = { on: true };

  function hasSaveData() {
    return typeof SaveData_get === 'function' && typeof SaveData_patch === 'function';
  }

  function Sound_isOn() {
    if (!hasSaveData()) return true;
    return SaveData_get('settings', SOUND_SETTINGS_DEFAULTS).on !== false;
  }

  function persist(on) {
    if (hasSaveData()) SaveData_patch('settings', { on: !!on });
  }

  // ------------------------------------------------------------
  //  AudioContext: master gain used instead of destination directly
  // ------------------------------------------------------------

  var soundContexts = [];
  var soundMasterGains = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;

  function Sound_getDestination(ctx) {
    if (!ctx) return ctx;
    if (soundContexts.indexOf(ctx) === -1) soundContexts.push(ctx);
    var gain = soundMasterGains ? soundMasterGains.get(ctx) : ctx.__soundMasterGain;
    if (!gain) {
      gain = ctx.createGain();
      gain.gain.value = Sound_isOn() ? 1 : 0;
      gain.connect(ctx.destination);
      if (soundMasterGains) soundMasterGains.set(ctx, gain);
      else ctx.__soundMasterGain = gain;
    }
    return gain;
  }

  // ------------------------------------------------------------
  //  BGM <audio> element registration
  // ------------------------------------------------------------

  var soundBgmAudios = [];

  function Sound_registerBgmAudio(audio) {
    if (!audio || soundBgmAudios.indexOf(audio) !== -1) return;
    soundBgmAudios.push(audio);
    audio.muted = !Sound_isOn();
  }

  // ------------------------------------------------------------
  //  Toggle on/off
  // ------------------------------------------------------------

  function applyToAll(on) {
    soundContexts.forEach(function (ctx) {
      var gain = soundMasterGains ? soundMasterGains.get(ctx) : ctx.__soundMasterGain;
      if (!gain) return;
      try {
        gain.gain.setValueAtTime(on ? 1 : 0, ctx.currentTime);
      } catch (e) {
        gain.gain.value = on ? 1 : 0;
      }
    });
    soundBgmAudios.forEach(function (audio) {
      audio.muted = !on;
    });
  }

  function Sound_setOn(on) {
    on = !!on;
    persist(on);
    applyToAll(on);
    updateButtonUI(on);
    document.dispatchEvent(new CustomEvent('soundtoggle', { detail: { on: on } }));
  }

  function Sound_toggle() {
    var next = !Sound_isOn();
    Sound_setOn(next);
    return next;
  }

  // ------------------------------------------------------------
  //  Toggle button UI (fixed bottom-right, shared across all pages)
  // ------------------------------------------------------------

  var btnEl = null;

  function updateButtonUI(on) {
    if (!btnEl) return;
    btnEl.textContent = on ? '🔊' : '🔇';
    btnEl.setAttribute('aria-pressed', String(!on));
    btnEl.setAttribute('aria-label', on ? 'サウンドON（タップでOFFにする）' : 'サウンドOFF（タップでONにする）');
    btnEl.title = on ? 'サウンド: ON' : 'サウンド: OFF';
    btnEl.classList.toggle('sound-toggle-btn--off', !on);
  }

  function injectStyle() {
    if (document.getElementById('sound-toggle-style')) return;
    var style = document.createElement('style');
    style.id = 'sound-toggle-style';
    style.textContent = [
      '#sound-toggle-btn{',
      '  position:fixed;',
      '  right:14px;',
      '  bottom:14px;',
      '  bottom:calc(14px + env(safe-area-inset-bottom, 0px));',
      '  width:46px;height:46px;',
      '  border-radius:50%;',
      '  border:1px solid rgba(212,175,55,0.45);',
      '  background:rgba(13,17,23,0.82);',
      '  color:#f5d060;',
      '  font-size:20px;line-height:1;',
      '  display:flex;align-items:center;justify-content:center;',
      '  cursor:pointer;',
      '  z-index:2147483000;',
      '  box-shadow:0 4px 16px rgba(0,0,0,0.45);',
      '  -webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);',
      '  transition:transform .15s ease, border-color .15s ease, opacity .15s ease;',
      '  user-select:none;-webkit-tap-highlight-color:transparent;',
      '  padding:0;',
      '}',
      '#sound-toggle-btn:hover{transform:scale(1.08);border-color:rgba(212,175,55,0.85);}',
      '#sound-toggle-btn:active{transform:scale(0.94);}',
      '#sound-toggle-btn.sound-toggle-btn--off{color:#8b98b8;border-color:rgba(255,255,255,0.18);opacity:.85;}',
      '@media (max-width:480px){',
      '  #sound-toggle-btn{width:42px;height:42px;font-size:18px;right:10px;bottom:10px;',
      '    bottom:calc(10px + env(safe-area-inset-bottom, 0px));}',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function Sound_initToggleButton() {
    if (btnEl || document.getElementById('sound-toggle-btn')) return;
    injectStyle();

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'sound-toggle-btn';
    document.body.appendChild(btn);
    btnEl = btn;

    btn.addEventListener('click', function () {
      Sound_toggle();
    });

    updateButtonUI(Sound_isOn());
    applyToAll(Sound_isOn());
  }

  window.Sound_isOn = Sound_isOn;
  window.Sound_setOn = Sound_setOn;
  window.Sound_toggle = Sound_toggle;
  window.Sound_getDestination = Sound_getDestination;
  window.Sound_registerBgmAudio = Sound_registerBgmAudio;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', Sound_initToggleButton);
  } else {
    Sound_initToggleButton();
  }

})();
