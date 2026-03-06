import { useSyncExternalStore } from "react";
import type { ValueListenable } from "../model/value_notifier";
import { useSearchParams } from "react-router-dom";

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

export function usePreserveName(to: string): string {
    const [query_params, _] = useSearchParams();

    const player_name = query_params.get("name");

    return player_name != null ? `${to}?name=${player_name}` : to;
}
