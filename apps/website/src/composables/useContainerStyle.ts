import { ref, computed, onMounted } from "vue";

const STORAGE_KEY = "neosleep-website-container-style";
export type ContainerStyle = "wide" | "compact";

function getStored(): ContainerStyle | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "wide" || v === "compact") return v;
  } catch (_) {}
  return null;
}

function getInitial(): ContainerStyle {
  const stored = getStored();
  if (stored !== null) return stored;
  return "compact";
}

const containerStyle = ref<ContainerStyle>(getInitial());

export function useContainerStyle() {
  const isCompact = computed(() => containerStyle.value === "compact");

  function setContainerStyle(style: ContainerStyle) {
    containerStyle.value = style;
    try {
      localStorage.setItem(STORAGE_KEY, style);
    } catch (_) {}
  }

  function toggleContainerStyle() {
    setContainerStyle(containerStyle.value === "wide" ? "compact" : "wide");
  }

  onMounted(() => {
    containerStyle.value = getInitial();
  });

  return {
    containerStyle,
    isCompact,
    setContainerStyle,
    toggleContainerStyle,
  };
}
