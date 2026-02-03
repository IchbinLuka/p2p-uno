import { Button } from "antd";
import { Link } from "react-router-dom";
import "./BackButton.css";
import { useTranslation } from "react-i18next";

function BackButton({ dest }: { dest: string }) {
    const { t } = useTranslation();
    return (
        <Link to={dest}>
            <Button color="default" variant="filled">
                <i className="arrow left"></i> {t("go_back")}
            </Button>
        </Link>
    );
}

export default BackButton;
