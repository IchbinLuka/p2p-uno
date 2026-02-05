import { useEffect, useRef, useState } from "react";
import { Color, type CardType } from "../../model/types";
import Card from "../components/Card";
import Page from "../components/Page";
import "./MainGame.css";

function MainGame() {
    const [cards] = useState<CardType[]>([
        {
            color: Color.GREEN,
            number: 1,
        },
        {
            color: Color.RED,
            number: 2,
        },
        {
            color: Color.YELLOW,
            number: 3,
        },
        {
            color: Color.BLUE,
            number: 4,
        },
        {
            color: Color.GREEN,
            number: 1,
        },
        {
            color: Color.RED,
            number: 2,
        },
        {
            color: Color.YELLOW,
            number: 3,
        },
        {
            color: Color.BLUE,
            number: 4,
        },

        {
            color: Color.YELLOW,
            number: 3,
        },
        {
            color: Color.BLUE,
            number: 4,
        },
        {
            color: Color.GREEN,
            number: 1,
        },
        {
            color: Color.RED,
            number: 2,
        },
        {
            color: Color.YELLOW,
            number: 3,
        },
        {
            color: Color.BLUE,
            number: 4,
        },
    ]);

    const barRef = useRef<HTMLDivElement | null>(null);
    const [overlap, setOverlap] = useState<number>(0);

    useEffect(() => {
        const bar = barRef.current;
        if (!bar) return;

        // Measure once and then on resize using ResizeObserver
        const measure = () => {
            if (!bar) return;
            const cardContainers =
                bar.querySelectorAll<HTMLElement>(".card-container");
            const count = cardContainers.length;
            if (count <= 1) {
                setOverlap(0);
                return;
            }

            const first = cardContainers[0];
            const cardRect = first.getBoundingClientRect();
            const style = window.getComputedStyle(first);
            const marginLeft = parseFloat(style.marginLeft || "0");
            const marginRight = parseFloat(style.marginRight || "0");

            const cardFullWidth =
                cardRect.width + marginLeft + marginRight + 10;
            const barInnerWidth = bar.clientWidth;

            const requiredWidth = cardFullWidth * count;
            if (requiredWidth <= barInnerWidth) {
                // No overlap needed
                setOverlap(-10);
                return;
            }

            // Excess width we need to eliminate by overlapping neighboring cards
            const excess = requiredWidth - barInnerWidth;

            // Distribute the excess across the gaps between cards (count - 1)
            let overlapPerGap = excess / (count - 1);

            // Cap overlap so it never completely hides the card (for safety)
            const maxOverlap = cardRect.width * 0.9; // never overlap more than 90% of card width
            if (overlapPerGap > maxOverlap) overlapPerGap = maxOverlap;

            // Ensure non-negative
            overlapPerGap = Math.max(-10, overlapPerGap);

            setOverlap(overlapPerGap);
        };

        // Initial measurement
        measure();

        // ResizeObserver for container changes
        const ro = new ResizeObserver(() => measure());
        ro.observe(bar);

        // Also observe the first card for dimension changes (font-loads etc.)
        const firstCard = bar.querySelector(".card-container");
        if (firstCard) ro.observe(firstCard);

        // Window resize as a fallback
        const onResize = () => measure();
        window.addEventListener("resize", onResize);

        return () => {
            ro.disconnect();
            window.removeEventListener("resize", onResize);
        };
    }, [cards.length, barRef]);

    // Inline style to set the CSS variable on the card-bar
    const barStyle: React.CSSProperties & { [key: string]: string } = {
        // Set the CSS variable --card-overlap in pixels
        ["--card-overlap"]: `${-overlap}px`,
    };

    return (
        <Page>
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                }}
            >
                <div style={{ flexGrow: 1 }}>Test</div>
                <div
                    ref={barRef}
                    style={{
                        width: "100vw",
                        display: "flex",
                        flexDirection: "row",
                        placeContent: "center",
                    }}
                >
                    <div className="card-bar" style={barStyle}>
                        {cards.map((card: CardType, i: number) => (
                            <div key={i} className="card-container">
                                <Card card={card} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Page>
    );
}
export default MainGame;
