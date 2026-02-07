import { Button } from "antd";
import { Link } from "react-router-dom";
import "./BackButton.css";
import { useTranslation } from "react-i18next";
import { usePreserveName } from "../utils";
import type { ReactNode } from "react";

function BackButton({
    dest,
    children,
}: {
    dest: string;
    children?: ReactNode;
}) {
    const { t } = useTranslation();
    const destination = usePreserveName(dest);
    return (
        <Link to={destination}>
            <Button color="default" variant="filled">
                <i className="arrow left"></i> {children || t("go_back")}
            </Button>
        </Link>
    );
}

export default BackButton;
