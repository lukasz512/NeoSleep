<!-- The pause between "Cómo trabajamos" and the clients (O1 = O-A, 2026-09-28): the AJ monogram
     from the client's logo, drawn like a Leonardo sketch (round 8, Łukasz 2026-09-29). The page stops
     on it for about two scroll swipes (lib/monogram.ts) and that scroll draws it: construction lines,
     outline, pencil hatching, solid black; then the construction lines fade and the page moves on.
     The blueprint starts very large and closes in to its size while the outline is drawn; at the end
     it settles into the client's full lockup (ALFRED · AJ · JAN, Management), written out around it. The grain comes from a light
     turbulence filter, so the lines look drawn, not ruled. On a mouse the mark is pulled toward the
     pointer like a magnet (lib/magnet.ts). Decorative only (aria-hidden). Lite: finished and still. -->
<template>
  <div
    ref="root"
    class="mono"
    :class="{ 'mono--pinned': !lite }"
    aria-hidden="true"
    :style="{
      '--pin': MONO_PIN_SCREENS,
      '--guides-out': st.guidesOut,
      '--zoom': (st.zoom * (1 - st.shift * (1 - fit))).toFixed(3),
      '--word': st.word.toFixed(3),
      '--guide': guide,
      '--draw': draw,
      '--hatch': hatch,
      '--fill': fill,
      '--mx': `${pull.x}px`,
      '--my': `${pull.y}px`,
    }"
  >
    <div class="mono__stage">
    <svg class="mono__mark" viewBox="560 163 400 400">
      <defs>
        <filter id="ajm-pencil" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="grain" />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="2.4" />
        </filter>
        <pattern id="ajm-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
          <line x1="0" y1="0" x2="0" y2="7" class="mono__hatchline" />
        </pattern>
      </defs>
      <g :transform="`translate(${(-SHIFT * st.shift).toFixed(1)} 0)`">
      <!-- construction, as in a Leonardo notebook: the letters inscribed in a circle with its square,
           and every line the letters are built on carried on past them (GUIDES below) -->
      <g class="mono__guides" filter="url(#ajm-pencil)">
        <path v-for="(d, i) in GUIDES" :key="i" pathLength="1" :d="d" :style="{ '--i': i }" />
      </g>
      <g filter="url(#ajm-pencil)">
        <path class="mono__hatch" :d="A" :transform="TA" />
        <path class="mono__hatch" :d="J" :transform="TJ" />
        <path class="mono__ink" pathLength="1" :d="A" :transform="TA" />
        <path class="mono__ink" pathLength="1" :d="J" :transform="TJ" />
      </g>
      <!-- the lockup grows out of the inked mark: ALFRED written leftwards from the A, JAN and
           "Management" written left to right -->
      <g class="mono__lock mono__lock--alfred">
        <path v-for="(w, i) in ALFRED" :key="i" :d="w.d" :transform="w.t" />
      </g>
      <g class="mono__lock mono__lock--jan">
        <path v-for="(w, i) in JAN" :key="i" :d="w.d" :transform="w.t" />
      </g>
      <g class="mono__lock mono__lock--word">
        <path v-for="(w, i) in WORD" :key="i" :d="w.d" :transform="w.t" />
      </g>
      </g>
    </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useScrollProgress } from "../lib/motion";
import { magnetPull } from "../lib/magnet";
import { MONO_PIN_SCREENS, monoStages } from "../lib/monogram";

// The two strokes of the AJ monogram, exactly as in AjLogo.vue (client file logo-white.svg).
const A = "m 0,0 v -159.584 h -15.978 v 138.067 h -2.774 l -94.825,-138.067 h -19.608 L -21.746,0 Z";
const J =
  "m 0,0 v -14.503 -92.686 c 0,-10.017 0,-20.872 -4.051,-30.046 -6.19,-14.482 -21.734,-22.788 -37.291,-22.788 -23.866,0 -41.335,16.403 -42.624,40.266 h 15.568 c 0.843,-15.123 11.915,-25.788 27.27,-25.788 23.225,0 25.565,19.183 25.565,37.728 v 93.314 H -53.061 V 0 h 37.498 z";
const TA = "matrix(1.3333333,0,0,-1.3333333,803.61933,219.06013)";
const TJ = "matrix(1.3333333,0,0,-1.3333333,894.54733,294.25667)";
/**
 * The rest of the client's lockup (logo alfred fondo blanco.ai = AjLogo.vue, same coordinates as the
 * mark above): ALFRED to the left, JAN to the right, "Management" under ALFRED. Brand colours: the
 * words in ink, "Management" in the logo's light grey; the drawn AJ stays solid black.
 */
const ALFRED = [
  { d: "M 0,0 H 24.985 L 12.666,26.83 Z M 17.09,42.368 49.034,-27.019 H 37.45 L 27.074,-4.372 H -1.998 l -10.705,-22.647 h -5.695 l 32.666,69.387 z", t: "matrix(1.3333333,0,0,-1.3333333,113.71947,398.68853)" },
  { d: "M 0,0 H 11.396 V -63.439 H 45.527 V -67.82 H 0 Z", t: "matrix(1.3333333,0,0,-1.3333333,190.78973,344.28733)" },
  { d: "M 0,0 V -4.381 H -33.062 V -28.62 h 23.909 v -4.381 H -33.062 V -67.82 H -44.458 V 0 Z", t: "matrix(1.3333333,0,0,-1.3333333,323.43,344.28733)" },
  { d: "m 0,0 h 6.568 c 2.567,0 4.931,0.351 7.083,1.026 2.163,0.678 4.032,1.641 5.627,2.896 1.589,1.25 2.829,2.759 3.721,4.55 0.892,1.787 1.344,3.785 1.344,5.991 0,2.01 -0.354,3.87 -1.075,5.575 -0.709,1.699 -1.699,3.166 -2.97,4.381 -1.265,1.219 -2.774,2.166 -4.534,2.848 -1.747,0.684 -3.66,1.023 -5.743,1.023 H 0 Z m -11.402,32.521 h 23.476 c 4.081,0 7.662,-0.43 10.729,-1.307 3.068,-0.874 5.628,-2.102 7.675,-3.679 2.041,-1.573 3.586,-3.44 4.625,-5.6 1.039,-2.16 1.558,-4.518 1.558,-7.087 0,-2.102 -0.397,-4.079 -1.191,-5.915 C 34.669,7.097 33.545,5.45 32.085,3.971 30.624,2.496 28.871,1.209 26.824,0.128 c -2.041,-1.1 -4.302,-1.927 -6.77,-2.521 L 44.745,-35.299 H 31.547 L 7.98,-3.404 H 0 v -31.895 h -11.402 z", t: "matrix(1.3333333,0,0,-1.3333333,350.64067,387.64907)" },
  { d: "M 0,0 V -4.381 H -35.745 V -28.62 h 23.91 v -4.381 h -23.91 V -63.439 H 0 V -67.82 H -47.134 V 0 Z", t: "matrix(1.3333333,0,0,-1.3333333,484.51147,344.28733)" },
  { d: "m 0,0 h 12.074 c 3.831,0 7.436,0.633 10.809,1.9 3.373,1.268 6.318,3.138 8.836,5.628 2.517,2.48 4.496,5.545 5.939,9.202 1.447,3.648 2.174,7.861 2.174,12.63 0,4.158 -0.684,7.98 -2.046,11.472 -1.363,3.488 -3.269,6.495 -5.726,9.006 -2.444,2.521 -5.365,4.482 -8.762,5.891 -3.391,1.417 -7.1,2.126 -11.127,2.126 H 0 Z m -11.396,62.859 h 22.547 c 6.978,0 12.979,-0.645 17.988,-1.94 5.017,-1.302 9.202,-3.379 12.539,-6.232 3.831,-3.248 6.709,-6.99 8.646,-11.228 1.924,-4.234 2.896,-8.866 2.896,-13.903 0,-4.769 -0.868,-9.249 -2.609,-13.437 C 48.875,11.931 46.346,8.267 43.022,5.142 39.686,2.004 35.586,-0.455 30.704,-2.264 25.816,-4.06 20.219,-4.961 13.925,-4.961 h -25.321 z", t: "matrix(1.3333333,0,0,-1.3333333,516.58573,428.0992)" },
];
const JAN = [
  { d: "m 0,0 c 0,-2.475 -0.22,-4.906 -0.672,-7.302 -0.464,-2.407 -1.369,-4.561 -2.731,-6.455 -1.363,-1.897 -3.318,-3.427 -5.848,-4.607 -2.529,-1.17 -5.866,-1.747 -10.026,-1.747 -2.329,0 -4.455,0.214 -6.361,0.66 -1.895,0.433 -3.618,0.998 -5.158,1.698 -1.545,0.7 -2.932,1.488 -4.16,2.389 -1.235,0.893 -2.389,1.778 -3.459,2.649 l 3.599,4.827 c 0.758,-0.617 1.662,-1.384 2.701,-2.288 1.063,-0.92 2.212,-1.796 3.464,-2.631 1.253,-0.843 2.548,-1.567 3.893,-2.166 1.344,-0.605 2.706,-0.904 4.063,-0.904 2.987,0 5.285,0.788 6.898,2.362 1.601,1.57 2.408,3.684 2.408,6.357 V 48.393 H 0 Z", t: "matrix(1.3333333,0,0,-1.3333333,997.73613,408.81133)" },
  { d: "M 0,0 H 24.979 L 12.66,26.83 Z M 17.084,42.368 49.028,-27.019 H 37.437 L 27.068,-4.372 H -2.004 L -12.71,-27.019 h -5.706 l 32.671,69.387 z", t: "matrix(1.3333333,0,0,-1.3333333,1033.9741,398.68853)" },
  { d: "m 0,0 h 6.373 l 44.458,-49.563 h 0.44 V 0 h 5.016 V -69.436 H 53.659 L 5.499,-14.264 H 5.108 V -67.82 l -5.108,0 z", t: "matrix(1.3333333,0,0,-1.3333333,1111.0444,344.28733)" },
];
const WORD = [
  { d: "m 0,0 h 0.128 l 9.758,24.838 h 5.151 V -5.725 H 10.894 V 17.179 L 10.772,17.198 1.515,-5.725 h -2.878 l -9.531,23.68 -0.123,-0.027 V -5.725 h -4.143 v 30.563 h 5.444 z", t: "matrix(1.3333333,0,0,-1.3333333,337.51627,499.98787)" },
  { d: "M 0,0 C 1.504,0 2.848,0.385 4.051,1.155 5.255,1.918 6.037,2.804 6.404,3.794 V 7.488 H 1.76 C 0.098,7.488 -1.234,7.073 -2.236,6.236 -3.232,5.389 -3.739,4.402 -3.739,3.269 -3.739,2.257 -3.421,1.47 -2.792,0.877 -2.163,0.287 -1.228,0 0,0 m 6.868,-3.025 c -0.146,0.679 -0.25,1.287 -0.33,1.812 -0.073,0.525 -0.122,1.051 -0.134,1.589 -0.77,-1.091 -1.772,-2.005 -3.013,-2.744 -1.24,-0.727 -2.572,-1.1 -4.002,-1.1 -2.359,0 -4.167,0.605 -5.401,1.815 -1.24,1.21 -1.858,2.878 -1.858,5.01 0,2.17 0.874,3.859 2.634,5.081 1.753,1.238 4.137,1.843 7.149,1.843 h 4.491 v 2.245 c 0,1.335 -0.404,2.383 -1.222,3.168 -0.807,0.77 -1.955,1.158 -3.44,1.158 -1.345,0 -2.426,-0.336 -3.257,-1.008 -0.819,-0.669 -1.234,-1.476 -1.234,-2.414 l -3.923,-0.043 -0.043,0.126 c -0.104,1.649 0.672,3.162 2.316,4.537 1.65,1.374 3.764,2.056 6.379,2.056 2.566,0 4.644,-0.648 6.208,-1.965 1.564,-1.304 2.352,-3.192 2.352,-5.655 V 1.543 c 0,-0.807 0.043,-1.592 0.129,-2.34 0.085,-0.758 0.232,-1.507 0.464,-2.228 z", t: "matrix(1.3333333,0,0,-1.3333333,387.26907,503.58853)" },
  { d: "m 0,0 0.293,-3.385 c 0.752,1.216 1.699,2.147 2.835,2.814 1.149,0.657 2.444,0.993 3.899,0.993 2.45,0 4.338,-0.722 5.688,-2.151 1.345,-1.439 2.017,-3.651 2.017,-6.645 v -14.335 h -4.137 v 14.247 c 0,2.001 -0.391,3.427 -1.185,4.271 -0.794,0.84 -1.992,1.252 -3.617,1.252 -1.284,0 -2.359,-0.254 -3.245,-0.764 C 1.656,-4.216 0.954,-4.931 0.44,-5.851 V -22.709 H -3.703 V 0 Z", t: "matrix(1.3333333,0,0,-1.3333333,425.7228,477.34307)" },
  { d: "M 0,0 C 1.497,0 2.848,0.385 4.051,1.155 5.255,1.918 6.037,2.804 6.403,3.794 V 7.488 H 1.759 C 0.098,7.488 -1.234,7.073 -2.236,6.236 -3.239,5.389 -3.74,4.402 -3.74,3.269 -3.74,2.257 -3.422,1.47 -2.792,0.877 -2.163,0.287 -1.234,0 0,0 M 6.862,-3.025 C 6.721,-2.346 6.611,-1.738 6.538,-1.213 6.465,-0.688 6.416,-0.162 6.403,0.376 5.634,-0.715 4.631,-1.629 3.391,-2.368 c -1.241,-0.727 -2.573,-1.1 -4.002,-1.1 -2.365,0 -4.167,0.605 -5.402,1.815 -1.246,1.21 -1.863,2.878 -1.863,5.01 0,2.17 0.886,3.859 2.633,5.081 1.76,1.238 4.143,1.843 7.149,1.843 h 4.497 v 2.245 c 0,1.335 -0.403,2.383 -1.222,3.168 -0.806,0.77 -1.955,1.158 -3.44,1.158 -1.35,0 -2.426,-0.336 -3.256,-1.008 C -2.334,15.175 -2.75,14.368 -2.75,13.43 l -3.922,-0.043 -0.049,0.126 c -0.098,1.649 0.678,3.162 2.322,4.537 1.643,1.374 3.77,2.056 6.379,2.056 2.566,0 4.644,-0.648 6.208,-1.965 1.564,-1.304 2.352,-3.192 2.352,-5.655 V 1.543 c 0,-0.807 0.043,-1.592 0.129,-2.34 0.079,-0.758 0.232,-1.507 0.451,-2.228 z", t: "matrix(1.3333333,0,0,-1.3333333,474.2952,503.58853)" },
  { d: "m 0,0 c 0,-2.279 0.477,-4.115 1.412,-5.508 0.941,-1.378 2.388,-2.075 4.344,-2.075 1.247,0 2.292,0.284 3.128,0.853 0.844,0.565 1.534,1.362 2.078,2.407 V 6.125 C 10.43,7.085 9.74,7.858 8.884,8.423 8.029,8.991 7.003,9.273 5.799,9.273 3.825,9.273 2.365,8.454 1.424,6.819 0.477,5.179 0,3.049 0,0.434 Z m -4.13,0.434 c 0,3.657 0.782,6.605 2.34,8.839 1.558,2.248 3.739,3.36 6.544,3.36 1.442,0 2.7,-0.284 3.794,-0.871 1.094,-0.583 2.01,-1.423 2.744,-2.511 l 0.513,2.961 h 3.293 v -22.841 c 0,-2.902 -0.849,-5.147 -2.541,-6.709 -1.693,-1.555 -4.137,-2.334 -7.326,-2.334 -1.088,0 -2.273,0.144 -3.532,0.455 -1.271,0.297 -2.383,0.709 -3.355,1.223 l 0.63,3.213 c 0.8,-0.421 1.759,-0.754 2.89,-1.017 1.13,-0.263 2.23,-0.385 3.324,-0.385 2.016,0 3.483,0.456 4.399,1.366 0.916,0.922 1.375,2.316 1.375,4.188 v 2.585 C 10.216,-9 9.336,-9.718 8.298,-10.204 7.259,-10.692 6.062,-10.94 4.705,-10.94 c -2.774,0 -4.937,1.002 -6.495,3.012 -1.558,2.01 -2.34,4.653 -2.34,7.928 z", t: "matrix(1.3333333,0,0,-1.3333333,512.34107,493.62507)" },
  { d: "m 0,0 c -1.43,0 -2.627,-0.553 -3.575,-1.677 -0.947,-1.1 -1.521,-2.533 -1.729,-4.268 l 0.037,-0.099 H 4.986 v 0.334 c 0,1.646 -0.415,3.018 -1.222,4.096 C 2.945,-0.541 1.699,0 0,0 m 0.66,-20.32 c -3.263,0 -5.811,1.042 -7.638,3.126 -1.821,2.083 -2.737,4.827 -2.737,8.236 v 0.92 c 0,3.263 0.94,5.951 2.822,8.092 1.883,2.133 4.18,3.2 6.893,3.2 3.043,0 5.316,-0.941 6.838,-2.835 1.515,-1.886 2.278,-4.4 2.278,-7.532 V -9.297 H -5.413 l -0.062,-0.11 c 0,-2.273 0.501,-4.124 1.516,-5.542 1.001,-1.433 2.541,-2.135 4.619,-2.135 1.393,0 2.621,0.192 3.679,0.598 1.056,0.395 1.967,0.941 2.718,1.647 l 1.619,-2.688 C 7.864,-18.309 6.794,-18.976 5.462,-19.507 4.13,-20.048 2.53,-20.32 0.66,-20.32", t: "matrix(1.3333333,0,0,-1.3333333,563.52053,481.11893)" },
  { d: "m 0,0 0.293,-2.979 c 0.733,1.079 1.68,1.913 2.817,2.515 1.142,0.589 2.469,0.886 3.978,0.886 1.515,0 2.81,-0.346 3.898,-1.055 1.082,-0.696 1.894,-1.75 2.444,-3.14 0.727,1.295 1.674,2.322 2.841,3.07 1.167,0.749 2.536,1.125 4.1,1.125 2.316,0 4.143,-0.801 5.487,-2.38 1.344,-1.592 2.016,-3.984 2.016,-7.164 v -13.587 h -4.142 v 13.626 c 0,2.234 -0.379,3.828 -1.155,4.748 -0.764,0.932 -1.912,1.396 -3.44,1.396 -1.411,0 -2.56,-0.495 -3.434,-1.466 -0.868,-0.975 -1.387,-2.219 -1.54,-3.716 v -0.164 -14.424 h -4.161 v 13.626 c 0,2.123 -0.391,3.675 -1.179,4.665 -0.794,0.984 -1.931,1.479 -3.41,1.479 -1.258,0 -2.303,-0.263 -3.11,-0.776 C 1.49,-4.235 0.867,-4.959 0.434,-5.903 v -16.806 h -4.137 l 0,22.709 z", t: "matrix(1.3333333,0,0,-1.3333333,598.25933,477.34307)" },
  { d: "m 0,0 c -1.436,0 -2.634,-0.553 -3.575,-1.677 -0.953,-1.1 -1.527,-2.533 -1.735,-4.268 l 0.037,-0.099 H 4.974 v 0.334 c 0,1.646 -0.398,3.018 -1.216,4.096 C 2.951,-0.541 1.692,0 0,0 m 0.641,-20.32 c -3.25,0 -5.792,1.042 -7.625,3.126 -1.821,2.083 -2.737,4.827 -2.737,8.236 v 0.92 c 0,3.263 0.946,5.951 2.828,8.092 1.876,2.133 4.174,3.2 6.893,3.2 3.036,0 5.31,-0.941 6.837,-2.835 1.515,-1.886 2.279,-4.4 2.279,-7.532 V -9.297 H -5.408 l -0.073,-0.11 c 0,-2.273 0.501,-4.124 1.515,-5.542 1.015,-1.433 2.542,-2.135 4.607,-2.135 1.418,0 2.64,0.192 3.691,0.598 1.057,0.395 1.967,0.941 2.719,1.647 L 8.67,-17.527 C 7.857,-18.309 6.788,-18.976 5.456,-19.507 4.13,-20.048 2.523,-20.32 0.641,-20.32", t: "matrix(1.3333333,0,0,-1.3333333,666.55507,481.11893)" },
  { d: "m 0,0 0.293,-3.385 c 0.746,1.216 1.711,2.147 2.835,2.814 1.149,0.657 2.444,0.993 3.898,0.993 2.457,0 4.351,-0.722 5.683,-2.151 1.35,-1.439 2.028,-3.651 2.028,-6.645 v -14.335 h -4.13 v 14.247 c 0,2.001 -0.403,3.427 -1.197,4.271 -0.782,0.84 -1.993,1.252 -3.624,1.252 -1.265,0 -2.352,-0.254 -3.238,-0.764 C 1.662,-4.216 0.953,-4.931 0.44,-5.851 V -22.709 H -3.703 V 0 Z", t: "matrix(1.3333333,0,0,-1.3333333,701.2856,477.34307)" },
  { d: "M 0,0 V -5.49 H 4.308 V -8.548 H 0 v -13.803 c 0,-1.057 0.226,-1.809 0.666,-2.236 0.44,-0.434 1.026,-0.657 1.748,-0.657 0.238,0 0.513,0.031 0.806,0.104 0.293,0.058 0.532,0.128 0.733,0.189 l 0.563,-2.832 c -0.306,-0.253 -0.764,-0.455 -1.357,-0.623 -0.599,-0.156 -1.198,-0.235 -1.784,-0.235 -1.687,0 -3.019,0.507 -4.015,1.515 -0.995,1.017 -1.496,2.612 -1.496,4.775 v 13.803 h -3.593 v 3.058 h 3.593 V 0 Z", t: "matrix(1.3333333,0,0,-1.3333333,748.0568,470.02347)" },
];
/** the lockup spans x 60–1230 (centre 645); the mark's centre is 760, so the group moves right by 115 */
const SHIFT = -115;

/**
 * The sketch's construction, in the viewBox's units. Key points of the letters (from A/J above):
 * A apex 774.6,219.1 · A foot 626,431.8 · A inner foot 652.2,431.8 / inner top 778.6,247.7 ·
 * A stem x 782.3–803.6 · baseline y 431.8 · J top bar y 294.3 (x 823.8–894.5) · J bowl ≈ 838.6,440.
 * The circle holds the letters (centre 760,363, r 200); its inscribed square is their bounding box.
 */
const C = { x: 760, y: 363, r: 200 };
const SQ = C.r / Math.SQRT2;
const line = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} L ${x2} ${y2}`;
const circle = (cx: number, cy: number, r: number) =>
  `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
/** extend the segment p→q by `a` of its length before p and `b` after q */
const ext = (px: number, py: number, qx: number, qy: number, a: number, b: number) =>
  line(px - (qx - px) * a, py - (qy - py) * a, qx + (qx - px) * b, qy + (qy - py) * b);
const GUIDES = [
  circle(C.x, C.y, C.r),
  `M ${C.x - SQ} ${C.y - SQ} h ${2 * SQ} v ${2 * SQ} h ${-2 * SQ} Z`,
  line(C.x - SQ, C.y - SQ, C.x + SQ, C.y + SQ),
  line(C.x + SQ, C.y - SQ, C.x - SQ, C.y + SQ),
  line(C.x, C.y - C.r - 14, C.x, C.y + C.r + 14),
  line(C.x - C.r - 14, C.y, C.x + C.r + 14, C.y),
  // the A: both diagonals carried past the apex and the foot
  ext(626, 431.8, 774.6, 219.1, 0.45, 0.38),
  ext(652.2, 431.8, 778.6, 247.7, 0.5, 0.55),
  // stems and bars as long pencil rules
  line(803.6, 150, 803.6, 578),
  line(782.3, 170, 782.3, 560),
  line(894.5, 170, 894.5, 560),
  line(548, 219.1, 972, 219.1),
  line(560, 294.3, 960, 294.3),
  line(548, 431.8, 972, 431.8),
  // the J's bowl, compassed
  circle(838.6, 440, 56),
  circle(838.6, 440, 35),
  // a compass arc from the A's foot through its apex
  "M 626 172.2 A 259.6 259.6 0 0 1 885.6 431.8",
];

const root = ref<HTMLElement | null>(null);
const lite = typeof document !== "undefined" && document.documentElement.classList.contains("lite");
const through = useScrollProgress(root);
// lite: the finished mark, still; otherwise every stage follows the scroll through the pinned stretch
const st = computed(() => monoStages(lite ? 1 : through.value));
const guide = computed(() => st.value.guide.toFixed(3));
const draw = computed(() => st.value.draw.toFixed(3));
const hatch = computed(() => st.value.hatch.toFixed(3));
const fill = computed(() => st.value.fill.toFixed(3));

// The finished lockup is about 2.9× as wide as the mark; on narrow screens it shrinks a little more
// so ALFRED … JAN always fits with a margin.
const fit = ref(1);
function measureFit() {
  const svg = root.value?.querySelector("svg");
  if (!svg) return;
  const markAtOne = svg.getBoundingClientRect().width / (Number(getComputedStyle(root.value!).getPropertyValue("--zoom")) || 1);
  const lockupPx = markAtOne * 2.925 * 0.5;
  fit.value = Math.min(1, (window.innerWidth * 0.9) / lockupPx);
}

// Magnet: ease toward the pull for the current pointer position, back to rest when it leaves.
const pull = reactive({ x: 0, y: 0 });
let target = { x: 0, y: 0 };
let raf = 0;
function onPointer(e: PointerEvent) {
  if (e.pointerType !== "mouse" || !root.value) return;
  const svg = root.value.firstElementChild as Element | null;
  const r = (svg ?? root.value).getBoundingClientRect();
  target = magnetPull(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  if (!raf) raf = requestAnimationFrame(tick);
}
function tick() {
  pull.x += (target.x - pull.x) * 0.12;
  pull.y += (target.y - pull.y) * 0.12;
  const settled = Math.abs(target.x - pull.x) < 0.1 && Math.abs(target.y - pull.y) < 0.1;
  raf = settled ? 0 : requestAnimationFrame(tick);
}
onMounted(() => {
  if (!lite) window.addEventListener("pointermove", onPointer, { passive: true });
  measureFit();
  window.addEventListener("resize", measureFit, { passive: true });
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", measureFit);
  window.removeEventListener("pointermove", onPointer);
  cancelAnimationFrame(raf);
});
</script>

<style scoped>
/* the stage is a full screen held while the sketch draws; the mark and its construction fill
   most of it, with air above and below */
.mono {
  --size: min(58svh, 78vw);
}
.mono--pinned {
  height: calc(100svh * (1 + var(--pin)));
}
.mono__stage {
  display: grid;
  place-items: center;
  height: 100svh;
  overflow: clip;
}
.mono--pinned .mono__stage {
  position: sticky;
  top: 0;
}
.mono__mark {
  width: var(--size);
  aspect-ratio: 1;
  overflow: visible;
  /* round 8: the blueprint starts very large and settles to its size as it is drawn */
  transform: translate3d(var(--mx, 0), var(--my, 0), 0) scale(var(--zoom, 1));
  will-change: transform;
}
/* pencil construction lines, faint, drawn first and one after another */
.mono__guides {
  opacity: calc(1 - var(--guides-out, 0));
}
.mono__guides > * {
  fill: none;
  stroke: var(--ajm-muted);
  stroke-width: 0.6; /* viewBox units: no non-scaling-stroke, which breaks pathLength dashes in Chrome */
  stroke-opacity: 0.45;
  stroke-dasharray: 1;
  stroke-dashoffset: calc(1 - clamp(0, var(--guide, 1) * 2.2 - var(--i) * 0.07, 1));
}
/* the outline, in pencil, darkening to ink as it is coloured in */
.mono__ink {
  fill: var(--ajm-ink);
  fill-opacity: var(--fill, 1);
  stroke: var(--ajm-ink);
  stroke-width: 0.9;
  stroke-linejoin: round;
  stroke-dasharray: 1;
  stroke-dashoffset: calc(1 - var(--draw, 1));
}
/* the lockup's words: written out from the mark and faded in on a smooth curve (--word is eased) */
.mono__lock {
  fill: var(--ajm-ink);
  /* squared, so the first slivers of the letters don't flicker in at full strength */
  opacity: calc(var(--word, 1) * var(--word, 1));
}
.mono__lock--alfred {
  clip-path: inset(-20% 0 -20% calc((1 - var(--word, 1)) * 100%));
}
.mono__lock--jan {
  clip-path: inset(-20% calc((1 - var(--word, 1)) * 100%) -20% 0);
}
.mono__lock--word {
  fill: var(--ajm-lockup-grey);
  clip-path: inset(-20% calc((1 - var(--word, 1)) * 100%) -20% 0);
}
/* hatching before the solid fill, like shading with a pencil */
.mono__hatch {
  fill: url(#ajm-hatch);
  opacity: var(--hatch, 1);
}
.mono__hatchline {
  stroke: var(--ajm-ink);
  stroke-width: 1.4;
}
</style>
