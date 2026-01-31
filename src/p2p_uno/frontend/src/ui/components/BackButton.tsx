import { Button } from "antd";
import { Link } from "react-router-dom";
import "./BackButton.css";

function BackButton({ dest }: { dest: string }) {
    return (
        <Link to={dest}>
            <Button color="default" variant="filled">
                <i className="arrow left"></i> Go Back
            </Button>
        </Link>
    );
}

export default BackButton;
