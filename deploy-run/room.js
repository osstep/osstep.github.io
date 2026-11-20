'use strict';
const el = id => document.getElementById(id);
const panel = el('panel'), primary = el('primary'), solo = el('solo'), invite = el('invite');
const statusLine = el('status'), leave = el('leave');
const room = new URLSearchParams(location.hash.slice(1)).get('room');
const keys = {KeyA:1, KeyD:2, KeyW:4, KeyS:8, Space:16};
const inputs = {}, clients = new Map();
let mode = 'menu', peer, uplink, inviteUrl, pressed = 0, deadline, library;
world = newWorld();
function announce() {
  statusLine.textContent = (mode === 'solo' ? 'СОЛО' : 'ОНЛАЙН') + ' · ИГРОКОВ ' + world.players.length + '/' + colors.length;
}
function enter() {
  resetSounds(world.sounds);
  clearTimeout(deadline);
  panel.hidden = true;
  leave.hidden = false;
  document.activeElement.blur();
  announce();
}
function menu() {
  mode = 'menu'; clearTimeout(deadline);
  const previousPeer = peer;
  peer = uplink = null;
  previousPeer?.destroy();
  clients.clear(); pressed = 0;
  for (const key in inputs) delete inputs[key];
  world = newWorld(); localSlot = 0;
  panel.hidden = false; invite.hidden = leave.hidden = true;
  primary.disabled = solo.disabled = false; solo.hidden = false;
  primary.textContent = room ? 'Войти в комнату ↗' : 'Создать комнату ↗';
  el('title').innerHTML = 'DEPLOY<br><em>RUN</em>';
  el('message').innerHTML = 'Уклоняйся от залпов ИИ-дронов.<br>Защити релиз и победи босса chats в проде.';
  statusLine.textContent = room ? '● ПРИГЛАШЕНИЕ В КОМНАТУ' : '● АРКАДА ГОТОВА';
}
function loadPeer() {
  if (!library) library = new Promise((resolve,reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
    script.onload = resolve;
    script.onerror = () => { library = null; script.remove(); reject(); };
    document.head.append(script);
  });
  return library;
}
function fail(message) {
  menu(); statusLine.textContent = message;
}
async function online() {
  mode = 'connecting'; primary.disabled = solo.disabled = true;
  statusLine.textContent = 'Подключение к комнате…';
  deadline = setTimeout(() => fail('Время подключения истекло. Проверьте сеть и ссылку.'),20000);
  try {
    await loadPeer();
    if (mode !== 'connecting') return;
    const session = peer = new Peer();
    session.on('error', () => {
      if(peer === session && mode !== 'host') fail('Соединение недоступно. Проверьте ссылку или попробуйте соло.');
    });
    session.on('disconnected', () => {
      if(peer === session && mode === 'host') statusLine.textContent = 'Сервис приглашений отключился. Для новых участников пересоздайте комнату.';
    });
    session.on('connection', c => {
      if (mode !== 'host' || peer !== session) { c.close(); return; }
      c.on('open', () => {
        if(peer !== session) return;
        const slot = colors.findIndex((_, i) => i > 0 && !clients.has(i));
        if (slot < 0) { c.send({type:'full'}); setTimeout(()=>c.close(),300); return; }
        clients.set(slot,c);
        world.players.push(player(slot,world.players[0].x));
        c.send({type:'welcome',slot,world}); announce();
        c.on('data', mask => {
          if (clients.get(slot) === c && Number.isInteger(mask)) inputs[slot] = mask & 31;
        });
        function remove() {
          if(clients.get(slot) !== c) return;
          clients.delete(slot); delete inputs[slot];
          world.players = world.players.filter(p=>p.slot!==slot); announce();
        }
        c.on('close',remove); c.on('error',remove);
      });
    });
    session.on('open', id => {
      if(peer !== session) return;
      if(!room) {
        mode = 'host'; inviteUrl = new URL(location.href);
        inviteUrl.hash = new URLSearchParams({room:id});
        invite.hidden = false; enter(); return;
      }
      uplink = session.connect(room,{reliable:true});
      uplink.on('data', msg => {
        if(peer !== session || !msg) return;
        if(msg.type === 'full') return fail('Комната заполнена. Все восемь мест заняты.');
        if(msg.type === 'welcome') {
          world = msg.world; localSlot = msg.slot; mode = 'guest'; enter();
        } else if(msg.type === 'state' && mode === 'guest') {
          const ended = world.phase !== 'play';
          const count = world.players.length;
          world = msg.world;
          if(ended && world.phase === 'play') enter();
          if(count !== world.players.length) announce();
        }
      });
      const disconnected = () => { if(peer === session) fail('Связь с ведущим потеряна. Можно войти снова.'); };
      uplink.on('close',disconnected); uplink.on('error',disconnected);
    });
  } catch { fail('Не удалось загрузить сетевой модуль. Попробуйте снова или играйте соло.'); }
}
function restart() {
  const slots = world.players.map(p=>p.slot);
  world = newWorld(); world.players = slots.map(slot=>player(slot)); enter();
}
primary.onclick = () => {
  unlockAudio();
  if (mode === 'menu') online();
  else restart();
};
solo.onclick = () => { unlockAudio(); mode = 'solo'; enter(); };
leave.onclick = () => menu();
invite.onclick = async () => {
  try { await navigator.clipboard.writeText(inviteUrl.href); statusLine.textContent = 'Ссылка скопирована · отправьте её коллегам'; }
  catch { window.prompt('Ссылка для коллег',inviteUrl.href); }
  invite.blur();
};
function input(mask) {
  pressed = mask;
  if(mode === 'guest' && uplink?.open) uplink.send(mask);
  else inputs[0] = mask;
}
addEventListener('keydown', e => {
  if(!panel.hidden || !keys[e.code] || e.target.tagName === 'BUTTON') return;
  e.preventDefault();
  if(!e.repeat) input(pressed | keys[e.code]);
});
addEventListener('keyup', e => { if(keys[e.code]) input(pressed & ~keys[e.code]); });
addEventListener('blur', () => input(0));
addEventListener('pagehide', menu);
function finish() {
  panel.hidden = false; input(0);
  el('title').textContent = world.phase === 'won' ? 'В проде!' : 'Откат!';
  el('message').textContent = world.phase === 'won' ? 'Команда закрыла бэклог и доставила релиз.' : 'Здоровье команды закончилось.';
  solo.hidden = true; primary.disabled = mode === 'guest';
  primary.textContent = mode === 'guest' ? 'Ждём ведущего…' : 'Ещё один забег';
}
menu();
let previous = performance.now(), broadcastAt = 0;
function frame(now) {
  const active = ['host','guest','solo'].includes(mode);
  if(mode === 'host' || mode === 'solo') step(Math.min(.05,(now-previous)/1000),inputs);
  if(mode === 'host' && now >= broadcastAt) {
    for(const c of clients.values()) if(c.open && c.bufferSize < 2) c.send({type:'state',world});
    broadcastAt = now + 50;
  }
  if(active) playSounds(world.sounds);
  if(active && world.phase !== 'play' && panel.hidden) finish();
  draw(now/1000,active); previous = now; requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
