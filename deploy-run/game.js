'use strict';
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const colors = ['#bdf978', '#58d9ec', '#ffbf74', '#eaa6f9', '#ff8493', '#83a8ff', '#fff18b', '#67efb1'];
const sectors = ['БЭКЛОГ', 'СТЕЙДЖИНГ', 'ПРОД'];
const sectorServices = [
  ['gateway', 'users', 'drafts', 'guides', 'topics', 'materials'],
  ['attendance', 'progress', 'reports', 'grade-book', 'ai-tools', 'achievements'],
  ['email-channel', 'contact-book', 'messages', 'message-read-status', 'notification-center', 'ai-chat-orchestrator'],
];
const sectorLength = 1420;
const limit = sectorLength * sectors.length;
const weapons = {
  pistol:  {name:'Пистолет', color:'#f6ffa5', interval:.16, speed:270, life:1.15, damage:1, spread:[0]},
  smg:     {name:'Автомат', color:'#85f2cf', interval:.10, speed:320, life:1, damage:1, spread:[0]},
  shotgun: {name:'Дробовик', color:'#ffb276', interval:.42, speed:270, life:.72, damage:1, spread:[-.16,0,.16]},
  rail:    {name:'Рельсотрон', color:'#b9a5ff', interval:.60, speed:520, life:1.3, damage:4, spread:[0]},
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
let world, localSlot = 0;
function player(slot, x = 34) {
  return {slot, x, y: 178 + slot * 14, face: 1, cooldown: 0, weapon: 'pistol', shield: 0};
}
function newWorld() {
  const enemies = [], pickups = [];
  for (let sector = 0; sector < sectors.length; sector++) {
    const drops = ['smg','shotgun','rail','smg','shotgun','rail'];
    drops.forEach((weapon, i) => pickups.push({
      weapon, sector, x: sector * sectorLength + 125 + i * 225, y: 178 + (i * 37) % 90,
    }));
    for (let i = 0; i < sectorServices[sector].length; i++) {
      enemies.push({name: sectorServices[sector][i], x: 215 + sector * sectorLength + i * 208, y: 175 + (i * 29) % 95,
        drone: i % 2 === 1, hp: i % 2 === 1 ? 2 : 3, sector, cooldown: 1 + i * .17, charge: 0});
    }
  }
  return {players: [player(0)], enemies, pickups, shots: [], bolts: [], strikes: [], effects: [], sounds: {shot:0, hit:0, hurt:0, alarm:0, boss:0}, ambushed: false, bossSpawned: false, reinforcementsSent: 0, hp: 12, shield: 0, sector: 0, phase: 'play'};
}
// Each extra teammate adds four service replicas to the current sector.
function reinforcementsLeft() {
  if (world.bossSpawned) return 0;
  return Math.max(0, 4 * (world.players.length - 1) - world.reinforcementsSent);
}
function reinforce() {
  const remaining = reinforcementsLeft();
  if (!remaining) return;
  const sector = world.sector;
  const active = world.enemies.filter(e => e.sector === sector).length;
  if (active > world.players.length) return;
  const front = Math.max(...world.players.map(p => p.x));
  const end = (sector + 1) * sectorLength;
  const batch = Math.min(remaining, world.players.length);
  for (let i = 0; i < batch; i++) {
    const n = world.reinforcementsSent++;
    const x = Math.min(front + 160 + i * 38, end - 16 - i * 17);
    const y = 167 + (n * 41) % 110;
    const name = sectorServices[sector][n % sectorServices[sector].length];
    world.enemies.push({name, x, y, drone:true, hp:2, sector, cooldown:1.1 + .16*i, charge:0});
    burst(x, y-10, '#cb9eff');
  }
}
function ambush() {
  if (world.ambushed || world.bossSpawned) return;
  const sector = world.sector;
  const front = Math.max(...world.players.map(p => p.x));
  if (front < sector * sectorLength + 360) return;
  const rear = Math.min(...world.players.map(p => p.x));
  const anchor = rear > 130 ? rear : front;
  const count = Math.ceil(world.players.length / 2);
  for (let i = 0; i < count; i++) {
    const x = Math.max(12, anchor - 100 - i * 22);
    const y = 175 + (sector * 37 + i * 31) % 98;
    world.enemies.push({name:sectorServices[sector][i], x, y, sector, drone:true,
      hp:2, cooldown:1, charge:0, arrival:1.4});
  }
  world.ambushed = true;
  world.sounds.alarm++;
}
function burst(x, y, color, size = 10) {
  world.effects.push({x, y, color, size, life: .32});
}
function hurt(p, damage) {
  if (p.shield > 0 || world.shield > 0 || world.phase !== 'play') return;
  world.hp = Math.max(0, world.hp - damage);
  p.shield = 1.2;
  world.shield = .25;
  world.sounds.hurt++;
  burst(p.x, p.y - 9, '#ff886c', 20);
  if (!world.hp) world.phase = 'lost';
}
function attack(e, target, distance, dt) {
  if (e.charge > 0) {
    e.charge = Math.max(0, e.charge - dt);
    if (e.charge > 0) return;
    const fury = e.boss && e.hp <= e.maxHp / 2;
    const angles = e.boss ? (fury ? [-.4,-.2,0,.2,.4] : [-.24,0,.24]) : [0];
    for (const offset of angles) {
      const angle = e.aim + offset, speed = (e.boss ? 115 : 87) + 4 * (world.players.length - 1);
      world.bolts.push({x:e.x, y:e.y-10, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed, life:3.4, damage:e.boss?2:1});
    }
    e.cooldown = (e.boss ? (fury ? .8 : 1.6) : 2.7) / (1 + .10 * (world.players.length - 1));
    burst(e.x, e.y-10, '#ff9a74', 7);
    return;
  }
  if (distance > (e.boss ? 460 : 245)) return;
  e.cooldown -= dt;
  if (e.cooldown <= 0) {
    e.aim = Math.atan2(target.y - e.y, target.x - e.x);
    e.charge = e.boss ? .85 : .55;
  }
}
function bossStrikes(boss, dt) {
  const team = world.players;
  if (team.length < 2) return;
  boss.strikeTimer -= dt;
  if (boss.strikeTimer > 0) return;
  // Snapshot the target positions so moving after the warning evades the strike.
  const count = Math.ceil(team.length / 3);
  for (let i = 0; i < count; i++) {
    const target = team[(boss.targetIndex + i) % team.length];
    world.strikes.push({x:target.x, y:target.y, delay:1.05});
  }
  boss.targetIndex = (boss.targetIndex + count) % team.length;
  boss.strikeTimer = boss.hp > boss.maxHp / 2 ? 3.4 : 2.4;
}
function updateStrikes(dt) {
  for (const strike of world.strikes) {
    strike.delay -= dt;
    if (strike.delay > 0) continue;
    burst(strike.x, strike.y, '#ff966b', 31);
    for (const p of world.players) {
      if (Math.hypot(p.x-strike.x, p.y-strike.y) <= 31) hurt(p, 2);
    }
  }
  world.strikes = world.strikes.filter(s => s.delay > 0);
}
function summonBoss() {
  const hp = 20 + (world.players.length - 1) * 18;
  world.bossSpawned = true;
  world.sounds.boss++;
  world.enemies.push({name: 'chats', boss:true, sector:2, x:limit-110, y:216, hp, maxHp:hp, targetIndex:0, strikeTimer:.5, cooldown:1, charge:0});
  burst(limit-110, 200, '#ff897a', 28);
}
function step(dt, inputs) {
  if (world.phase !== 'play') return;
  const w = world;
  w.shield = Math.max(0, w.shield - dt);
  for (const fx of w.effects) fx.life -= dt;
  w.effects = w.effects.filter(fx => fx.life > 0);
  ambush();
  reinforce();
  const gate = (w.sector + 1) * sectorLength;
  for (const p of w.players) {
    p.shield = Math.max(0, p.shield - dt);
    const keys = inputs[p.slot] || 0;
    const dx = Number(!!(keys & 2)) - Number(!!(keys & 1));
    const dy = Number(!!(keys & 8)) - Number(!!(keys & 4));
    const speed = 98 * dt / (dx && dy ? Math.SQRT2 : 1);
    p.x = clamp(p.x + dx * speed, 10, gate);
    p.y = clamp(p.y + dy * speed, 163, 281);
    if (dx) p.face = dx;
    const pickup = w.pickups.findIndex(item => item.sector === w.sector && Math.hypot(item.x-p.x, item.y-p.y) < 15);
    if (pickup >= 0) {
      const [item] = w.pickups.splice(pickup, 1);
      p.weapon = item.weapon;
      burst(p.x, p.y-8, weapons[p.weapon].color, 15);
    }
    p.cooldown -= dt;
    if ((keys & 16) && p.cooldown <= 0) {
      w.sounds.shot++;
      const gun = weapons[p.weapon];
      for (const angle of gun.spread) {
        w.shots.push({x:p.x+8*p.face, y:p.y-8, vx:p.face*gun.speed*Math.cos(angle),
          vy:gun.speed*Math.sin(angle), life:gun.life, weapon:p.weapon});
      }
      p.cooldown = gun.interval;
    }
  }
  for (const e of w.enemies) {
    if (e.sector !== w.sector || e.hp <= 0) continue;
    if (e.arrival > 0) { e.arrival -= dt; continue; }
    const dist = p => Math.hypot(p.x - e.x, p.y - e.y);
    const target = w.players.reduce((a, b) => dist(a) < dist(b) ? a : b);
    const d = dist(target);
    if (e.boss) bossStrikes(e, dt);
    if (e.drone || e.boss) attack(e, target, d, dt);
    if ((e.drone || e.boss) && !e.charge && d < 460 && d > (e.boss ? 70 : 1)) {
      e.x += (target.x - e.x) / d * 28 * dt;
      e.y += (target.y - e.y) / d * 28 * dt;
    }
    if (d < (e.boss ? 24 : 15)) hurt(target, e.boss ? 2 : 1);
  }
  updateStrikes(dt);
  for (const bolt of w.bolts) {
    bolt.x += bolt.vx * dt; bolt.y += bolt.vy * dt; bolt.life -= dt;
    const hit = w.players.find(p => Math.hypot(p.x-bolt.x, p.y-10-bolt.y) < 9);
    if (hit) { hurt(hit, bolt.damage); bolt.life = 0; }
  }
  w.bolts = w.bolts.filter(b => b.life > 0);
  for (const shot of w.shots) {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;
    const hit = w.enemies.find(e => e.sector === w.sector && !(e.arrival > 0) && e.hp > 0 && Math.abs(e.x - shot.x) < (e.boss ? 28 : 13) && Math.abs(e.y - 8 - shot.y) < 12);
    if (hit) {
      w.sounds.hit++;
      hit.hp = Math.max(0, hit.hp - weapons[shot.weapon].damage); shot.life = 0;
      burst(shot.x, shot.y, hit.hp ? '#fff4aa' : '#ff967d', hit.hp ? 7 : (hit.boss ? 34 : 18));
    }
  }
  w.shots = w.shots.filter(s => s.life > 0);
  w.enemies = w.enemies.filter(e => e.hp > 0);
  if (w.phase === 'play' && w.sector === 2 && !w.enemies.length && !reinforcementsLeft() && !w.bossSpawned) summonBoss();
  if (w.phase === 'play' && !reinforcementsLeft() && !w.enemies.some(e => e.sector === w.sector) && w.players.some(p => p.x >= gate - 1)) {
    if (w.sector === 2) w.phase = 'won';
    else { w.sector++; w.ambushed = false; w.reinforcementsSent = 0; w.hp = Math.min(12, w.hp + 3); }
  }
}
function rect(x,y,w,h,color) {
  ctx.fillStyle = color; ctx.fillRect(Math.round(x),Math.round(y),w,h);
}
function label(str,x,y,color = '#d6e9e2',size = 9) {
  ctx.font = 'bold ' + size + 'px monospace'; ctx.fillStyle = color; ctx.fillText(str,x,y);
}
function scenery(cam) {
  const sky = ctx.createLinearGradient(0,0,0,175);
  sky.addColorStop(0,'#202c49'); sky.addColorStop(1,'#ca866e');
  ctx.fillStyle = sky; ctx.fillRect(0,0,640,180);
  for(let i=0;i<74;i++) rect((i*131)%640,(i*43)%106,1,1,'#ccc9ad');
  const moon = 477 - cam * .016;
  for(let y=-35;y<36;y+=2) {
    const width = Math.floor(Math.sqrt(36**2-y*y));
    rect(moon-width,77+y,width*2,2,y>7 && y%6===1?'#db9976':'#ffd395');
  }
  for(let layer=0;layer<2;layer++) {
    const shift = cam * (.09 + layer * .2);
    for(let n=Math.floor(shift/32); n<(640+shift)/32+1;n++) {
      const x = n*32-shift, h=16+(n*37+layer*11)%69;
      const base=144+layer*12, color=layer?'#263541':'#566073';
      rect(x,base-h,29,h,color); rect(x+6,base-h-4,14,4,color);
      if(n%4===0) rect(x+12,base-h-19,2,16,color);
      for(let row=0;row<h-8;row+=9) for(let col=4;col<25;col+=7)
        if((row+col+n)%4!==0) rect(x+col,base-h+5+row,3,2,layer?'#9b9c85':'#808294');
    }
  }
  rect(0,156,640,144,'#2a3c47');rect(0,157,640,3,'#77928e');
  for(let y=175;y<300;y+=24) rect(0,y,640,1,'#354955');
  for(let x=-(cam%40);x<640;x+=40) for(let y=167;y<300;y+=24) rect(x,y,1,5,'#41545c');
  for(let x=-(cam%90);x<640;x+=90) rect(x,291,39,2,'#adb783');
}
function human(p,cam,t) {
  const x=Math.round(p.x-cam), y=Math.round(p.y);
  ctx.save();ctx.translate(x,y);ctx.scale(p.face,1);
  const c=colors[p.slot], leg=Math.floor(t*7+p.slot)%2;
  rect(-8,0,18,3,'#1b2b34');rect(-6,-22,10,8,'#e6ac83');rect(-7,-24,11,4,'#253041');
  rect(1,-20,4,2,'#90eaf4');rect(-6,-14,11,9,c);rect(-9,-14,3,9,'#536e79');
  rect(-5,-5,4,5-leg,'#152637');rect(2,-5,4,4+leg,'#152637');
  rect(4,-12,10,4,'#a6bec1');rect(12,-12,3,3,weapons[p.weapon].color);ctx.restore();
}
function monster(e,cam,t) {
  const x=e.x-cam,y=e.y+(e.drone?Math.sin(t*3+e.x)*2:0);
  if(e.arrival > 0) {
    const radius = 6 + Math.round(e.arrival * 7);
    rect(x-radius,y,2*radius,2,'#ffbc82');
    rect(x-radius,y-5,2,5,'#ffbc82'); rect(x+radius-2,y-5,2,5,'#ffbc82');
    return;
  }
  if(e.name) {
    const caption = e.charge > 0 ? e.name + ' !' : e.name;
    ctx.save();
    ctx.font = 'bold 8px monospace';
    const width = Math.ceil(ctx.measureText(caption).width);
    const left = Math.round(x - width / 2), top = Math.round(y) - (e.boss ? 57 : 34);
    rect(left-2, top, width+4, 11, '#17232d');
    label(caption, left, top+8, e.charge > 0 ? '#ffcf9c' : '#eef1e4', 8);
    ctx.restore();
  }
  if(e.charge > 0) {
    ctx.save(); ctx.strokeStyle = '#ffba91'; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(x,y-10);
    ctx.lineTo(x+Math.cos(e.aim)*140,y-10+Math.sin(e.aim)*140); ctx.stroke(); ctx.restore();
  }
  if(e.boss) {
    rect(x-29,y-26,58,19,'#523751'); rect(x-22,y-38,44,34,'#914f71');
    rect(x-24,y-29,48,17,'#382e47'); rect(x-13,y-23,26,5,e.charge?'#fff7b5':'#ff6c84');
    for(const side of [-1,1]) {
      rect(x+side*18-3,y-43,6,9,'#c594a2'); rect(x+side*18-4,y-6,8,8,'#d98985');
    }
  } else if(e.drone) {
    rect(x-13,y-17,26,10,'#332f49');rect(x-9,y-21,18,17,'#9364ad');
    rect(x-7,y-16,14,6,'#291d37');rect(x-5,y-15,4,2,'#ff8ca4');rect(x+2,y-15,4,2,'#ff8ca4');
    rect(x-6,y-4,3,4,'#dc8ed5');rect(x+3,y-4,3,4,'#dc8ed5');
  } else {
    rect(x-10,y-20,21,21,'#724e48');rect(x-8,y-19,17,15,'#e8aa6a');
    rect(x-5,y-15,10,2,'#6c4a44');rect(x-5,y-10,6,2,'#6c4a44');
  }
}
function draw(t, active) {
  const p=world.players.find(p=>p.slot===localSlot) || world.players[0];
  const cam=active?clamp(p.x-230,0,limit-560):0;
  scenery(cam);
  if(!active) {
    human(player(0,415),0,t);human(player(1,443),0,t);
    monster({name:sectorServices[0][1],x:535,y:198,drone:true},0,t);monster({name:sectorServices[0][0],x:574,y:231},0,t);return;
  }
  const gate = ((world.sector+1)*sectorLength)-cam;
  rect(gate,151,3,137,'#beef83');label('EXIT',gate-10,147,'#beef83');
  for (const strike of world.strikes) {
    const x = strike.x-cam, y = strike.y;
    ctx.save();
    ctx.fillStyle = 'rgba(255,98,82,.25)'; ctx.strokeStyle = '#ffc68f';
    ctx.beginPath(); ctx.arc(x,y,31,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x,y,31*clamp(strike.delay/1.05,0,1),0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }
  for(const e of world.enemies) monster(e,cam,t);
  for(const item of world.pickups) {
    if(item.sector !== world.sector) continue;
    const gun = weapons[item.weapon], x = item.x-cam, y = item.y + Math.sin(t*4)*2;
    rect(x-9,y-10,18,12,'#192832'); rect(x-9,y+2,18,2,gun.color);
    rect(x-5,y-7,11,3,gun.color); rect(x-4,y-4,3,3,gun.color);
    label(gun.name,x-gun.name.length*2.5,y-14,gun.color,8);
  }
  for(const s of world.shots) rect(s.x-cam-3,s.y,7,2,weapons[s.weapon].color);
  for(const b of world.bolts) {
    rect(b.x-cam-3,b.y-3,7,7,'#ef695c'); rect(b.x-cam-1,b.y-1,3,3,'#fff0bc');
  }
  for(const fx of world.effects) {
    const radius = (1-fx.life/.32)*fx.size;
    for(let i=0;i<8;i++) rect(fx.x-cam+Math.cos(i*Math.PI/4)*radius,fx.y+Math.sin(i*Math.PI/4)*radius,2,2,fx.color);
  }
  if(world.enemies.some(e => e.arrival > 0)) {
    rect(254,8,120,19,'#452b35'); label('ЗАСАДА В ТЫЛУ',263,21,'#ffd09b');
  }
  const boss = world.enemies.find(e => e.boss);
  if(boss) {
    rect(390,8,242,33,'#302230');
    label('БОСС / ' + boss.name + (boss.hp <= boss.maxHp/2 ? ' / ПЕРЕГРЕВ' : ''),398,21,'#ffbaac');
    rect(398,27,225,5,'#5c4450'); rect(398,27,225*boss.hp/boss.maxHp,5,'#ff8c83');
  }
  for(const hero of world.players) {
    human(hero,cam,t);label(hero.slot===localSlot?'ВЫ':'P'+(hero.slot+1),hero.x-cam-6,hero.y-29,colors[hero.slot],8);
  }
  rect(8,8,244,33,'#17232d');label(sectors[world.sector]+'   '+(world.sector+1)+'/3',15,21);
  const gun = weapons[p.weapon];
  rect(8,42,116,15,'#17232d'); label(gun.name,15,53,gun.color);
  const remaining = world.enemies.filter(e => e.sector === world.sector).length + reinforcementsLeft();
  label(remaining?'ЦЕЛЕЙ: '+remaining:'К ВЫХОДУ →',15,34,'#c5f68a');
  for(let i=0;i<12;i++) rect(151+i*7,17,5,14,i<world.hp?'#bbeb88':'#475362');
}
