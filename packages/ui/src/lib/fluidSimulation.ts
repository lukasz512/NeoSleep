/**
 * Real-time fluid (Navier-Stokes) simulation on a WebGL2 canvas, driven by
 * pointer movement. Adapted from the well-known MIT-licensed algorithm at
 * https://github.com/PavelDoGreat/WebGL-Fluid-Simulation (the same one
 * https://v2.inspira-ui.com/docs/en/components/cursors/fluid-cursor is
 * itself based on), trimmed to its core solver (advection, curl/vorticity
 * confinement, pressure projection) and a plain alpha-blended dye display —
 * no bloom/sunrays/color-palette UI, since this always runs standalone
 * behind a card, never as a full playground.
 *
 * This is intentionally loaded via dynamic import (see FluidCursorTrail.vue)
 * so it never ships to a connection too slow to want it.
 */

interface Fbo {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach(gl: WebGL2RenderingContext, unit: number): number;
}

interface DoubleFbo {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: Fbo;
  write: Fbo;
  swap(): void;
}

interface Pointer {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  down: boolean;
  moved: boolean;
  color: [number, number, number];
}

export interface FluidSimulationHandle {
  destroy(): void;
}

// Tuned for a calm, clinical feel — soft teal ripples that drift and fade,
// not colorful chaotic smoke. Resolution is trimmed from the demo defaults
// (128/512) since the effect itself is deliberately small/faint now — this
// is the resolution floor before it starts looking visibly blocky.
const config = {
  simResolution: 96,
  dyeResolution: 320,
  // High dissipation = a short-lived ripple that settles quickly rather than
  // lingering or swirling.
  densityDissipation: 3,
  velocityDissipation: 2.5,
  pressure: 0.8,
  // Jacobi pressure solve is the single most expensive part of each frame
  // (one full-screen pass per iteration) — 14 is indistinguishable from 20
  // at this force/scale, for ~30% less GPU work every frame.
  pressureIterations: 14,
  // Near-zero curl = almost no vorticity confinement, so motion just drifts
  // outward instead of curling into mushroom-cap swirls.
  curl: 0.4,
  // Small and gentle — a precise, understated point of motion, not a
  // noticeable smear across the screen.
  splatRadius: 0.16,
  splatForce: 1400,
};

class GlProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation>;

  constructor(gl: WebGL2RenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader) {
    this.program = createProgram(gl, vertexShader, fragmentShader);
    this.uniforms = getUniforms(gl, this.program);
  }

  bind(gl: WebGL2RenderingContext): void {
    gl.useProgram(this.program);
  }
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info ?? "unknown"}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    throw new Error(`Program link error: ${info ?? "unknown"}`);
  }
  return program;
}

function getUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): Record<string, WebGLUniformLocation> {
  const uniforms: Record<string, WebGLUniformLocation> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    const location = gl.getUniformLocation(program, info.name);
    if (location) uniforms[info.name] = location;
  }
  return uniforms;
}

const BASE_VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const COPY_SHADER = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTexture;
out vec4 fragColor;
void main () { fragColor = texture(uTexture, vUv); }`;

const CLEAR_SHADER = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
out vec4 fragColor;
void main () { fragColor = value * texture(uTexture, vUv); }`;

const SPLAT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
out vec4 fragColor;
void main () {
  vec2 p = vUv - point.xy;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}`;

const ADVECTION_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
out vec4 fragColor;
void main () {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  vec4 result = texture(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  fragColor = result / decay;
}`;

const DIVERGENCE_SHADER = `#version 300 es
precision mediump float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
out vec4 fragColor;
void main () {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

const CURL_SHADER = `#version 300 es
precision mediump float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
out vec4 fragColor;
void main () {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}`;

const VORTICITY_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
out vec4 fragColor;
void main () {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 vel = texture(uVelocity, vUv).xy;
  vel += force * dt;
  vel = min(max(vel, -1000.0), 1000.0);
  fragColor = vec4(vel, 0.0, 1.0);
}`;

const PRESSURE_SHADER = `#version 300 es
precision mediump float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
out vec4 fragColor;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;

const GRADIENT_SUBTRACT_SHADER = `#version 300 es
precision mediump float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
out vec4 fragColor;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  fragColor = vec4(velocity, 0.0, 1.0);
}`;

const DISPLAY_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTexture;
out vec4 fragColor;
void main () {
  // The advected/pressure-projected dye buffer can develop small per-channel
  // instabilities (a channel dips below zero while others stay positive) —
  // at low resolution/iteration counts this reads as dark/black patches
  // ("burning embers") instead of a clean fade. Rather than trust the dye
  // buffer's own RGB, use only its magnitude to modulate one fixed pastel
  // green: the trail can then only ever be "more or less of this exact
  // color", never black, never a stray hue.
  vec3 raw = texture(uTexture, vUv).rgb;
  float intensity = clamp(max(raw.r, max(raw.g, raw.b)), 0.0, 1.0);
  vec3 pastelGreen = vec3(0.72, 0.93, 0.80);
  fragColor = vec4(pastelGreen * intensity, intensity);
}`;

function getResolution(resolution: number, width: number, height: number): { width: number; height: number } {
  let aspectRatio = width / height;
  if (aspectRatio < 1) aspectRatio = 1 / aspectRatio;
  const min = Math.round(resolution);
  const max = Math.round(resolution * aspectRatio);
  if (width > height) return { width: max, height: min };
  return { width: min, height: max };
}

export function createFluidSimulation(canvas: HTMLCanvasElement): FluidSimulationHandle | null {
  const glContext = canvas.getContext("webgl2", { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false }) as WebGL2RenderingContext | null;
  if (!glContext) return null;
  // A `const` narrowed by the check above still widens back to `T | null`
  // inside nested closures (blit/step/render/frame etc. below) — TS doesn't
  // carry flow narrowing across function boundaries. Re-binding to a
  // non-nullable-typed local fixes that at the type level instead of the
  // (unprovable-to-the-compiler) flow level.
  const gl: WebGL2RenderingContext = glContext;

  const floatExt = gl.getExtension("EXT_color_buffer_float");
  const linearExt = gl.getExtension("OES_texture_float_linear");
  if (!floatExt) return null;
  const filtering = linearExt ? gl.LINEAR : gl.NEAREST;

  gl.clearColor(0, 0, 0, 0);

  // Fullscreen quad shared by every pass.
  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  const quadIndex = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIndex);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function blit(target: Fbo | null): void {
    if (target) {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  const baseVertex = compileShader(gl, gl.VERTEX_SHADER, BASE_VERTEX_SHADER);
  const copyProgram = new GlProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, COPY_SHADER));
  const clearProgram = new GlProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, CLEAR_SHADER));
  const splatProgram = new GlProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, SPLAT_SHADER));
  const advectionProgram = new GlProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, ADVECTION_SHADER));
  const divergenceProgram = new GlProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, DIVERGENCE_SHADER));
  const curlProgram = new GlProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, CURL_SHADER));
  const vorticityProgram = new GlProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, VORTICITY_SHADER));
  const pressureProgram = new GlProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, PRESSURE_SHADER));
  const gradientSubtractProgram = new GlProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, GRADIENT_SUBTRACT_SHADER));
  const displayProgram = new GlProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, DISPLAY_SHADER));

  function createFbo(w: number, h: number): Fbo {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    if (!texture) throw new Error("Failed to create texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtering);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtering);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);

    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error("Failed to create framebuffer");
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      attach(glCtx, unit) {
        glCtx.activeTexture(glCtx.TEXTURE0 + unit);
        glCtx.bindTexture(glCtx.TEXTURE_2D, texture);
        return unit;
      },
    };
  }

  function createDoubleFbo(w: number, h: number): DoubleFbo {
    let fbo1 = createFbo(w, h);
    let fbo2 = createFbo(w, h);
    return {
      width: w,
      height: h,
      texelSizeX: fbo1.texelSizeX,
      texelSizeY: fbo1.texelSizeY,
      get read() { return fbo1; },
      get write() { return fbo2; },
      swap() {
        const temp = fbo1;
        fbo1 = fbo2;
        fbo2 = temp;
      },
    };
  }

  let width = 0;
  let height = 0;
  let dye: DoubleFbo;
  let velocity: DoubleFbo;
  let divergence: Fbo;
  let curlFbo: Fbo;
  let pressure: DoubleFbo;

  function initFramebuffers(): void {
    const simRes = getResolution(config.simResolution, width, height);
    const dyeRes = getResolution(config.dyeResolution, width, height);
    velocity = createDoubleFbo(simRes.width, simRes.height);
    dye = createDoubleFbo(dyeRes.width, dyeRes.height);
    divergence = createFbo(simRes.width, simRes.height);
    curlFbo = createFbo(simRes.width, simRes.height);
    pressure = createDoubleFbo(simRes.width, simRes.height);
  }

  // The canvas is `position: fixed` and covers the whole viewport (see
  // FluidCursorTrail.vue) — deliberately independent of its parent element's
  // box, which sits inset by the layout's own padding. Size and pointer
  // coordinates are tracked against the viewport/window to match.
  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(window.innerWidth * dpr));
    const h = Math.max(1, Math.round(window.innerHeight * dpr));
    if (w === width && h === height) return;
    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;
    initFramebuffers();
  }

  resize();
  window.addEventListener("resize", resize);

  const pointer: Pointer = { x: 0, y: 0, prevX: 0, prevY: 0, down: false, moved: false, color: [1, 1, 1] };
  // The dye buffer only needs to carry *magnitude* now — DISPLAY_SHADER maps
  // that magnitude onto one fixed pastel green regardless of what's actually
  // stored here, so there's no hue/saturation math left to do (or to drift
  // into an unstable/off color) on this side. Kept deliberately faint —
  // "medical grade" reads as barely-there and precise, not as a visible
  // colorful smear following the cursor around.
  const TRAIL_INTENSITY = 0.08;

  function nextSplatMagnitude(): [number, number, number] {
    const m = TRAIL_INTENSITY * (0.85 + Math.random() * 0.3);
    return [m, m, m];
  }

  function splat(x: number, y: number, dx: number, dy: number, color: [number, number, number]): void {
    splatProgram.bind(gl);
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(gl, 0));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, width / height);
    gl.uniform2f(splatProgram.uniforms.point, x, y);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0);
    gl.uniform1f(splatProgram.uniforms.radius, config.splatRadius / 100);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(gl, 0));
    gl.uniform3f(splatProgram.uniforms.color, color[0], color[1], color[2]);
    blit(dye.write);
    dye.swap();
  }

  function handlePointerMove(e: PointerEvent): void {
    lastActivityTime = performance.now();
    startLoop();

    const x = e.clientX / window.innerWidth;
    const y = 1 - e.clientY / window.innerHeight;

    if (!pointer.down) {
      pointer.down = true;
      pointer.x = x;
      pointer.y = y;
      pointer.prevX = x;
      pointer.prevY = y;
      return;
    }

    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;
    pointer.x = x;
    pointer.y = y;
    pointer.moved = true;
  }

  function handlePointerOut(e: PointerEvent): void {
    // relatedTarget is null specifically when the pointer leaves the whole
    // document (as opposed to moving between elements within it).
    if (!e.relatedTarget) pointer.down = false;
  }

  window.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("pointerout", handlePointerOut);

  // The single biggest resource cost is running ~15 full-screen GPU passes
  // every frame forever, including while the pointer sits still and nothing
  // is left on screen (the dye has already fully dissipated by then given
  // densityDissipation above). Stop the rAF loop entirely once idle for a
  // bit longer than a full fade takes, and only pay for any of this again
  // once the pointer actually moves. Needs real margin past the ~2.3s a full
  // decay takes at densityDissipation=3 — cutting it close freezes the last
  // rendered frame mid-fade instead of on a fully-settled (invisible) one.
  const IDLE_TIMEOUT_MS = 3500;
  let lastActivityTime = performance.now();
  let lastTime = performance.now();
  let rafId = 0;
  let running = false;

  function startLoop(): void {
    if (running) return;
    running = true;
    lastTime = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop(): void {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function handleVisibilityChange(): void {
    if (document.hidden) {
      stopLoop();
    } else if (performance.now() - lastActivityTime < IDLE_TIMEOUT_MS) {
      startLoop();
    }
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);

  function step(dt: number): void {
    gl.disable(gl.BLEND);

    curlProgram.bind(gl);
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(gl, 0));
    blit(curlFbo);

    vorticityProgram.bind(gl);
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(gl, 0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curlFbo.attach(gl, 1));
    gl.uniform1f(vorticityProgram.uniforms.curl, config.curl);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    divergenceProgram.bind(gl);
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(gl, 0));
    blit(divergence);

    clearProgram.bind(gl);
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(gl, 0));
    gl.uniform1f(clearProgram.uniforms.value, config.pressure);
    blit(pressure.write);
    pressure.swap();

    pressureProgram.bind(gl);
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(gl, 0));
    for (let i = 0; i < config.pressureIterations; i++) {
      gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(gl, 1));
      blit(pressure.write);
      pressure.swap();
    }

    gradientSubtractProgram.bind(gl);
    gl.uniform2f(gradientSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradientSubtractProgram.uniforms.uPressure, pressure.read.attach(gl, 0));
    gl.uniform1i(gradientSubtractProgram.uniforms.uVelocity, velocity.read.attach(gl, 1));
    blit(velocity.write);
    velocity.swap();

    advectionProgram.bind(gl);
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(gl, 0));
    gl.uniform1i(advectionProgram.uniforms.uSource, velocity.read.attach(gl, 0));
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.velocityDissipation);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(gl, 0));
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(gl, 1));
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.densityDissipation);
    blit(dye.write);
    dye.swap();
  }

  function render(): void {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    displayProgram.bind(gl);
    gl.uniform1i(displayProgram.uniforms.uTexture, dye.read.attach(gl, 0));
    blit(null);
  }

  function frame(now: number): void {
    const dt = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;

    if (pointer.moved) {
      pointer.moved = false;
      const dx = (pointer.x - pointer.prevX) * config.splatForce;
      const dy = (pointer.y - pointer.prevY) * config.splatForce;
      pointer.color = nextSplatMagnitude();
      splat(pointer.x, pointer.y, dx, dy, pointer.color);
    }

    step(dt);
    render();

    // Self-terminate once idle instead of unconditionally rescheduling —
    // the next pointermove restarts the loop via startLoop().
    if (now - lastActivityTime > IDLE_TIMEOUT_MS) {
      stopLoop();
      return;
    }
    rafId = requestAnimationFrame(frame);
  }

  startLoop();

  return {
    destroy() {
      stopLoop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerout", handlePointerOut);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      const loseContext = gl.getExtension("WEBGL_lose_context");
      loseContext?.loseContext();
    },
  };
}
