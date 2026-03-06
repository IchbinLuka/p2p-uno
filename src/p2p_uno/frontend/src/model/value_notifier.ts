/**
 * A minimal ValueNotifier implementation inspired by Flutter's ValueNotifier.
 *
 * This provides a simple observable wrapper around a value. Consumers can
 * register listeners that will be notified whenever the value changes.
 *
 * Usage:
 *   const counter = new ValueNotifier<number>(0);
 *   const listener = (v?: number) => console.log('value changed to', v);
 *   counter.addListener(listener);
 *   counter.value = 1; // => "value changed to 1"
 *   counter.removeListener(listener);
 *   counter.dispose();
 */

export type ValueListener<T> = (value?: T) => void;

/**
 * Interface describing a value-listenable object.
 */
export interface ValueListenable<T> {
    /**
     * Current value.
     */
    readonly value: T;

    /**
     * Register a listener. The listener will be called when the value changes.
     * The listener receives the new value as an optional argument.
     */
    addListener(listener: ValueListener<T>): void;

    /**
     * Remove a previously-registered listener.
     */
    removeListener(listener: ValueListener<T>): void;
}

/**
 * A simple ValueNotifier implementation.
 */
export class ValueNotifier<T> implements ValueListenable<T> {
    private _value: T;
    private listeners: Set<ValueListener<T>>;
    private _disposed: boolean = false;

    constructor(initialValue: T) {
        this._value = initialValue;
        this.listeners = new Set();
    }

    /**
     * Current value. Setting this will notify listeners if the value changes.
     */
    public get value(): T {
        return this._value;
    }

    public set value(newValue: T) {
        this._throwIfDisposed();
        // Only notify when the value actually changes.
        if (newValue !== this._value) {
            this._value = newValue;
            this.notifyListeners();
        }
    }

    /**
     * Register a listener. Listeners are called with the new value when it changes.
     * Registering the same function multiple times has no additional effect.
     */
    public addListener(listener: ValueListener<T>): void {
        this._throwIfDisposed();
        this.listeners.add(listener);
    }

    /**
     * Remove a previously-registered listener.
     */
    public removeListener(listener: ValueListener<T>): void {
        this._throwIfDisposed();
        this.listeners.delete(listener);
    }

    /**
     * Notify all registered listeners with the current value.
     * This can be used to force notifications even if the value hasn't changed.
     */
    public notifyListeners(): void {
        this._throwIfDisposed();
        // Make a shallow copy to allow listeners to add/remove while iterating.
        for (const l of this.listeners) {
            try {
                l(this._value);
            } catch (e) {
                // Swallow listener errors so one failing listener doesn't prevent
                // others from receiving updates.
                console.error(e);
            }
        }
    }

    /**
     * Remove all listeners.
     */
    public clearListeners(): void {
        this._throwIfDisposed();
        this.listeners.clear();
    }

    /**
     * Dispose the notifier. After disposal, operations will throw.
     * All listeners are removed.
     */
    public dispose(): void {
        if (this._disposed) return;
        this.listeners.clear();
        this._disposed = true;
    }

    private _throwIfDisposed(): void {
        if (this._disposed) {
            throw new Error("ValueNotifier has been disposed");
        }
    }
}
