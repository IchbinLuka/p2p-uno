import { useContext, useState } from "react";
import { APIContext } from "../context";
import { useNavigate } from "react-router-dom";
import { Button, Form, Input, InputNumber } from "antd";
import BackButton from "../components/BackButton";
import Page from "../components/Page";
import { useTranslation } from "react-i18next";

interface FormProps {
    name: string;
    max_players: number;
}

function CreateSession() {
    const { t } = useTranslation();
    const api = useContext(APIContext)!;
    const navigate = useNavigate();

    const [error, setError] = useState("");

    const handleSubmit = (data: FormProps) => {
        console.log(data);
        if (data.max_players < 2 || data.max_players > 10) {
            return;
        }
        if (data.name.length < 3 || data.name.length > 20) {
            return;
        }
        void (async () => {
            const session = await api.createSession(
                data.name,
                data.max_players,
            );
            await navigate(`/session/${session.session_id}?is_host=true`);
        })().catch((error) => setError((error as { message: string }).message));
        // try {
        // } catch (error) {
        //     setError((error as { message: string }).message);
        // }
    };

    return (
        <Page>
            <div style={{ textAlign: "center" }}>
                <h1>{t("session.create")}</h1>
                <Form
                    layout="horizontal"
                    onFinish={handleSubmit}
                    initialValues={{
                        max_players: 6,
                    }}
                    labelCol={{ span: 12 }}
                    wrapperCol={{ span: 16 }}
                    style={{ maxWidth: 600, textAlign: "left" }}
                >
                    <Form.Item<FormProps>
                        label={t("session.name")}
                        name="name"
                        rules={[{ required: true }]}
                    >
                        <Input placeholder={t("session.name_hint")} />
                    </Form.Item>
                    <Form.Item
                        label={t("session.max_player_count")}
                        name="max_players"
                        rules={[{ required: true }]}
                    >
                        <InputNumber min={2} max={10} />
                    </Form.Item>
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "row",
                            justifyContent: "space-around",
                        }}
                    >
                        <BackButton dest="/" />
                        <Button type="primary" htmlType="submit">
                            {t("session.create")}
                        </Button>
                    </div>
                </Form>
                {error && <p>{error}</p>}
            </div>
        </Page>
    );
}

export default CreateSession;
