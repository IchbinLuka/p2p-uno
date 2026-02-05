import { Color, type CardType } from "../../model/types";
import "./Card.css";

const COLOR_CLASS_MAP: Record<Color, string> = {
    [Color.BLUE]: "card-blue",
    [Color.RED]: "card-red",
    [Color.GREEN]: "card-green",
    [Color.YELLOW]: "card-yellow",
};

function Card({ card }: { card: CardType }) {
    const color_class = COLOR_CLASS_MAP[card.color];
    return (
        <div className={`card ${color_class}`}>
            <svg width={70} height={100} xmlns="https://www.w3.org/2000/svg">
                <text
                    x="50%"
                    y="55%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="100px"
                    fill="white"
                    stroke="black"
                    paintOrder="stroke fill"
                    strokeWidth="10"
                >
                    {card.number}
                </text>
            </svg>
        </div>
    );
}

export default Card;
