import { useEffect, useRef, useState } from "react";
import { Color, type CardType } from "../../model/types";
import Card from "../components/Card";
import Page from "../components/Page";
import "./MainGame.css";
import type { GameRunning, GameState, UICard } from "../../model/model";
import { useValueListenable } from "../utils";
import { Button } from "antd";
import LoadingIndicator from "../components/LoadingIndicator";

function MainGame({ game }: { game: GameRunning }) {
    const state = useValueListenable(game.state);

    if (state === "preparing") {
        return (
            <Page>
                <div style={{ placeContent: "center", height: "100%" }}>
                    <LoadingIndicator title="Preparing..." />
                </div>
            </Page>
        );
    }

    if (state == null) {
        return <Page>Error: Game state not found</Page>;
    }

    function on_card_clicked(card: UICard) {
        game.play_card(card).catch((e) => {
            console.error(e);
        });
    }

    function on_draw() {
        game.draw_card().catch((e) => {
            console.error(e);
        });
    }

    return (
        <Page hide_footer>
            <GameVis
                state={state}
                on_card_clicked={on_card_clicked}
                own_name={game.own_name}
                on_draw={on_draw}
            />
        </Page>
    );
}

function GameVis({
    state,
    on_card_clicked,
    on_draw,
    own_name,
}: {
    state: GameState;
    on_card_clicked?: (card: UICard) => void;
    on_draw?: () => void;
    own_name: string;
}) {
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
    }, [state.own_cards.length, barRef]);

    function card_active(card: CardType): boolean {
        if (state.current_player !== own_name) return false;
        if (state.top_card == null) return true;
        return (
            state.top_card?.color === card.color ||
            state.top_card?.number === card.number
        );
    }

    // Inline style to set the CSS variable on the card-bar
    const barStyle: React.CSSProperties & { [key: string]: string } = {
        // Set the CSS variable --card-overlap in pixels
        ["--card-overlap"]: `${-overlap}px`,
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                marginTop: 5,
            }}
        >
            <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-around",
                }}
            >
                {Object.entries(state.player_card_counts)
                    .filter(([name, _]) => name !== own_name)
                    .map(([name, count]) => (
                        <PlayerState
                            key={name}
                            name={name}
                            card_count={count}
                            has_turn={state.current_player === name}
                        />
                    ))}
            </div>
            <div
                style={{
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                }}
            >
                {state.top_card != null && (
                    <>
                        <Card card={state.top_card} />
                        <h3>Current Card</h3>
                    </>
                )}
            </div>
            <div>
                {state.current_player === own_name && (
                    <Button onClick={on_draw}>Draw Card</Button>
                )}
            </div>
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
                    {state.own_cards.map((card: UICard) => {
                        const active = card_active(card.card_type);
                        return (
                            <>
                                <div
                                    key={card.uuid}
                                    className={`card-container ${active ? "card-container-active" : "card-container-unactive"}`}
                                    onClick={
                                        active
                                            ? () => on_card_clicked?.(card)
                                            : undefined
                                    }
                                >
                                    <Card
                                        card={card.card_type}
                                        active={active}
                                    />
                                </div>
                            </>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function PlayerState({
    name,
    card_count,
    has_turn,
}: {
    name: string;
    card_count: number;
    has_turn: boolean;
}) {
    let classname = "player-state-card";
    if (has_turn) {
        classname += " has-turn";
    }
    return (
        <div>
            <div className={classname}>
                <h3>{card_count}</h3>
            </div>
            <h4>{name}</h4>
        </div>
    );
}

export function GameVisTest() {
    const [state] = useState<GameState>({
        current_player: "alice",
        player_card_counts: {
            bob: 7,
            alice: 5,
            eeve: 3,
        },
        top_card: {
            color: Color.RED,
            number: 3,
        },
        own_cards: [
            {
                card_type: {
                    color: Color.RED,
                    number: 3,
                },
                uuid: "1234567890",
            },
            {
                card_type: {
                    color: Color.BLUE,
                    number: 2,
                },
                uuid: "0987654321",
            },
            {
                card_type: {
                    color: Color.GREEN,
                    number: 1,
                },
                uuid: "1122334455",
            },
            {
                card_type: {
                    color: Color.YELLOW,
                    number: 4,
                },
                uuid: "5566778899",
            },
            {
                card_type: {
                    color: Color.RED,
                    number: 9,
                },
                uuid: "9988776655",
            },
        ],
    });
    return (
        <Page>
            <GameVis
                state={state}
                own_name="alice"
                on_card_clicked={(card) => {
                    console.log(`Card clicked: ${JSON.stringify(card)}`);
                }}
            />
        </Page>
    );
}

export default MainGame;
