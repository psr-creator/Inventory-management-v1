// OSI model as a physical object: a seven-drawer cabinet with a lift in front.
// The packet rides the lift down from Layer 7 to Layer 1; at each floor the drawer
// slides out and its header joins the packet (encapsulation). At Layer 1 the frame
// leaves as bits along the floor cable to the jack.
// Build: node build.mjs [--light]
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const SKILL = join(homedir(), ".claude/skills/anatomy");
const k = await import(join(SKILL, "kit/iso-kit.mjs"));
const { kitScript } = await import(join(SKILL, "scripts/inline-kit.mjs"));
const { slabOf, cylinder, solidSvg, lineSvg, dotsSvg, iso, faceTextSvg, sideMatrix, topMatrix, planOutline, insetPlan, sideArc, knurl, ring, lineOnTop } = k;

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const WIDTH = 620;
const HEIGHT = 560;

// ---- world (1 unit ≈ 1 px of the real thing; x,y floor, z up) ----
const W = {
  plate: { x: -52, y: -50, w: 160, d: 108, r: 8 },
  plateH: 10,
  footH: 5,
  cab: { x: -34, y: -34, w: 64, d: 68, r: 1.6 },
  front: 30,
  plinth: 6,
  pitch: 15,
  drawerH: 13,
  emax: 13,
  lx: 60,
  railY: 22,
  ly: 20,
  railR: 1.8,
  liftBase: { x: 50, y: -8, w: 20, d: 56, r: 2 },
  liftBaseH: 4,
  headZ: 116,
  headH: 6,
  platH: 3,
};
W.top = W.plinth + 7 * W.pitch;

// Layer model: what each layer adds, as true as a picture allows.
const LAYERS = {
  7: { name: "Application", pdu: "Data", adds: "HTTP request", w: 1.8, tone: "lo" },
  6: { name: "Presentation", pdu: "Data", adds: "TLS encrypts", w: 1.8, tone: "lo" },
  5: { name: "Session", pdu: "Data", adds: "session kept", w: 1.8, tone: "lo" },
  4: { name: "Transport", pdu: "Segment", adds: "+TCP · port 443", w: 3, tone: "mid" },
  3: { name: "Network", pdu: "Packet", adds: "+IP · addresses", w: 3, tone: "mid" },
  2: { name: "Data Link", pdu: "Frame", adds: "+MAC · +FCS", w: 3, tone: "hi", trailer: 2.4 },
  1: { name: "Physical", pdu: "Bits", adds: "on the cable", w: 0, tone: "hi" },
};

// ---- dynamic builders (their source is reused verbatim in the browser) ----
function drawerZ(W, i) { return W.plinth + (i - 1) * W.pitch + 1; }

function drawerSvg(W, P, i, e, active) {
  const z0 = drawerZ(W, i);
  const fx = W.front + e;
  const out = [];
  if (e > 0.3) {
    out.push(solidSvg(slabOf({ x: W.front - 0.5, y: -28, w: e + 0.6, d: 56, r: 0.6 }, z0 + 1.2, W.drawerH - 2.4, P, 2), { tone: "lo", crease: "none" }));
    out.push(lineSvg(lineOnTop([W.front, -26], [fx, -26], z0 + W.drawerH - 1.2, P), { tone: "faint" }));
    out.push(lineSvg(lineOnTop([W.front, 26], [fx, 26], z0 + W.drawerH - 1.2, P), { tone: "faint" }));
  }
  const panel = { x: fx, y: -31, w: 1.8, d: 62, r: 0.6 };
  out.push(solidSvg(slabOf(panel, z0, W.drawerH, P, 2, 0.4), { tone: active ? "hi" : "mid", crease: "lo" }));
  const face = fx + 1.8;
  // label plate with the layer number, two screws
  out.push(solidSvg(slabOf({ x: face, y: -26, w: 0.4, d: 9, r: 0.3 }, z0 + 3, 7, P, 2), { tone: "lo", crease: "none" }));
  out.push(faceTextSvg(sideMatrix([face + 0.4, -21.5], z0 + 4.6, P, "right"), String(i), { size: 5.2, tone: active ? "hi" : "mid", anchor: "middle" }));
  out.push(dotsSvg([iso([face + 0.4, -25.2, z0 + 9.2], P), iso([face + 0.4, -17.8, z0 + 9.2], P)], { size: 0.4, tone: "lo" }));
  // pull handle on two standoffs
  for (const y of [-12, 2]) out.push(solidSvg(slabOf({ x: face, y: y - 0.9, w: 2.2, d: 1.8, r: 0.4 }, z0 + 5.6, 1.8, P, 2), { tone: "mid", crease: "none" }));
  out.push(solidSvg(slabOf({ x: face + 2.2, y: -13.2, w: 1.4, d: 16.4, r: 0.6 }, z0 + 5.4, 2.2, P, 3, 0.3), { tone: active ? "hi" : "mid", crease: "faint" }));
  // two rule lines for the index card
  out.push(lineSvg(`M${iso([face, 20, z0 + 8.4], P)}L${iso([face, 28, z0 + 8.4], P)}M${iso([face, 20, z0 + 6.4], P)}L${iso([face, 26, z0 + 6.4], P)}`.replace(/,/g, " "), { tone: "faint", free: true }));
  return out.join("");
}

function platformZ(W, level) { return drawerZ(W, 1) + (level - 1) * W.pitch + 1.5; }

function railSvg(W, P, y, z0, z1) {
  if (z1 - z0 < 0.2) return "";
  return solidSvg(cylinder(W.lx, y, W.railR, z0, z1 - z0, P, 18), { tone: "mid", crease: "none" });
}

function packetSvg(W, P, LAYERS, grow, z) {
  // Lay blocks along y: headers grow on −y, the L2 trailer on +y. Data is the lit core.
  const H = 10, X = W.lx - 7, D = 14;
  const blocks = [];
  const dataW = 8, C = W.ly + 6;
  let left = C - dataW / 2;
  for (const i of [7, 6, 5, 4, 3, 2]) {
    const g = grow[i] || 0;
    if (g < 0.02) continue;
    const w = LAYERS[i].w * g;
    left -= w + 0.4 * g;
    blocks.push({ y: left, w, tone: LAYERS[i].tone, h: H - 1.2 });
  }
  blocks.push({ y: C - dataW / 2, w: dataW, tone: "hi", lit: true, h: H });
  const tg = grow[2] || 0;
  if (tg > 0.02) blocks.push({ y: C + dataW / 2 + 0.5 * tg, w: LAYERS[2].trailer * tg, tone: "hi", h: H - 1.2 });
  const out = [];
  for (const b of blocks) {
    const plan = { x: X, y: b.y, w: D, d: b.w, r: 0.5 };
    out.push(solidSvg(slabOf(plan, z, b.h, P, 2, b.w > 3 ? 0.4 : 0), { tone: b.tone, lit: !!b.lit, crease: "lo" }));
    if (b.lit) out.push(lineSvg(planOutline(insetPlan(plan, 2), z + b.h, P, 2), { tone: "lo" }));
  }
  return out.join("");
}

function liftSvg(W, P, LAYERS, level, grow, part) {
  const z = platformZ(W, level);
  const top = z + W.platH;
  const lo = W.liftBaseH, hi = W.headZ;
  if (part === "back") return railSvg(W, P, W.ly - W.railY, lo, hi);
  if (part === "frontLow") return railSvg(W, P, W.ly + W.railY, lo, z - 0.5);
  if (part === "frontHigh") return railSvg(W, P, W.ly + W.railY, top + 3.5, hi);
  const out = [];
  const plat = { x: W.lx - 9, y: W.ly - W.railY + 3, w: 18, d: 2 * W.railY - 6, r: 1.2 };
  out.push(`<path class="iso-halo" d="${k_halo(plat, z, P)}" style="filter:blur(3px)"/>`);
  // back bushing (behind the deck)
  out.push(solidSvg(cylinder(W.lx, W.ly - W.railY, 3.6, z - 0.5, W.platH + 4, P, 22), { tone: "mid" }));
  out.push(lineSvg(sideArc(W.lx, W.ly - W.railY, 3.6, z + 1.5, P, 14), { tone: "faint" }));
  out.push(solidSvg(slabOf({ x: W.lx - 2.5, y: W.ly - W.railY + 2, w: 5, d: 3, r: 0.4 }, z, W.platH, P, 2), { tone: "mid", crease: "none" }));
  out.push(solidSvg(slabOf(plat, z, W.platH, P, 3, 0.5), { tone: "mid" }));
  out.push(lineSvg(planOutline(insetPlan(plat, 2.2), top, P, 3), { tone: "faint" }));
  out.push(dotsSvg([[plat.x + 1.4, plat.y + 1.4], [plat.x + plat.w - 1.4, plat.y + 1.4], [plat.x + 1.4, plat.y + plat.d - 1.4], [plat.x + plat.w - 1.4, plat.y + plat.d - 1.4]].map(([x, y]) => iso([x, y, top], P)), { size: 0.4, tone: "lo" }));
  out.push(packetSvg(W, P, LAYERS, grow, top));
  // front bushing (in front of the deck)
  out.push(solidSvg(slabOf({ x: W.lx - 2.5, y: W.ly + W.railY - 5, w: 5, d: 3, r: 0.4 }, z, W.platH, P, 2), { tone: "mid", crease: "none" }));
  out.push(solidSvg(cylinder(W.lx, W.ly + W.railY, 3.6, z - 0.5, W.platH + 4, P, 22), { tone: "mid" }));
  out.push(lineSvg(sideArc(W.lx, W.ly + W.railY, 3.6, z + 1.5, P, 14), { tone: "faint" }));
  out.push(lineSvg(ring(W.lx, W.ly + W.railY, W.railR + 0.6, z + W.platH + 3.5, P, 18), { tone: "lo" }));
  return out.join("");
}

// ---- camera ----
const P = k.fitProjection(
  [...k.boxCorners(W.plate, -W.plateH - W.footH, 0), [W.lx, -W.railY, W.headZ + W.headH + 8], [W.lx, W.railY, W.headZ + W.headH + 8], [W.cab.x, W.cab.y, W.top + 5]],
  WIDTH, HEIGHT, { pad: 26, azimuth: 26 },
);
const k_halo = (plan, z, P) => k.haloOf(plan, z, 0.1, P);
const S = (paths, style) => solidSvg(paths, style);
const L = (d, style) => lineSvg(d, style);
const at = (p) => iso(p, P);
const byDepth = (pts) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

function base() {
  const { plate } = W;
  const out = [`<path class="iso-halo" d="${k.haloOf(plate, -W.plateH - W.footH, W.plateH, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(plate, 16))) {
    out.push(S(cylinder(x, y, 6.5, -W.plateH - W.footH, 1.6, P, 26), { tone: "lo" }));
    out.push(S(cylinder(x, y, 5, -W.plateH - W.footH + 1.6, W.footH - 1.6, P, 26), { tone: "mid" }));
  }
  out.push(S(slabOf(plate, -W.plateH, W.plateH, P, 8, 1.4), { tone: "mid" }));
  out.push(L(planOutline(insetPlan(plate, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(plate, 9);
  out.push(L(screws.map(([x, y]) => ring(x, y, 2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(dotsSvg(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // name plate on the plate's near (+y) edge, three rule lines
  const tag = { x: -40, y: 40, w: 50, d: 8, r: 1 };
  out.push(S(slabOf(tag, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  out.push(k.faceTextSvg(topMatrix([tag.x + 4, tag.y + 5.6], 0.6, P, "x"), "OSI · 7 LAYERS", { size: 3.4, tone: "mid" }));
  out.push(dotsSvg([at([tag.x + 1.8, tag.y + 4, 0.6]), at([tag.x + tag.w - 1.8, tag.y + 4, 0.6])], { size: 0.4 }));
  // ruler strip along the plate's +x edge, ticks every 5
  const strip = { x: 96, y: -40, w: 7, d: 70, r: 1 };
  out.push(S(slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const t = k.topTicks(strip.y + 3, strip.y + strip.d - 3, 4, 5, strip.x + 0.8, 0.6, [2, 3.8], P, "y");
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  return out.join("");
}

function cabinet() {
  const { cab } = W;
  const out = [`<path class="iso-halo" d="${k.haloOf(insetPlan(cab, -3), 0, 0.1, P)}"/>`];
  // plinth, set back, with four levelling feet showing at the front
  out.push(S(slabOf(insetPlan(cab, 2.5), 0, W.plinth, P, 3, 0.4), { tone: "lo" }));
  for (const [x, y] of byDepth([[cab.x + cab.w - 5, cab.y + 5], [cab.x + cab.w - 5, cab.y + cab.d - 5], [cab.x + 5, cab.y + cab.d - 5]])) {
    out.push(S(cylinder(x, y, 2.4, 0, 1.4, P, 16), { tone: "mid" }));
  }
  // carcass
  const body = { x: cab.x, y: cab.y, w: W.front - cab.x, d: cab.d, r: cab.r };
  out.push(S(slabOf(body, W.plinth, W.top - W.plinth, P, 3), { tone: "mid" }));
  // the visible side panel: a recessed field and the screws of each runner
  out.push(L(k.sideSeam(body, W.plinth + 2, P, 3), { tone: "faint" }));
  const runners = [];
  for (let i = 1; i <= 7; i++) {
    const z = W.plinth + (i - 1) * W.pitch + W.pitch / 2;
    runners.push(at([cab.x + 6, cab.y + cab.d, z]), at([W.front - 6, cab.y + cab.d, z]));
  }
  out.push(dotsSvg(runners, { size: 0.42, tone: "lo" }));
  // recessed field on the side panel, a carry handle and a rating plate
  const Y = cab.y + cab.d;
  const box = (x0, x1, z0, z1, y = Y) => [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]].map((p) => at(p).join(" "));
  const rect = (x0, x1, z0, z1, y) => "M" + box(x0, x1, z0, z1, y).join("L") + "Z";
  out.push(S(slabOf({ x: cab.x + 9, y: Y, w: W.front - cab.x - 18, d: 0.5, r: 0.3 }, W.plinth + 8, W.top - W.plinth - 16, P, 2), { tone: "mid", crease: "none" }));
  const hz = W.top - 22, hx = (cab.x + W.front) / 2;
  for (const x of [hx - 12, hx + 9]) out.push(S(slabOf({ x, y: Y, w: 3, d: 2.4, r: 0.5 }, hz - 1.5, 3, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(slabOf({ x: hx - 13, y: Y + 2.4, w: 26, d: 1.6, r: 0.7 }, hz - 1.8, 3.6, P, 3, 0.3), { tone: "mid" }));
  const tagZ = W.plinth + 22;
  out.push(S(slabOf({ x: hx - 10, y: Y, w: 20, d: 0.4, r: 0.3 }, tagZ, 12, P, 2), { tone: "lo", crease: "none" }));
  out.push(k.faceTextSvg(sideMatrix([hx - 8, Y + 0.4], tagZ + 8.4, P, "left"), "L7 → L1", { size: 2.6, tone: "mid" }));
  out.push(L([4.6, 2.8].map((dz) => `M${at([hx - 8, Y + 0.4, tagZ + dz]).join(" ")}L${at([hx + (dz > 4 ? 6 : 3), Y + 0.4, tagZ + dz]).join(" ")}`).join(""), { tone: "faint", free: true }));
  out.push(dotsSvg([at([hx - 9, Y + 0.4, tagZ + 11]), at([hx + 9, Y + 0.4, tagZ + 11]), at([hx - 9, Y + 0.4, tagZ + 1]), at([hx + 9, Y + 0.4, tagZ + 1])], { size: 0.38, tone: "lo" }));
  // top cap, proud on all sides, beveled, with a groove
  const cap = insetPlan(body, -1.6);
  out.push(S(slabOf(cap, W.top, 4, P, 4, 0.8), { tone: "mid" }));
  out.push(L(planOutline(insetPlan(cap, 4), W.top + 4, P, 4), { tone: "faint" }));
  out.push(dotsSvg(k.corners(cap, 6).map(([x, y]) => at([x, y, W.top + 4])), { size: 0.45, tone: "lo" }));
  // index ruler strip on the top: one tick per layer, hanging from its edge
  const strip = { x: cap.x + 6, y: cap.y + cap.d - 10, w: 58, d: 4, r: 0.8 };
  out.push(S(slabOf(strip, W.top + 4, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = [];
  for (let i = 0; i < 7; i++) {
    const x = strip.x + 5 + i * 8;
    ticks.push(lineOnTop([x, strip.y], [x, strip.y + (i === 0 ? 4 : 2.2)], W.top + 4.6, P));
  }
  out.push(L(ticks.join(""), { tone: "mid" }));
  return out.join("");
}

function liftStatic(part) {
  const out = [];
  if (part === "base") {
    const b = W.liftBase;
    out.push(S(slabOf(b, 0, W.liftBaseH, P, 3, 0.6), { tone: "lo" }));
    for (const y of [W.ly - W.railY, W.ly + W.railY]) {
      out.push(S(cylinder(W.lx, y, 3.8, W.liftBaseH, 2, P, 22), { tone: "mid" }));
      out.push(dotsSvg([at([W.lx + 6, y, W.liftBaseH]), at([W.lx - 6, y, W.liftBaseH])], { size: 0.4, tone: "lo" }));
    }
    // cable socket on the base's +x face
    out.push(S(slabOf({ x: b.x + b.w, y: W.ly + 4, w: 1.6, d: 8, r: 0.6 }, 0.6, 3, P, 2), { tone: "mid", crease: "none" }));
    return out.join("");
  }
  // crosshead with a knurled crank on top
  const head = { x: W.lx - 6, y: W.ly - W.railY - 4, w: 12, d: 2 * W.railY + 8, r: 2 };
  out.push(S(slabOf(head, W.headZ, W.headH, P, 4, 0.6), { tone: "mid" }));
  out.push(L(planOutline(insetPlan(head, 2.4), W.headZ + W.headH, P, 3), { tone: "faint" }));
  out.push(dotsSvg([W.ly - W.railY, W.ly + W.railY].map((y) => at([W.lx, y, W.headZ + W.headH])), { size: 0.5, tone: "lo" }));
  out.push(S(cylinder(W.lx, W.ly, 4.2, W.headZ + W.headH, 2, P, 26), { tone: "mid" }));
  out.push(S(cylinder(W.lx, W.ly, 2.6, W.headZ + W.headH + 2, 5, P, 22), { tone: "mid" }));
  out.push(L(knurl(W.lx, W.ly, 2.6, W.headZ + W.headH + 2, W.headZ + W.headH + 7, 22, P), { tone: "lo" }));
  out.push(S(slabOf({ x: W.lx - 1, y: W.ly, w: 2, d: 12, r: 0.8 }, W.headZ + W.headH + 7, 1.6, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(cylinder(W.lx, W.ly + 11, 1.3, W.headZ + W.headH + 8.6, 5, P, 14), { tone: "hi", crease: "none" }));
  return out.join("");
}

// floor cable from the lift base to an RJ45 jack block; dashes flow at Layer 1
const CABLE = [[W.liftBase.x + W.liftBase.w + 1.6, W.ly + 8, 2], [80, W.ly + 8, 1.2], [86, W.ly + 2, 1.2], [86, -14, 1.2], [86, -24, 1.2]];
function cableAndJack() {
  const out = [];
  const d = "M" + CABLE.map((p) => at(p).join(" ")).join("L");
  out.push(`<path class="iso-line" data-tone="lo" d="${d}" style="stroke-width:2.6;stroke-linejoin:round"/>`);
  out.push(`<path class="iso-line" data-tone="lit" data-part="bits" d="${d}" style="stroke-width:1.1;opacity:0"/>`);
  const jack = { x: 80, y: -33, w: 12, d: 9, r: 1.2 };
  out.push(S(slabOf(jack, 0, 7, P, 3, 0.5), { tone: "mid" }));
  out.push(S(slabOf({ x: 82.5, y: -24, w: 7, d: 0.4, r: 0.2 }, 1.6, 4, P, 2), { tone: "lo", crease: "none" }));
  out.push(L(planOutline(insetPlan(jack, 2), 7, P, 2), { tone: "faint" }));
  out.push(dotsSvg([at([jack.x + 2, jack.y + 2, 7]), at([jack.x + jack.w - 2, jack.y + jack.d - 2, 7])], { size: 0.4, tone: "lo" }));
  out.push(dotsSvg([at([86, -24, 1.2]), at(CABLE[0])], { size: 1.1, tone: "mid" }));
  return out.join("");
}

// ---- assemble the resting picture: Layer 4 open, headers 7..4 on the packet ----
const REST = { level: 4, grow: { 7: 1, 6: 1, 5: 1, 4: 1 }, ext: { 4: W.emax } };
const drawersAt = (ext, active) => [1, 2, 3, 4, 5, 6, 7].map((i) => drawerSvg(W, P, i, ext[i] || 0, i === active)).join("");
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "The OSI model as a seven-drawer cabinet with a lift in front of it. Drawer 7 at the top is the Application layer, drawer 1 at the bottom is the Physical layer. The packet rides the lift down; at each floor that layer's drawer slides out and adds its header to the packet, so the data is wrapped in more headers on the way down. At layer 1 the frame leaves as bits along the floor cable to the jack.",
  body: [
    base(),
    cabinet(),
    `<g data-part="drawers">${drawersAt(REST.ext, REST.level)}</g>`,
    liftStatic("base"),
    `<g data-part="rail-back">${liftSvg(W, P, LAYERS, REST.level, REST.grow, "back")}</g>`,
    `<g data-part="rail-low">${liftSvg(W, P, LAYERS, REST.level, REST.grow, "frontLow")}</g>`,
    `<g data-part="lift">${liftSvg(W, P, LAYERS, REST.level, REST.grow, "deck")}</g>`,
    `<g data-part="rail-high">${liftSvg(W, P, LAYERS, REST.level, REST.grow, "frontHigh")}</g>`,
    liftStatic("head"),
    cableAndJack(),
  ],
});

const live = `
const W = ${JSON.stringify(W)};
const P = ${JSON.stringify(P)};
const LAYERS = ${JSON.stringify(LAYERS)};
const k_halo = (plan, z, P) => haloOf(plan, z, 0.1, P);
${drawerZ.toString()}
${drawerSvg.toString()}
${platformZ.toString()}
${railSvg.toString()}
${packetSvg.toString()}
${liftSvg.toString()}
const stage = document.querySelector(".iso-stage");
const svgEl = stage.querySelector("svg");
const part = (n) => svgEl.querySelector('[data-part="' + n + '"]');
const G = { drawers: part("drawers"), back: part("rail-back"), low: part("rail-low"), lift: part("lift"), high: part("rail-high"), bits: part("bits") };
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const STEP = 2.6; // seconds per layer on the tour
// live state
let level = ${REST.level}, ext = {1:0,2:0,3:0,4:${W.emax},5:0,6:0,7:0}, grow = {7:1,6:1,5:1,4:1,3:0,2:0}, bits = 0;
let target = { level: 4, through: 4, open: 4 };
let touring = !still.matches, clock = 3 * STEP + 1.3, idle = 0, frame = 0, last = 0, visible = false;
// tour: 7 floors, then a beat of bits on the wire, then the lift returns empty
const CYCLE = 8 * STEP + 1.6;
function tourAt(t) {
  t = t % CYCLE;
  const s = Math.floor(t / STEP), f = (t - s * STEP) / STEP;
  if (s >= 8) return { level: 7, through: 8, open: 0, reset: true };
  const L = 7 - Math.min(s, 6);
  if (s === 7) return { level: 1, through: 1, open: 0, wire: true };
  return { level: L, through: f > 0.42 ? L : L + 1, open: f > 0.22 && f < 0.82 ? L : 0 };
}
function wantFor(t) { return t; }
const follow = (a, b, dt, s, calm) => calm ? b : a + (b - a) * (1 - Math.exp(-dt / s));
function draw() {
  G.drawers.innerHTML = [1,2,3,4,5,6,7].map((i) => drawerSvg(W, P, i, ext[i], i === Math.round(level) && ext[i] > 2)).join("");
  G.back.innerHTML = liftSvg(W, P, LAYERS, level, grow, "back");
  G.low.innerHTML = liftSvg(W, P, LAYERS, level, grow, "frontLow");
  G.lift.innerHTML = liftSvg(W, P, LAYERS, level, grow, "deck");
  G.high.innerHTML = liftSvg(W, P, LAYERS, level, grow, "frontHigh");
  G.bits.style.opacity = bits.toFixed(2);
  if (bits > 0.05) G.bits.setAttribute("data-flow", ""); else G.bits.removeAttribute("data-flow");
  const L = Math.round(level), info = LAYERS[L];
  const text = "L" + L + " " + info.name + " · " + info.pdu + " · " + info.adds;
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(L));
  stage.setAttribute("aria-valuetext", text);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) { clock += dt; target = tourAt(clock); }
  let moving = false;
  const ease = (obj, key, to, s) => { const v = follow(obj[key], to, dt, s, calm); obj[key] = Math.abs(v - to) < 0.002 ? to : v; if (obj[key] !== to) moving = true; };
  const box = { level };
  ease(box, "level", target.level, target.reset ? 0.5 : 0.32);
  level = box.level;
  for (let i = 1; i <= 7; i++) ease(ext, i, target.open === i && Math.abs(level - i) < 0.05 ? W.emax : 0, 0.16);
  for (let i = 2; i <= 7; i++) ease(grow, i, target.through <= i && !target.reset ? 1 : 0, target.reset ? 0.2 : 0.14);
  const b = { bits }; ease(b, "bits", target.wire ? 1 : 0, 0.25); bits = b.bits;
  draw();
  frame = visible && (touring || moving) ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
function steer(L) {
  touring = false;
  target = { level: L, through: L === 1 ? 2 : L, open: L === 1 ? 0 : L, wire: L === 1 };
  clearTimeout(idle);
  idle = setTimeout(() => { touring = !still.matches; clock = (7 - L) * STEP + 0.5 * STEP; run(); }, 4000);
  run();
}
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
const levelAtPointer = (event) => {
  const r = svgEl.getBoundingClientRect();
  const share = Math.min(1, Math.max(0, ((event.clientY - r.top) / r.height - 0.14) / 0.62));
  return Math.max(1, Math.min(7, 7 - Math.floor(share * 7)));
};
stage.addEventListener("pointermove", (e) => { const L = levelAtPointer(e); if (touring || L !== target.level) steer(L); });
stage.addEventListener("keydown", (e) => {
  let L = Math.round(target.level);
  if (e.key === "ArrowDown") L = Math.max(1, L - 1);
  else if (e.key === "ArrowUp") L = Math.min(7, L + 1);
  else if (e.key === "Home") L = 7;
  else if (e.key === "End") L = 1;
  else return;
  e.preventDefault();
  steer(L);
});
draw();
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "OSI model · encapsulation",
  hint: "Hover a floor, or use ↑ ↓",
  readout: "L4 Transport · Segment · +TCP · port 443",
  keys: [
    { mark: "lit", label: "The data your app sends: it never changes, it only gets wrapped" },
    { mark: "raised", label: "Headers each layer adds on the way down (L2 adds a trailer too)" },
    { mark: "dashed", label: "Layer 1: the frame leaves as bits on the cable" },
  ],
  caption:
    "Seven drawers, one per OSI layer, 7 Application at the top to 1 Physical at the bottom. The lift carries the data down; at each floor the drawer opens and adds its header, so Data becomes a Segment (TCP, L4), a Packet (IP, L3) and a Frame (Ethernet, L2) before it goes out as bits. The receiver runs the same cabinet upwards and strips one header per floor.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="OSI cabinet: arrow keys move the lift between layers" aria-valuemin="1" aria-valuemax="7" aria-valuenow="4">${svg}</div>`,
});

const name = theme === "light" ? "osi-model-light.html" : "osi-model.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "OSI model · encapsulation", theme, body, script: kitScript() + live }));
console.log("wrote", name);
