<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { JulioLang, JulioStep } from "../config/julioContent";
import { julioHeroLabels } from "../config/julioHeroLabels";
import type { JulioHeroLabels } from "../config/julioHeroLabels";

const props = defineProps<{
  lang: JulioLang;
  title: string;
  steps: JulioStep[];
  fallbackSrc: string;
}>();

const host = ref<HTMLDivElement | null>(null);
const failed = ref(false);
const labels = computed<JulioHeroLabels>(() => julioHeroLabels[props.lang]);

const TEAL = "#128F83";
const TEAL_DARK = "#10544E";
const INK = "#474747";

/** Latest text for the draw functions; updated by the language watcher. */
const state = { labels: labels.value, title: props.title, steps: props.steps };
watch(
  () => [props.lang, props.title, props.steps] as const,
  () => {
    state.labels = labels.value;
    state.title = props.title;
    state.steps = props.steps;
  },
);

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const ease = (x: number): number => x * x * (3 - 2 * x);

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** MR / MP values that tick up and down like the stepper in the app. */
function stepperValues(t: number): { mr: number; mp: number } {
  return {
    mr: Math.round(Math.sin(t * 0.9) * 2),
    mp: 8 + Math.round(Math.sin(t * 0.7 + 1) * 2),
  };
}

function drawStepper(c: CanvasRenderingContext2D, x: number, y: number, label: string, value: number, pressedUp: boolean, pressedDown: boolean): void {
  c.fillStyle = INK;
  c.font = "600 22px system-ui, sans-serif";
  c.textAlign = "left";
  c.fillText(label, x, y);
  roundRect(c, x, y + 14, 300, 70, 14);
  c.fillStyle = "#fff";
  c.fill();
  c.strokeStyle = "#cfd8d7";
  c.lineWidth = 2;
  c.stroke();
  const btn = (bx: number, sign: string, on: boolean): void => {
    roundRect(c, bx, y + 24, 50, 50, 12);
    c.fillStyle = on ? TEAL : "#e6f3f1";
    c.fill();
    c.fillStyle = on ? "#fff" : TEAL_DARK;
    c.font = "700 32px system-ui, sans-serif";
    c.textAlign = "center";
    c.fillText(sign, bx + 25, y + 60);
  };
  btn(x + 10, "−", pressedDown);
  btn(x + 240, "+", pressedUp);
  c.fillStyle = INK;
  c.font = "700 34px system-ui, sans-serif";
  c.textAlign = "center";
  c.fillText(String(value), x + 150, y + 61);
}

function drawTooth(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rot: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  roundRect(c, -w / 2, -h / 2, w, h, w * 0.32);
  const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#e7ecea");
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = "#9db1ae";
  c.lineWidth = 2;
  c.stroke();
  c.restore();
}

/** Two arches; the lower one grinds left and right and slides forward. */
function drawTeeth(c: CanvasRenderingContext2D, cx: number, cy: number, t: number, lbl: JulioHeroLabels): void {
  const grind = Math.sin(t * 1.5) * 26;
  const forward = (Math.sin(t * 0.45) + 1) / 2;
  const n = 10;
  const draw = (dx: number, baseY: number, sign: number, h: number): void => {
    for (let i = 0; i < n; i++) {
      const k = i - (n - 1) / 2;
      const w = 34 - Math.abs(k) * 1.6;
      drawTooth(c, cx + dx + k * 38, baseY + sign * k * k * 1.7, w, h, (k * 0.045) * sign);
    }
  };
  draw(0, cy - 20, -1, 56);
  draw(grind, cy + 30 - forward * 10, 1, 52);
  c.strokeStyle = TEAL;
  c.lineWidth = 3;
  c.setLineDash([8, 6]);
  c.beginPath();
  c.moveTo(cx, cy - 70);
  c.lineTo(cx, cy + 90);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = INK;
  c.font = "600 20px system-ui, sans-serif";
  c.textAlign = "center";
  c.fillText(forward > 0.5 ? lbl.protrusion : lbl.occlusion, cx, cy + 124);
}

function drawScreen(c: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const lbl = state.labels;
  const bg = c.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#f6faf9");
  bg.addColorStop(1, "#e6f1ef");
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);
  c.fillStyle = TEAL;
  c.fillRect(0, 0, w, 96);
  c.fillStyle = "#fff";
  c.font = "700 34px system-ui, sans-serif";
  c.textAlign = "left";
  c.fillText(lbl.formTitle, 40, 60);
  c.fillStyle = TEAL_DARK;
  c.font = "600 22px system-ui, sans-serif";
  c.fillText(lbl.step, 40, 142);
  for (let i = 0; i < 3; i++) {
    roundRect(c, 40 + i * 150, 158, 138, 8, 4);
    c.fillStyle = i < 2 ? TEAL : "#cfd8d7";
    c.fill();
  }
  const cur = stepperValues(t);
  const prev = stepperValues(t - 0.3);
  drawStepper(c, 40, 230, lbl.mr, cur.mr, cur.mr > prev.mr, cur.mr < prev.mr);
  drawStepper(c, 380, 230, lbl.mp, cur.mp, cur.mp > prev.mp, cur.mp < prev.mp);
  c.fillStyle = INK;
  c.font = "600 22px system-ui, sans-serif";
  c.textAlign = "left";
  c.fillText(lbl.range, 720, 244);
  c.fillStyle = TEAL;
  c.font = "700 64px system-ui, sans-serif";
  c.fillText(String(cur.mp - cur.mr), 720, 318);
  roundRect(c, 40, 360, w - 80, 360, 24);
  c.fillStyle = "#fff";
  c.fill();
  c.strokeStyle = "#d8e3e1";
  c.lineWidth = 2;
  c.stroke();
  drawTeeth(c, w / 2, 520, t, lbl);
}

function drawGlass(c: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  c.clearRect(0, 0, w, h);
  const cycle = t % 15;
  const fadeOut = 1 - ease(clamp((cycle - 13) / 2, 0, 1));
  const titleA = ease(clamp(cycle / 0.8, 0, 1)) * fadeOut;
  c.globalAlpha = titleA;
  c.fillStyle = "#ffffff";
  c.shadowColor = "rgba(0,40,36,0.45)";
  c.shadowBlur = 12;
  c.textAlign = "left";
  c.font = "700 54px system-ui, sans-serif";
  c.fillText(state.title, 48, 96);
  c.shadowBlur = 0;
  const steps = state.steps;
  const active = clamp(Math.floor((cycle - 3) / 1.6), -1, 3);
  const rowH = 118;
  const top = 176;
  steps.forEach((s, i) => {
    // Labels first, one after another.
    const a = ease(clamp((cycle - 0.8 - i * 0.45) / 0.5, 0, 1)) * fadeOut;
    const y = top + i * rowH;
    const finished = i < active || (i === 3 && cycle > 3 + 4 * 1.6);
    const now = i === active && !finished;
    c.globalAlpha = a;
    if (i < steps.length - 1) {
      c.fillStyle = "rgba(255,255,255,0.35)";
      c.fillRect(70, y + 40, 4, rowH - 20);
      if (finished) {
        c.fillStyle = "#7ff0e2";
        c.fillRect(70, y + 40, 4, rowH - 20);
      }
    }
    // Highlight comes after the labels have appeared.
    const dotX = 72;
    const dotY = y + 20;
    if (finished || now) {
      const pulse = now ? (Math.sin(t * 5) + 1) / 2 : 0;
      c.fillStyle = `rgba(127,240,226,${0.25 + pulse * 0.25})`;
      c.beginPath();
      c.arc(dotX, dotY, 30 + pulse * 6, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = finished ? "#7ff0e2" : now ? "#ffffff" : "rgba(255,255,255,0.3)";
    c.beginPath();
    c.arc(dotX, dotY, 17, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = finished || now ? "#ffffff" : "rgba(255,255,255,0.65)";
    c.font = `${now ? 700 : 600} 38px system-ui, sans-serif`;
    c.fillText(s.label, 120, y + 32);
    c.font = "500 26px system-ui, sans-serif";
    c.fillStyle = finished ? "#bff7ef" : "rgba(255,255,255,0.6)";
    // The content defines the status words once: Done / In progress / Pending
    // sit on the first, third and last step of the order timeline.
    const statusDone = steps[0]?.status ?? "";
    const statusActive = steps[2]?.status ?? "";
    const statusPending = steps[steps.length - 1]?.status ?? "";
    const status = finished ? statusDone : i === active ? statusActive : statusPending;
    c.fillText(status, 120, y + 70);
  });
  // Computed progress bar.
  const frac = clamp((cycle - 3) / (4 * 1.6), 0, 1);
  c.globalAlpha = titleA;
  roundRect(c, 48, h - 90, w - 96, 14, 7);
  c.fillStyle = "rgba(255,255,255,0.28)";
  c.fill();
  roundRect(c, 48, h - 90, Math.max(14, (w - 96) * ease(frac)), 14, 7);
  c.fillStyle = "#7ff0e2";
  c.fill();
  c.globalAlpha = 1;
}

let cleanup: (() => void) | null = null;

async function start(el: HTMLDivElement): Promise<void> {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") ?? probe.getContext("webgl"))) {
    failed.value = true;
    return;
  }
  const THREE = await import("three");
  const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0.1, 8.2);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-3, 4, 5);
  scene.add(key);

  const rig = new THREE.Group();
  scene.add(rig);

  const slab = (w: number, h: number, r: number, depth: number, bevel: number): InstanceType<typeof THREE.ExtrudeGeometry> => {
    const s = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6, curveSegments: 20 });
    g.translate(0, 0, -depth / 2);
    return g;
  };

  // Tablet: aluminium slab with a canvas-texture screen.
  const tablet = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b3a39, metalness: 0.9, roughness: 0.28 });
  tablet.add(new THREE.Mesh(slab(4, 3, 0.26, 0.14, 0.05), bodyMat));
  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = 1024;
  screenCanvas.height = 768;
  const sctx = screenCanvas.getContext("2d");
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = 8;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 2.7), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.z = 0.125;
  tablet.add(screen);
  tablet.position.set(-0.35, 0.1, 0);
  rig.add(tablet);

  // Liquid glass card floating in front of the tablet.
  const glass = new THREE.Group();
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 1,
    thickness: 1.4,
    ior: 1.45,
    roughness: 0.12,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    attenuationColor: new THREE.Color(0x9ee9df),
    attenuationDistance: 2.2,
    envMapIntensity: 1.6,
  });
  glass.add(new THREE.Mesh(slab(1.9, 2.5, 0.34, 0.2, 0.08), glassMat));
  const glassCanvas = document.createElement("canvas");
  glassCanvas.width = 512;
  glassCanvas.height = 672;
  const gctx = glassCanvas.getContext("2d");
  const glassTex = new THREE.CanvasTexture(glassCanvas);
  glassTex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 2.36),
    new THREE.MeshBasicMaterial({ map: glassTex, transparent: true, toneMapped: false, depthWrite: false }),
  );
  label.position.z = 0.2;
  glass.add(label);
  glass.position.set(1.65, -0.35, 1.0);
  rig.add(glass);

  const resize = (): void => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / h;
    camera.fov = w / h < 1.1 ? 44 : 32;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const onMove = (e: PointerEvent): void => {
    const r = el.getBoundingClientRect();
    pointer.x = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
    pointer.y = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  const frame = (t: number): void => {
    if (sctx) drawScreen(sctx, 1024, 768, t);
    if (gctx) drawGlass(gctx, 512, 672, t);
    screenTex.needsUpdate = true;
    glassTex.needsUpdate = true;
    pointer.sx += (pointer.x - pointer.sx) * 0.06;
    pointer.sy += (pointer.y - pointer.sy) * 0.06;
    const sway = reduce ? 0 : Math.sin(t * 0.4) * 0.1;
    rig.rotation.y = -0.4 + pointer.sx * 0.28 + sway;
    rig.rotation.x = 0.16 + pointer.sy * 0.14;
    rig.position.y = reduce ? 0 : Math.sin(t * 0.8) * 0.06;
    glass.position.z = 1.0 + (reduce ? 0 : Math.sin(t * 0.9 + 1) * 0.1);
    glass.rotation.y = 0.12 + Math.sin(t * 0.6) * (reduce ? 0 : 0.08);
    glass.rotation.z = reduce ? 0 : Math.sin(t * 0.5) * 0.03;
    renderer.render(scene, camera);
  };

  let raf = 0;
  let visible = true;
  const clock = new THREE.Clock();
  const loop = (): void => {
    raf = requestAnimationFrame(loop);
    if (visible) frame(clock.getElapsedTime());
  };
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((en) => en.isIntersecting);
  });
  io.observe(el);

  if (reduce) {
    // Static, fully revealed state: no loop.
    frame(11);
  } else {
    loop();
  }

  cleanup = (): void => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    window.removeEventListener("pointermove", onMove);
    envTex.dispose();
    pmrem.dispose();
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material;
        (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      }
    });
    screenTex.dispose();
    glassTex.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

onMounted(() => {
  if (host.value) {
    start(host.value).catch(() => {
      failed.value = true;
    });
  }
});
onBeforeUnmount(() => cleanup?.());
</script>

<template>
  <div class="julio-hero3d" role="img" :aria-label="labels.alt">
    <img v-if="failed" class="julio-hero3d__fallback" :src="fallbackSrc" alt="" />
    <div v-show="!failed" ref="host" class="julio-hero3d__stage"></div>
  </div>
</template>

<style scoped>
.julio-hero3d {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  max-height: 560px;
}
.julio-hero3d__stage {
  position: absolute;
  inset: 0;
}
.julio-hero3d__fallback {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: var(--website-card-radius, 16px);
}
</style>
