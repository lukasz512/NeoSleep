// The 3D parcel (CORE-215 rounds 8 to 11): a hero note, a box that flies in for it, three more notes that
// balloons bring, a fan that blows them about, tape, string, a label and a postmark, and a spring that sends
// the parcel off as a paper plane to the demo request. World units are
// page pixels, so the thing sits on the page like a drawing. Loaded on demand by paper.ts: a browser
// without WebGL never downloads three.
import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  ColorManagement,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Material, Object3D } from "three";
import { STORY, arc, clamp, eventX, fractionAt, lerp } from "./trail";
import type { Plan } from "./trail";

export type Layout = Plan & {
  width: number;
  height: number;
  /** the parcel's size in px (parcelSize) */
  size: number;
  gutter: number;
  start: number;
  end: number;
  /** the hero note the story starts from: its size and lean, and whether it stays in the hero */
  note: { w: number; h: number; tilt: number; keep: boolean };
  /** where the plane lands, in page px */
  landX: number;
  landY: number;
  /** from here down the page is the dark demo band */
  bandTop: number;
};
export type Shadow = { x: number; y: number; rx: number; ry: number; a: number };
export type Pose = {
  /** the packing story, 0 to STORY.sealed (trail.ts) */
  g: number;
  /** how far down its route the parcel is; at 0 the note is still the hero's */
  f: number;
  /** parcel into plane, 0 to 1, on time */
  morph: number;
  /** the flight, 0 to 1, on time */
  fly: number;
  /** the parcel on the page, and how high it hops right now */
  x: number;
  y: number;
  lift: number;
  /** how hard the fan blows, 0 to 1 */
  gust: number;
  /** launch steps done so far: lines on the parcel's label */
  steps: number;
  top: number;
  sway: number;
  ptr: { x: number; y: number; on: number };
  now: number;
};
export type Parcel3d = {
  resize(layout: Layout): void;
  tokens(): void;
  /** Puts everything where it belongs; returns the flat shadows and whether something still moves by itself. */
  pose(p: Pose): { shadows: Shadow[]; alive: boolean };
  render(top: number): void;
  dispose(): void;
};

type V3 = readonly [number, number, number];

const seg = (g: number, a: number, b: number) => clamp((g - a) / (b - a));
const rad = (d: number) => (d * Math.PI) / 180;
const E = {
  io: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t * t,
  back: (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
};
/** The parcel rides a little above the paper. */
const LIFT = 1.5;

export function buildParcel(canvas: HTMLCanvasElement): Parcel3d {
  // flat poster colours, exactly the page's tokens: no tone mapping, no colour conversion
  ColorManagement.enabled = false;
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 50, 8000);
  scene.add(new AmbientLight(0xffffff, 0.8 * Math.PI));
  const sun = new DirectionalLight(0xffffff, 0.3 * Math.PI);
  sun.position.set(-0.5, 0.9, 1);
  scene.add(sun);

  const lam = () => new MeshLambertMaterial({ color: 0xffffff, side: DoubleSide });
  const mat = {
    n1: lam(),
    n2: lam(),
    n3: lam(),
    primary: lam(),
    balloon: lam(),
    warm: lam(),
    paper: new MeshBasicMaterial(),
    ink: new MeshBasicMaterial(),
    hull: new MeshBasicMaterial({ side: BackSide }),
    dashA: new MeshBasicMaterial(),
    dashB: new MeshBasicMaterial(),
  };
  function tokens() {
    const cs = getComputedStyle(document.documentElement);
    const set = (m: MeshLambertMaterial | MeshBasicMaterial, name: string, fallback: string) => m.color.set(cs.getPropertyValue(name).trim() || fallback);
    set(mat.n1, "--ncrm-note-1", "#ffe58a");
    set(mat.n2, "--ncrm-note-2", "#ffc9a8");
    set(mat.n3, "--ncrm-note-3", "#bfe6d8");
    set(mat.primary, "--ncrm-primary", "#0b6b62");
    set(mat.balloon, "--ncrm-balloon", "#2b4a8b");
    set(mat.warm, "--ncrm-warm", "#f2b84b");
    set(mat.dashA, "--ncrm-primary", "#0b6b62");
    set(mat.dashB, "--ncrm-note-3", "#bfe6d8");
    set(mat.paper, "--ncrm-bg", "#f7f1e3");
    set(mat.ink, "--ncrm-note-ink", "#2a2412");
    set(mat.hull, "--ncrm-note-ink", "#2a2412");
  }
  tokens();

  // ink strokes are thin cylinders, so every edge keeps the drawn look in 3D
  const CYL = new CylinderGeometry(1, 1, 1, 6);
  const SPH = new SphereGeometry(1, 8, 6);
  const UP = new Vector3(0, 1, 0);
  const tmp = new Vector3();
  function setStick(m: Mesh, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number) {
    tmp.set(bx - ax, by - ay, bz - az);
    const len = tmp.length() || 0.001;
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    m.scale.set(r, len, r);
    m.quaternion.setFromUnitVectors(UP, tmp.multiplyScalar(1 / len));
    return m;
  }
  const stick = (a: V3, b: V3, r = 0.9, m: Material = mat.ink) => setStick(new Mesh(CYL, m), a[0], a[1], a[2], b[0], b[1], b[2], r);
  function poly(points: V3[], closed: boolean, r = 0.9, m: Material = mat.ink) {
    const g = new Group();
    points.forEach((p, i) => {
      const q = points[(i + 1) % points.length] ?? p;
      if (closed || i < points.length - 1) g.add(stick(p, q, r, m));
      const joint = new Mesh(SPH, m);
      joint.position.set(p[0], p[1], p[2]);
      joint.scale.setScalar(r);
      g.add(joint);
    });
    return g;
  }
  /** A filled box with an ink outline around its thinnest side. */
  function slab(w: number, h: number, d: number, m: Material, r = 0.9) {
    const g = new Group();
    const x = w / 2;
    const y = h / 2;
    const z = d / 2;
    g.add(new Mesh(new BoxGeometry(w, h, d), m));
    if (h <= d && h <= w) g.add(poly([[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z]], true, r));
    else if (d <= w) g.add(poly([[-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0]], true, r));
    else g.add(poly([[0, -y, -z], [0, y, -z], [0, y, z], [0, -y, z]], true, r));
    return g;
  }
  const at = <T extends Object3D>(o: T, x: number, y: number, z: number) => {
    o.position.set(x, y, z);
    return o;
  };
  const group = (...kids: Object3D[]) => {
    const g = new Group();
    for (const kid of kids) g.add(kid);
    return g;
  };
  function tris(verts: V3[], m: Material) {
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(verts.flatMap((v) => [v[0], v[1], v[2]]), 3));
    geo.computeVertexNormals();
    return new Mesh(geo, m);
  }
  function ball(r: number, m: Material, sy = 1) {
    const g = group(new Mesh(new SphereGeometry(r, 20, 14), m), new Mesh(new SphereGeometry(r + 1.1, 20, 14), mat.hull));
    g.scale.set(1, sy, 1);
    return g;
  }
  const cylZ = (r: number, len: number, m: Material) => {
    const c = new Mesh(new CylinderGeometry(r, r, len, 22), m);
    c.rotation.x = Math.PI / 2;
    return c;
  };

  // --- everything that travels with the parcel ---
  const T = new Group();
  scene.add(T);
  const rig = new Group();
  T.add(rig);

  function note(m: Material) {
    const n = slab(26, 0.7, 26, m);
    n.add(stick([-8, 0.6, -5], [8, 0.6, -5], 0.75), stick([-8, 0.6, 1], [3, 0.6, 1], 0.75));
    return n;
  }
  const n1 = note(mat.n1);
  const n2 = note(mat.n2);
  const n3 = note(mat.n3);
  const n4 = note(mat.n1);
  const notes = [n1, n2, n3, n4];
  const stack = group(...notes);
  rig.add(stack);

  const box = new Group();
  rig.add(box);
  box.add(
    at(slab(30, 1, 22, mat.n2), 0, 0.5, 0),
    at(slab(30, 18, 1, mat.n2), 0, 9, 10.5),
    at(slab(30, 18, 1, mat.n2), 0, 9, -10.5),
    at(slab(1, 18, 22, mat.n2), -14.5, 9, 0),
    at(slab(1, 18, 22, mat.n2), 14.5, 9, 0),
  );
  const fL = at(group(at(slab(8, 0.8, 21, mat.n2), 4, 0, 0)), -15, 18.2, 0);
  const fR = at(group(at(slab(8, 0.8, 21, mat.n2), -4, 0, 0)), 15, 18.2, 0);
  const fB = at(group(at(slab(29.6, 0.8, 11, mat.n2), 0, 0, 5.5)), 0, 19, -11);
  const fF = at(group(at(slab(29.6, 0.8, 11, mat.n2), 0, 0, -5.5)), 0, 19, 11);
  box.add(fL, fR, fB, fF);
  const tapeTop = at(group(at(slab(31, 0.5, 5, mat.n3, 0.7), 15.5, 0, 0)), -15.5, 19.8, 0);
  const tapeL = at(group(at(slab(0.5, 6, 5, mat.n3, 0.7), 0, -3, 0)), -15.7, 19.8, 0);
  const tapeR = at(group(at(slab(0.5, 6, 5, mat.n3, 0.7), 0, -3, 0)), 15.7, 19.8, 0);
  const sF = at(group(at(new Mesh(new BoxGeometry(1.5, 19.5, 0.7), mat.primary), 0, 9.75, 0)), -7, 0, 11.4);
  const sT = at(group(at(new Mesh(new BoxGeometry(1.5, 0.7, 22.8), mat.primary), 0, 0, -11.4)), -7, 20.3, 11.4);
  const knot = at(new Mesh(new SphereGeometry(1.9, 10, 8), mat.primary), -7, 20.8, 0);
  // the label gets a line for every launch step done
  const lines = [2.4, 0.8, -0.8, -2.4].map((y, i) => stick([-3.6, y, 0.5], [i % 2 ? 2 : 3.6, y, 0.5], 0.45));
  const label = group(slab(11, 7.5, 0.5, mat.n1, 0.75), ...lines);
  const mark = at(group(new Mesh(new TorusGeometry(3.2, 0.6, 6, 22), mat.ink), stick([4.5, 1.2, 0], [8, 1.2, 0], 0.5), stick([4.5, -1.2, 0], [8, -1.2, 0], 0.5)), -9, 6.5, 11.3);
  box.add(tapeTop, tapeL, tapeR, sF, sT, knot, label, mark);

  const roll = group(cylZ(6, 5, mat.n3), cylZ(7, 6.2, mat.hull), at(new Mesh(new CircleGeometry(3, 18), mat.ink), 0, 0, 2.6), at(new Mesh(new CircleGeometry(1.9, 18), mat.paper), 0, 0, 2.7), stick([0, 3, 2.8], [0, 5.4, 2.8], 0.45));
  rig.add(roll);
  const stamp = group(cylZ(4.4, 2.6, mat.primary), cylZ(5.3, 3.6, mat.hull), at(cylZ(1.9, 9, mat.n1), 0, 0, 5.6), at(cylZ(2.7, 10, mat.hull), 0, 0, 5.6), at(ball(3, mat.n1), 0, 0, 11.5));
  rig.add(stamp);

  // balloons live on the page, not on the parcel: each waits high on a free margin and the parcel comes to it
  type Balloon = { g: Group; cord: Mesh; fx: number; fy: number };
  function balloon(m: Material): Balloon {
    const body = ball(10, m, 1.16);
    const tie = at(new Mesh(new ConeGeometry(2.4, 3.2, 8), m), 0, -12.6, 0);
    const shine = stick([-4.6, 5.5, 8.2], [-2.2, 8, 7.4], 0.8, mat.paper);
    const g = group(body, tie, shine);
    const cord = new Mesh(CYL, mat.ink);
    scene.add(g, cord);
    return { g, cord, fx: 0, fy: 0 };
  }
  /** Balloons are drawn a little bigger than the notes they carry (round 10: the second one was lost on the paper). */
  const BALLOON = 1.3;
  /** A balloon's note takes this much of the story to fall into the box. */
  const HAND = 0.02;
  const carriers = [
    { n: n2, bal: balloon(mat.primary), cn: note(mat.n2), t0: 0, t1: 0.1, dx: 18, dy: -36, z0: 90, x: 2, y: 0.9, z: 1.5, yaw: 0.14, D: { x: 0, y: 0 }, sg: 1 },
    { n: n3, bal: balloon(mat.balloon), cn: note(mat.n3), t0: 0.1, t1: 0.2, dx: 22, dy: -44, z0: 100, x: -2.5, y: 1.8, z: -1.5, yaw: -0.12, D: { x: 0, y: 0 }, sg: 1 },
    { n: n4, bal: balloon(mat.warm), cn: note(mat.n1), t0: 0.2, t1: 0.3, dx: 16, dy: -40, z0: 95, x: 1, y: 2.7, z: 0.5, yaw: 0.2, D: { x: 0, y: 0 }, sg: 1 },
  ];
  for (const o of carriers) scene.add(o.cn);

  // the fan stands on the page where the packing section begins, and blows across it (round 11)
  const blades = group(
    ...[0, 1, 2].map((i) => {
      const blade = at(new Mesh(new CircleGeometry(5.6, 14), mat.n3), 6.4, 0, 0);
      blade.scale.set(1, 0.5, 1);
      const arm = group(blade);
      arm.rotation.z = (i * Math.PI * 2) / 3;
      return arm;
    }),
  );
  const fanHead = group(new Mesh(new TorusGeometry(13, 1, 6, 30), mat.ink), blades, at(new Mesh(SPH, mat.primary), 0, 0, 0.5));
  fanHead.children[2]?.scale.setScalar(2.8);
  const fan = group(fanHead, stick([0, -13, 0], [0, -29, 0], 1.2), stick([-8, -29, 0], [8, -29, 0], 1.7));
  scene.add(fan);

  // the spring waits where the route ends: the parcel presses it down, and it sends the plane off
  const COILS = 28;
  const coils = Array.from({ length: COILS }, () => new Mesh(CYL, mat.primary));
  const springTop = new Mesh(CYL, mat.ink);
  const springBase = new Mesh(CYL, mat.ink);
  scene.add(...coils, springTop, springBase);

  const scraps: { s: Group; a: number; v: number; spin: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const s = slab(3.4, 0.4, 3.4, [mat.n1, mat.n2, mat.n3][i % 3] ?? mat.n1, 0.45);
    T.add(s);
    scraps.push({ s, a: (i / 14) * Math.PI * 2 + (i % 3) * 0.3, v: 26 + ((i * 37) % 22), spin: 3 + (i % 5) });
  }

  const N: V3 = [18, 0, 0];
  const C: V3 = [-14, 2.5, 0];
  const WL: V3 = [-14, 4.5, -14];
  const WR: V3 = [-14, 4.5, 14];
  const K: V3 = [-14, -6, 0];
  const plane = group(tris([N, C, WL, N, WR, C, N, C, K], mat.n1), poly([N, WL, C, WR], true, 0.85), stick(N, C, 0.85), stick(N, K, 0.85), stick(K, C, 0.85));
  scene.add(plane);

  // the plane's wake: a few dashes right behind it, gone as soon as it has passed (the route itself is never drawn)
  const DASHES = 44;
  const WAKE = 0.3;
  const dashes: { m: Mesh; v: number }[] = [];
  for (let i = 1; i < DASHES; i++) {
    const m = new Mesh(CYL, mat.dashA);
    m.visible = false;
    scene.add(m);
    dashes.push({ m, v: (i + 0.45) / DASHES });
  }

  let L: Layout = {
    width: 1,
    height: 1,
    size: 48,
    gutter: 16,
    start: 0,
    end: 0,
    route: { x0: 0, events: [] },
    anchors: { fan: 0.3, stamp: 0.6, pad: 0.05 },
    fan: { x: 0, y: 0, dir: 1 },
    note: { w: 0, h: 0, tilt: 0, keep: true },
    landX: 0,
    landY: 0,
    bandTop: 0,
  };
  let k = 1;
  let spin = 0;
  let lastNow = 0;
  const fl = { x: 0, y: 0, bow: 60, rise: 110 };
  /** The flight: one gentle bow from where the route ends to the demo button, no loop. */
  function flight(v: number, out: Vector3) {
    return out.set(lerp(fl.x, L.landX, v) + fl.bow * Math.sin(Math.PI * v), -lerp(fl.y, L.landY, v), lerp(14, 2, v) + fl.rise * Math.sin(Math.PI * v));
  }

  function resize(layout: Layout) {
    L = layout;
    k = L.size / 48;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(L.width, L.height, false);
    camera.aspect = L.width / L.height;
    camera.updateProjectionMatrix();

    // each balloon waits where the box will be when its note is due
    const span = Math.max(1, L.end - L.start);
    carriers.forEach((o, i) => {
      const due = STORY.pickups[i + 1] ?? STORY.pickups[0];
      const y = L.start + fractionAt(due, L.anchors) * span;
      // the note lets go a moment earlier, so it lands on the beat
      o.t1 = due - HAND;
      o.t0 = o.t1 - 0.07;
      o.D = { x: eventX(y, L.route), y };
      // it comes down from above, a touch towards the middle so it never leaves the window
      o.sg = o.D.x > L.width / 2 ? -1 : 1;
    });
    fan.position.set(L.fan.x, -L.fan.y, LIFT + 16 * k);
    fan.scale.setScalar(k * (L.width >= 700 ? 1.3 : 1));
    fanHead.rotation.y = L.fan.dir * rad(52);

    fl.x = eventX(L.end, L.route);
    fl.y = L.end;
    fl.bow = (fl.x > L.landX ? 1 : -1) * Math.min(60, L.width * 0.08);
    fl.rise = 110 * k;
    const a = new Vector3();
    const b = new Vector3();
    for (const d of dashes) {
      flight(d.v - 0.45 / DASHES, a);
      flight(d.v, b);
      setStick(d.m, a.x, a.y, a.z, b.x, b.y, b.z, 1.1);
      d.m.material = -a.y > L.bandTop ? mat.dashB : mat.dashA;
    }
  }

  const fa = new Vector3();
  const fb = new Vector3();
  const fwd = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  const Zup = new Vector3(0, 0, 1);
  const basis = new Matrix4();
  const inverse = new Quaternion();
  // at rest the plane lies flat on the paper, seen from above, nose to the right
  const rest = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, -1, 0)));

  function pose(p: Pose) {
    const shadows: Shadow[] = [];
    let alive = false;
    const { top, sway, ptr, gust } = p;
    const dt = Math.min(64, Math.max(0, p.now - lastNow));
    lastNow = p.now;
    const inWindow = (y: number) => y - top > -160 && y - top < L.height + 160;
    // one number for the whole story: scrolling packs the parcel (to 0.86), time turns it into a plane and flies it
    const g = p.g < STORY.sealed ? p.g : STORY.sealed + 0.08 * p.morph + 0.06 * p.fly;
    // while the window is at the top, the note is still the hero's own
    const out = p.f > 0;
    T.position.set(p.x, -p.y + p.lift, LIFT + 6 + p.lift * 0.4);
    T.scale.setScalar(k);
    const boxIn = seg(g, STORY.boxIn[0], STORY.boxIn[1]);
    const tiltP = E.io(boxIn);
    const tr = seg(g, 0.86, 0.92);
    const tp = seg(g, 0.6, 0.72);
    const st = seg(g, 0.8, 0.86);
    const press = Math.pow(Math.sin(Math.PI * st), 8);
    const leanX = clamp((ptr.x - p.x) / L.width, -1, 1) * 0.45 * ptr.on;
    const leanY = clamp((ptr.y - (p.y - top)) / L.height, -1, 1) * 0.3 * ptr.on;
    rig.rotation.set(
      lerp(Math.PI / 2, 0.62, tiltP) - leanY,
      lerp(0, -0.55, tiltP) + Math.sin(tp * Math.PI * 2) * 0.12 * (1 - tp) + E.in(tr) * Math.PI * 4 + leanX * lerp(0.4, 1, tiltP) - press * 0.2 + sway * 0.5,
      // it leans away from the fan
      -L.fan.dir * gust * 0.22,
    );
    const gone = E.in(seg(g, 0.885, 0.915));
    rig.position.set(0, lerp(0, -7, tiltP) + Math.sin(Math.PI * tr) * 22, 0);
    rig.scale.setScalar(Math.max(0.001, 1 - gone));
    rig.visible = out && gone < 0.99;

    // the hero note comes off the drawing at its own size and lean, and shrinks into the travelling note
    const peel = E.io(seg(g, 0, STORY.peel));
    const unit = 26 * k;
    const big = L.note.keep ? { x: 0.35, z: 0.35 } : { x: L.note.w / unit, z: L.note.h / unit };
    n1.position.set(0, 0, 0);
    n1.scale.set(lerp(big.x, 1, peel), 1, lerp(big.z, 1, peel));
    n1.rotation.set(0, lerp(-L.note.tilt, 0, peel), 0);
    // then the three the balloons bring
    for (const o of carriers) {
      const bal = o.bal;
      const a = E.io(seg(g, o.t0, o.t1));
      const rel = E.in(seg(g, o.t1, o.t1 + HAND));
      const up2 = seg(g, o.t1 + 0.01, o.t1 + 0.24);
      // page position of the balloon: it bobs at its own spot, sinks to meet the parcel, later rises away
      const bob = Math.sin(p.now / 900 + o.dx) * 3 * k;
      let bx = o.D.x + o.sg * (o.dx * k * (1 - a) + 24 * k * up2);
      let by = o.D.y - 46 * k + o.dy * k * (1 - a) - 170 * k * up2 + bob;
      const bz = lerp(o.z0, 44, a) * k + 300 * k * Math.pow(up2, 1.5);
      // it backs away from the cursor
      const ex = bx - ptr.x;
      const ey = by - top - ptr.y;
      const d = Math.hypot(ex, ey) || 1;
      const push = ptr.on > 0.05 && d < 140 ? (1 - d / 140) * 60 : 0;
      bal.fx += ((ex / d) * push - bal.fx) * 0.12;
      bal.fy += ((ey / d) * push - bal.fy) * 0.12;
      bx += bal.fx;
      by += bal.fy;
      const show = up2 < 1;
      bal.g.visible = bal.cord.visible = show;
      bal.g.position.set(bx, -by, bz);
      bal.g.rotation.z = -sway * 1.5 - bal.fx * 0.012;
      bal.g.scale.setScalar(k * BALLOON * Math.max(0.001, 1 - E.in(seg(up2, 0.85, 1))));
      // the note hangs under the balloon, then drops onto the stack as the parcel passes below
      const hx = bx - 3 * k;
      const hy = by + 46 * k;
      const hz = bz - 30 * k;
      const nx = lerp(hx, p.x, rel);
      const ny = lerp(hy, p.y - p.lift, rel);
      const nz = lerp(hz, LIFT + 8 + o.y * k, rel);
      o.cn.visible = rel < 1;
      o.cn.position.set(nx, -ny, nz);
      o.cn.scale.setScalar(k);
      o.cn.rotation.set(Math.PI / 2, lerp(Math.sin(a * 9) * 0.25 + sway * 2 + bal.fx * 0.02, o.yaw, rel), 0);
      o.n.visible = rel >= 1;
      o.n.position.set(o.x, o.y, o.z);
      o.n.rotation.set(0, o.yaw, 0);
      o.n.scale.setScalar(1 + 0.12 * Math.sin(Math.PI * seg(g, o.t1 + HAND, o.t1 + HAND + 0.02)));
      const ty = -by - 14 * k * BALLOON;
      if (rel <= 0) setStick(bal.cord, bx, ty, bz, nx, -ny + 13 * k, nz, 0.5 * k);
      else setStick(bal.cord, bx, ty, bz, bx + sway * 40, ty - 22 * k, bz, 0.5 * k);
      if (show) {
        shadows.push({ x: bx + bz * 0.2 + 6, y: by + bz * 0.3 + 30 * k, rx: 9 * k * BALLOON * (1 + bz / 400), ry: 5 * k * BALLOON * (1 + bz / 400), a: 0.11 * (1 - up2) * clamp(1.2 - bz / 500) });
        if (inWindow(by)) alive = true;
      }
    }

    // the box flies in from below on a parabola, spinning, and the note hops up and drops into it
    const rise = E.out(seg(g, STORY.peel, STORY.boxIn[1] - 0.01));
    const drop = E.in(seg(g, STORY.boxIn[1], STORY.pickups[0]));
    stack.position.set(0, lerp(27 * rise, 1.4, drop), 0);
    stack.scale.setScalar(lerp(1, 0.66, rise));
    stack.visible = g < 0.565;
    // the box always rides in from the right, grabs the first note and spins off to the left
    const side = 1;
    const way = arc(boxIn, { x: side * Math.min(L.width * 0.45, 480), y: L.height * 0.6 }, { x: 0, y: 0 }, L.height * 0.2);
    // every note that lands squashes the box for a moment, and so does the lid
    const hit = STORY.pickups.reduce((sum, due) => sum + Math.sin(Math.PI * seg(g, due, due + 0.025)), Math.sin(Math.PI * seg(g, 0.57, 0.6)));
    const pop = lerp(0.6, 1, E.out(boxIn));
    box.visible = out && g >= STORY.boxIn[0];
    box.position.copy(tmp.set(way.x / k, -way.y / k, (1 - boxIn) * 40).applyQuaternion(inverse.copy(rig.quaternion).invert()));
    box.position.z -= press * 3;
    box.rotation.y = side * Math.pow(1 - boxIn, 2) * Math.PI * 3;
    box.scale.set(pop * (1 + 0.07 * hit), pop * (1 - 0.12 * hit), pop * (1 + 0.07 * hit) * (1 - 0.1 * press));

    // the fan blows the loose notes out of the open box; they flutter and settle again
    spin += dt * (0.0015 + 0.04 * gust);
    blades.rotation.z = spin;
    fan.rotation.z = Math.sin(p.now / 60) * 0.03 * gust;
    fan.visible = inWindow(L.fan.y);
    if (fan.visible) {
      alive = true;
      shadows.push({ x: L.fan.x + 5, y: L.fan.y + 34 * fan.scale.x, rx: 12 * fan.scale.x, ry: 4 * fan.scale.x, a: 0.13 });
    }
    if (gust > 0) {
      notes.forEach((n, i) => {
        const flutter = p.now / 80 + i * 1.7;
        n.position.x += L.fan.dir * gust * (24 + 13 * i);
        n.position.y += gust * (20 + 9 * i) + Math.sin(flutter) * 2 * gust;
        n.rotation.x = Math.sin(flutter) * 0.5 * gust;
        n.rotation.z = Math.cos(flutter * 0.8) * 0.7 * gust;
      });
    }
    const flap = (a: number, b: number) => rad(lerp(125, 0, E.io(seg(g, a, b))));
    fL.rotation.z = flap(0.46, 0.51);
    fR.rotation.z = -flap(0.47, 0.52);
    fB.rotation.x = -flap(0.5, 0.55);
    fF.rotation.x = flap(0.52, 0.57);

    // the tape roll rides the seam, the string ties it, then the label and the postmark
    const tape = E.io(seg(g, 0.61, 0.7));
    tapeTop.scale.x = Math.max(0.001, tape);
    tapeTop.visible = tapeL.visible = tape > 0;
    tapeR.scale.y = Math.max(0.001, seg(g, 0.695, 0.715));
    tapeR.visible = g > 0.695;
    const rin = E.out(seg(g, 0.575, 0.61));
    const rout = seg(g, 0.7, 0.76);
    const rxp = lerp(-15, 15, tape) + 30 * rout;
    roll.visible = g > 0.575 && g < 0.76;
    roll.position.set(rxp, 26.2 + (1 - rin) * 50 - 46 * rout * rout, 0);
    roll.rotation.z = -rxp / 6;
    roll.scale.setScalar(Math.max(0.001, 1 - E.in(seg(g, 0.74, 0.76))));
    sF.scale.y = Math.max(0.001, seg(g, 0.72, 0.75));
    sF.visible = g > 0.72;
    sT.scale.z = Math.max(0.001, seg(g, 0.75, 0.78));
    sT.visible = g > 0.75;
    knot.scale.setScalar(Math.max(0.001, E.back(seg(g, 0.775, 0.795))));
    knot.visible = g > 0.775;
    const le = E.out(seg(g, 0.77, 0.82));
    label.visible = g > 0.77;
    label.position.set(7, 10.5, lerp(46, 11.6, le));
    label.scale.setScalar(lerp(1.9, 1, le));
    label.rotation.z = lerp(-0.4, 0, le);
    lines.forEach((line, i) => (line.visible = i < p.steps));
    // a big stamp comes down hard: it is the page's second event, and knocks the parcel back across
    stamp.visible = st > 0 && st < 1;
    stamp.position.set(-9, 6.5, st < 0.5 ? lerp(120, 13.6, E.in(seg(st, 0, 0.48))) : lerp(13.6, 120, E.io(seg(st, 0.56, 1))));
    stamp.scale.setScalar(Math.max(0.001, 1.7 * Math.min(1, st * 7, (1 - st) * 7)));
    mark.visible = st >= 0.5;
    mark.scale.setScalar(Math.max(0.001, 1.25 * E.back(seg(g, STORY.stamp, 0.85))));

    // the spring: pressed down by the parcel that has arrived, let go when it turns into the plane
    const sy = L.end + 30 * k;
    const full = 34 * k;
    const onIt = out && p.morph <= 0 && Math.abs(p.x - fl.x) < 20 * k;
    const coil = p.morph > 0 ? full - 16 * k * Math.exp(-5 * p.morph) * Math.cos(20 * p.morph) : onIt ? clamp(sy - (p.y + 12 * k), 14 * k, full) : full;
    const seen = inWindow(sy);
    for (const m of [...coils, springTop, springBase]) m.visible = seen;
    if (seen) {
      const z = LIFT + 8 * k;
      const at2 = (t: number) => [fl.x + 9 * k * Math.cos(t * Math.PI * 9), -(sy - coil * t), z + 4.5 * k * Math.sin(t * Math.PI * 9)] as const;
      coils.forEach((m, i) => {
        const a = at2(i / COILS);
        const b = at2((i + 1) / COILS);
        setStick(m, a[0], a[1], a[2], b[0], b[1], b[2], 0.9 * k);
      });
      setStick(springTop, fl.x - 12 * k, -(sy - coil), z, fl.x + 12 * k, -(sy - coil), z, 1.3 * k);
      setStick(springBase, fl.x - 13 * k, -sy, z, fl.x + 13 * k, -sy, z, 1.5 * k);
      shadows.push({ x: fl.x + 4, y: sy + 5 * k, rx: 14 * k, ry: 4 * k, a: 0.12 });
      if (p.morph > 0 && p.morph < 1) alive = true;
    }

    // paper scraps as the parcel turns into a plane
    const su = seg(g, 0.885, 0.985);
    for (const o of scraps) {
      o.s.visible = su > 0 && su < 1;
      const d = o.v * E.out(su) * 1.5;
      o.s.position.set(Math.cos(o.a) * d, Math.sin(o.a) * d - 46 * su * su + 12, 16 * Math.sin(Math.PI * su));
      o.s.rotation.set(su * o.spin, su * o.spin * 1.3, o.a);
      o.s.scale.setScalar(Math.max(0.001, Math.sin(Math.PI * su) * 1.2));
    }

    // the plane: opens with a roll, flies one bow, lands flat on the button
    const open = seg(g, 0.89, 0.94);
    const v = E.io(p.fly);
    plane.visible = open > 0;
    if (plane.visible) {
      flight(v, fa);
      if (v <= 0) fa.set(p.x, -p.y, LIFT + 14 * k);
      flight(Math.min(1, v + 0.004), fb);
      flight(Math.max(0, v - 0.004), fwd);
      fwd.subVectors(fb, fwd).normalize();
      right.crossVectors(fwd, Zup).normalize();
      up.crossVectors(right, fwd).normalize();
      right.crossVectors(fwd, up);
      basis.makeBasis(fwd, up, right);
      plane.quaternion.setFromRotationMatrix(basis);
      const w = seg(v, 0.16, 0.74);
      plane.rotateX(0.5 * Math.sin(Math.PI * w) + (1 - E.out(open)) * Math.PI * 2);
      // the last part of the flight it levels out and settles face up
      plane.quaternion.slerp(rest, E.io(seg(v, 0.5, 1)));
      plane.position.copy(fa);
      plane.scale.setScalar(k * 1.15 * Math.max(0.001, E.back(open)));
      shadows.push({ x: fa.x + fa.z * 0.4 + 4, y: -fa.y + fa.z * 0.6 + 6, rx: 15 * k, ry: 6 * k, a: lerp(0.2, 0.07, clamp(fa.z / 120)) });
    }
    for (const d of dashes) {
      const behind = v - d.v;
      d.m.visible = v < 1 && behind > 0.03 && behind < WAKE;
      if (d.m.visible) d.m.scale.x = d.m.scale.z = 1.1 * (1 - behind / WAKE);
    }

    // a parcel in the air throws a smaller shadow
    const air = 1 - clamp(p.lift / (L.size * 2), 0, 0.5);
    if (out && gone < 0.99) shadows.push({ x: p.x + 5, y: p.y + lerp(7, 15, tiltP) * k + LIFT * 0.5, rx: lerp(15, 19, tiltP) * k * (1 - gone) * air, ry: lerp(6, 7, tiltP) * k * (1 - gone) * air, a: 0.16 * air });
    return { shadows, alive };
  }

  function render(top: number) {
    camera.position.set(L.width / 2, -(top + L.height / 2), L.height / 2 / Math.tan(rad(15)));
    renderer.render(scene, camera);
  }

  function dispose() {
    scene.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    for (const m of Object.values(mat)) m.dispose();
    renderer.dispose();
  }

  return { resize, tokens, pose, render, dispose };
}
