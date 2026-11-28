import type { JulioLang } from "./julioContent";

/** Labels drawn inside the animated hero (tablet screen and glass card). */
export interface JulioHeroLabels {
  done: string;
  now: string;
  pending: string;
  ready: string;
  alt: string;
}

export const julioHeroLabels: Record<JulioLang, JulioHeroLabels> = {
  es: {
    done: "Hecho",
    now: "En curso",
    pending: "Pendiente",
    ready: "Pedido listo",
    alt: "Tableta con el formulario de pedido y la tarjeta de cristal Mi pedido",
  },
  en: {
    done: "Done",
    now: "In progress",
    pending: "Pending",
    ready: "Order ready",
    alt: "Tablet showing the order form and the Mi pedido glass card",
  },
};
