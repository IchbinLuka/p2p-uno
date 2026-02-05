import { useSyncExternalStore } from "react";
import type { ValueListenable } from "../model/util";

export function useValueListenable<T>(
    notifier: ValueListenable<T> | null | undefined,
): T | null {
    return useSyncExternalStore(
        (onStoreChange) => {
            if (!notifier) return () => {};
            const listener = () => onStoreChange();
            notifier.addListener(listener);
            return () => notifier.removeListener(listener);
        },
        () => (notifier ? notifier.value : null),
    );
}
