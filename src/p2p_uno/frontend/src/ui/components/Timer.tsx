import { useCallback, useEffect, useState } from "react";

function Timer({ end_time }: { end_time: number }) {
    const calculateSecondsLeft = useCallback(() => {
        const difference = end_time - Date.now();
        return difference > 0 ? Math.floor(difference / 1000) : 0;
    }, [end_time]);

    const [secondsLeft, setSecondsLeft] = useState(calculateSecondsLeft());

    // 1. Immediate Sync: Update state whenever end_time changes
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSecondsLeft(calculateSecondsLeft());
    }, [end_time, calculateSecondsLeft]);

    // 2. Interval Logic: Handle the countdown ticks
    useEffect(() => {
        if (secondsLeft <= 0) return;

        const timerId = setInterval(() => {
            const remaining = calculateSecondsLeft();
            setSecondsLeft(remaining);

            if (remaining <= 0) {
                clearInterval(timerId);
            }
        }, 1000);

        return () => clearInterval(timerId);
    }, [secondsLeft, calculateSecondsLeft]); // end_time removed here as it's handled above

    const formatTime = (totalSeconds: number) => {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    };

    const color = secondsLeft <= 10 ? "red" : "inherit";

    return <span style={{ color: color }}>{formatTime(secondsLeft)}</span>;
}

export default Timer;
