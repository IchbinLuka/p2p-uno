import { Typography } from "antd";
import Page from "../components/Page";
import Title from "antd/es/typography/Title";
import Paragraph from "antd/es/typography/Paragraph";
import { useTranslation } from "react-i18next";
import BackButton from "../components/BackButton";
import PageTitle from "../components/PageTitle";

function Credits() {
    const { t } = useTranslation();
    return (
        <Page>
            <PageTitle>{t("credits.title")}</PageTitle>
            <Typography style={{ flexGrow: 1 }}>
                <Paragraph>{t("credits.thanks_for_playing")}</Paragraph>
                <Paragraph>{t("credits.contributions_text")}</Paragraph>
                <Title level={2}>{t("credits.asset_attributions")}</Title>
                <Paragraph>
                    Crown by Alejandro from{" "}
                    <a
                        href="https://thenounproject.com/browse/icons/term/crown/"
                        target="_blank"
                        title="Crown Icons"
                    >
                        Noun Project
                    </a>{" "}
                    (CC BY 3.0)
                </Paragraph>
            </Typography>
            <div style={{ marginBottom: 20 }}>
                <BackButton dest="/" />
            </div>
        </Page>
    );
}

export default Credits;
