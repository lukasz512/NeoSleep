import { describe, it, expect } from "vitest";
import { useNotifications } from "./useNotifications";
describe("useNotifications", () => {
    it("returns current as null when no notifications", () => {
        const { current } = useNotifications();
        expect(current.value).toBeNull();
    });
    it("show adds a notification and current is set", () => {
        const { current, show, dismissCurrent } = useNotifications();
        show("Test message", "info");
        expect(current.value).not.toBeNull();
        expect(current.value?.message).toBe("Test message");
        expect(current.value?.type).toBe("info");
        dismissCurrent();
    });
    it("dismissCurrent removes top notification", () => {
        const { current, show, dismissCurrent } = useNotifications();
        show("One");
        show("Two");
        dismissCurrent();
        expect(current.value?.message).toBe("Two");
        dismissCurrent();
        expect(current.value).toBeNull();
    });
    it("dismiss(id) removes specific notification", () => {
        const { notifications, show, dismiss } = useNotifications();
        show("A");
        show("B");
        const id = notifications.value[1].id;
        dismiss(id);
        expect(notifications.value).toHaveLength(1);
        expect(notifications.value[0].message).toBe("A");
        dismiss(notifications.value[0].id);
    });
});
