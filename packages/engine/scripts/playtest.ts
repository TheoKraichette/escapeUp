// Playtest « vue joueur » : génère une salle et rejoue la partie complète en
// affichant TOUT ce que le joueur lit (descriptions, reveals, événements,
// hints), dans l'ordre de découverte. Outil de design/équilibrage, pas un test.
//
//   npx tsx packages/engine/scripts/playtest.ts <seed> <difficulty> [theme]
//
// Sortie : lisible par un humain, pensée pour juger la qualité des textes,
// la clarté des indices et la sensation de progression.

import {
  applyAction,
  createInitialState,
  deriveClientView,
  generateRoom,
  validateRoom,
  type Action,
  type Affordance,
  type GameEvent,
  type PlayerState,
  type PuzzleInstance,
  type RoomSpec,
} from '../src/index';

const seed = process.argv[2] ?? 'PLAYTEST-1';
const difficulty = (process.argv[3] ?? 'medium') as 'easy' | 'medium' | 'hard';
const theme = process.argv[4];

const room = generateRoom(seed, { difficulty, ...(theme ? { theme } : {}) });
const validation = validateRoom(room);

// ————————————————————————— Plan du joueur parfait —————————————————————————

function carrierOf(nodeId: string): string | undefined {
  return room.graph.nodes.find((n) => n.id === nodeId)?.carrier;
}

function actionForPuzzle(p: PuzzleInstance): Action | undefined {
  const sol = p.solution;
  switch (sol.kind) {
    case 'code':
      return { type: 'enter_code', objectId: p.mechanismObjectId, code: sol.value };
    case 'sequence':
      return { type: 'enter_sequence', objectId: p.mechanismObjectId, steps: sol.steps };
    case 'combine': {
      const ids = sol.itemNodeIds.map(carrierOf).filter((c): c is string => Boolean(c));
      return { type: 'combine', objectIds: ids };
    }
    case 'key': {
      const tool = carrierOf(sol.itemNodeId);
      return tool ? { type: 'use_on', toolObjectId: tool, targetObjectId: p.mechanismObjectId } : undefined;
    }
    case 'use_on': {
      const tool = carrierOf(sol.toolNodeId);
      return tool ? { type: 'use_on', toolObjectId: tool, targetObjectId: sol.targetObjectId } : undefined;
    }
  }
}

function snapshot(s: PlayerState): string {
  return JSON.stringify([[...s.acquired].sort(), [...s.solvedPuzzles].sort(), Object.entries(s.objectStates).sort()]);
}

// ————————————————————————— Affichage —————————————————————————

const objById = new Map(room.objects.map((o) => [o.id, o]));
const zoneById = new Map(room.zones.map((z) => [z.id, z]));
const puzzleByMechanism = new Map(room.puzzles.map((p) => [p.mechanismObjectId, p]));

function nameOf(objectId: string): string {
  return objById.get(objectId)?.name ?? objectId;
}
function zoneOf(objectId: string): string {
  const loc = objById.get(objectId)?.location;
  if (loc && typeof loc === 'object') return zoneById.get(loc.zoneId)?.name ?? loc.zoneId;
  return '?';
}

function printEvents(events: GameEvent[]): void {
  for (const ev of events) {
    switch (ev.type) {
      case 'text':
        console.log(`      « ${ev.text} »`);
        break;
      case 'info_gained':
        console.log(`      [carnet] « ${ev.text} »`);
        break;
      case 'object_revealed':
        console.log(`      → révélé : ${nameOf(ev.objectId)}`);
        break;
      case 'item_taken':
        console.log(`      → pris : ${nameOf(ev.objectId)}`);
        break;
      case 'puzzle_solved':
        console.log(`      ✔ puzzle résolu (${ev.puzzleId})`);
        break;
      case 'zone_unlocked':
        console.log(`      🔓 ZONE DÉBLOQUÉE : ${zoneById.get(ev.zoneId)?.name ?? ev.zoneId}`);
        break;
      case 'goal_reached':
        console.log(`      🏆 SORTIE ! « ${ev.epilogue} »`);
        break;
      case 'failure':
        console.log(`      ✖ échec : ${ev.message}`);
        break;
      case 'state_changed':
        console.log(`      ~ ${ev.label}`);
        break;
      case 'noop':
        console.log(`      (rien : ${ev.message})`);
        break;
    }
  }
}

function describeAction(a: Action): string {
  switch (a.type) {
    case 'inspect':
      return `Examiner « ${nameOf(a.objectId)} » (${zoneOf(a.objectId)})`;
    case 'read':
      return `Lire « ${nameOf(a.objectId)} » (${zoneOf(a.objectId)})`;
    case 'take':
      return `Prendre « ${nameOf(a.objectId)} » (${zoneOf(a.objectId)})`;
    case 'activate':
      return `Activer « ${nameOf(a.objectId)} »`;
    case 'enter_code':
      return `Entrer le code [${a.code}] sur « ${nameOf(a.objectId)} » (${zoneOf(a.objectId)})`;
    case 'enter_sequence':
      return `Séquence [${a.steps.join(' → ')}] sur « ${nameOf(a.objectId)} »`;
    case 'use_on':
      return `Utiliser « ${nameOf(a.toolObjectId)} » sur « ${nameOf(a.targetObjectId)} »`;
    case 'combine':
      return `Combiner ${a.objectIds.map((i) => `« ${nameOf(i)} »`).join(' + ')}`;
  }
}

// ————————————————————————— Déroulé —————————————————————————

console.log('═'.repeat(78));
console.log(`SALLE : ${room.narrative.title}   [seed=${room.seed} · ${difficulty} · thème=${room.theme}]`);
console.log('═'.repeat(78));
console.log(`\nOBJECTIF JOUEUR : ${room.narrative.playerObjective}`);
console.log(
  `\nMétriques : profondeur=${room.metrics.criticalPathDepth} branches=${room.metrics.parallelBranches} ` +
    `puzzles=${room.puzzles.length} zones=${room.metrics.zoneCount} leurres=${room.metrics.decoyCount} ` +
    `~${room.metrics.estimatedMinutes} min · solvable=${validation.solvable}`,
);

console.log('\n' + '─'.repeat(78));
console.log('CE QUE LE JOUEUR VOIT EN ENTRANT (zone par zone) :');
for (const z of room.zones) {
  console.log(`\n▶ ${z.name} (couche ${z.layer})${z.gate ? ' — verrouillée au départ' : ''}`);
  for (const poi of z.pois) {
    const here = room.objects.filter(
      (o) =>
        typeof o.location === 'object' &&
        o.location.zoneId === z.id &&
        o.location.poiId === poi.id &&
        o.initialState !== 'hidden',
    );
    if (!here.length) continue;
    console.log(`  ${poi.name} :`);
    for (const o of here) {
      const pz = puzzleByMechanism.get(o.id);
      const tag = pz ? ` [mécanisme:${pz.template}]` : o.family === 'decor' ? ' [décor]' : '';
      console.log(`    • ${o.name}${tag} — ${o.description}`);
    }
  }
}

console.log('\n' + '─'.repeat(78));
console.log('PARTIE DU JOUEUR PARFAIT (ce qui est lu, dans l’ordre) :\n');

let state = createInitialState(room);
const harvestAffs: Affordance[] = ['inspect', 'read', 'take'];
const maxPasses = room.puzzles.length + room.objects.length + 12;
let step = 0;
let pass = 0;
let progressed = true;
while (progressed && !state.acquired.includes(room.graph.goalId) && pass < maxPasses) {
  pass++;
  progressed = false;
  for (const obj of room.objects) {
    for (const aff of harvestAffs) {
      if (!obj.affordances.includes(aff)) continue;
      const action = { type: aff, objectId: obj.id } as Action;
      const before = snapshot(state);
      const res = applyAction(room, state, action);
      if (snapshot(res.state) !== before) {
        step++;
        console.log(`  ${String(step).padStart(2)}. ${describeAction(action)}`);
        printEvents(res.events);
        state = res.state;
        progressed = true;
      }
    }
  }
  for (const p of room.puzzles) {
    if (state.solvedPuzzles.includes(p.id)) continue;
    if (!p.inputs.every((n) => state.acquired.includes(n))) continue;
    const action = actionForPuzzle(p);
    if (!action) continue;
    const before = snapshot(state);
    const res = applyAction(room, state, action);
    if (res.state.solvedPuzzles.includes(p.id) && snapshot(res.state) !== before) {
      step++;
      console.log(`  ${String(step).padStart(2)}. ${describeAction(action)}  [${p.template}]`);
      printEvents(res.events);
      state = res.state;
      progressed = true;
    }
  }
}

const won = state.acquired.includes(room.graph.goalId);
console.log(`\n${won ? '✅' : '❌'} Partie ${won ? 'gagnée' : 'BLOQUÉE'} en ${step} actions.`);

console.log('\n' + '─'.repeat(78));
console.log('HINTS PAR PUZZLE (les 4 niveaux, tels que le joueur les recevrait) :\n');
for (const p of room.puzzles) {
  console.log(`  ${p.id} [${p.template}] — mécanisme « ${nameOf(p.mechanismObjectId)} » (${zoneOf(p.mechanismObjectId)})`);
  p.hints.forEach((h, i) => console.log(`    ${i + 1}. ${h}`));
  console.log('');
}

// Vue client finale : contrôle rapide de cohérence.
const view = deriveClientView(room, state);
console.log('─'.repeat(78));
console.log(`Épilogue : ${view.epilogue ?? '(non atteint)'}`);
