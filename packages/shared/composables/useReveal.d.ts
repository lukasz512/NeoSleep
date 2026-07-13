import { type Ref } from "vue";
/**
 * Reveal multiple elements with a single call.
 * Returns a tuple of booleans in the same order as the input refs.
 *
 * @example
 * const [heroVisible, statsVisible] = useRevealGroup([heroRef, statsRef], 0.08)
 */
export declare function useRevealGroup(targets: Ref<HTMLElement | null>[], threshold?: number): Ref<boolean>[];
/**
 * One-shot reveal composable — returns a boolean ref that becomes `true`
 * when the target element enters the viewport, then stops observing.
 *
 * Nie używa @vueuse/core celowo — platform/shared nie jest paczką workspace,
 * więc zewnętrzne zależności nie są rozwiązywalne przez Rollup przy buildzie.
 *
 * @example
 * const heroRef = ref<HTMLElement | null>(null)
 * const heroVisible = useReveal(heroRef)
 * const statsVisible = useReveal(statsRef, 0.15)
 */
export declare function useReveal(target: Ref<HTMLElement | null>, threshold?: number): Ref<boolean>;
