import type { JulioLang } from "./julioContent";

/** Labels drawn inside the animated 3D hero (tablet screen and glass card). */
export interface JulioHeroLabels {
  formTitle: string;
  step: string;
  mr: string;
  mp: string;
  range: string;
  occlusion: string;
  protrusion: string;
  alt: string;
}

export const julioHeroLabels: Record<JulioLang, JulioHeroLabels> = {
  es: {
    formTitle: "Nueva solicitud de dispositivo",
    step: "Paso 2 de 3 · Posición mandibular",
    mr: "MR",
    mp: "MP",
    range: "Rango avance mandibular",
    occlusion: "En oclusión",
    protrusion: "En protrusión (SP)",
    alt: "Tableta con el formulario de pedido y la tarjeta de cristal Mi pedido",
  },
  en: {
    formTitle: "New device request",
    step: "Step 2 of 3 · Mandibular position",
    mr: "MR",
    mp: "MP",
    range: "Mandibular advance range",
    occlusion: "In occlusion",
    protrusion: "In protrusion (SP)",
    alt: "Tablet showing the order form and the Mi pedido glass card",
  },
};
